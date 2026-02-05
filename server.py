from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, asdict
from typing import Dict, List, Tuple, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow XAMPP (localhost) to call Flask (localhost:5000)

SIZE = 10
SHIP_SIZES = [3, 4, 5]

# In-memory sessions (server-authoritative)
SESSIONS: Dict[str, dict] = {}


def make_grid(fill: int = 0) -> List[List[int]]:
  return [[fill for _ in range(SIZE)] for _ in range(SIZE)]


def in_bounds(r: int, c: int) -> bool:
  return 0 <= r < SIZE and 0 <= c < SIZE


def coord_key(r: int, c: int) -> str:
  return f"{r},{c}"


def cells_for_placement(start_r: int, start_c: int, length: int, rotation: int) -> List[Tuple[int, int]]:
  # rotation: 0 horiz (right), 1 vert (down)
  cells = []
  for i in range(length):
    r = start_r + (i if rotation == 1 else 0)
    c = start_c + (i if rotation == 0 else 0)
    cells.append((r, c))
  return cells


def overlaps(cells: List[Tuple[int, int]], ships: List[dict]) -> bool:
  occ = set()
  for s in ships:
    for (r, c) in s["cells"]:
      occ.add(coord_key(r, c))
  return any(coord_key(r, c) in occ for (r, c) in cells)


def valid_placement(cells: List[Tuple[int, int]], ships: List[dict]) -> bool:
  for (r, c) in cells:
    if not in_bounds(r, c):
      return False
  if overlaps(cells, ships):
    return False
  return True


def place_ship(ships: List[dict], cells: List[Tuple[int, int]]) -> None:
  ships.append({"cells": cells, "hits": []})


def find_ship_at(ships: List[dict], r: int, c: int) -> Optional[int]:
  for si, s in enumerate(ships):
    for (sr, sc) in s["cells"]:
      if sr == r and sc == c:
        return si
  return None


def mark_hit(ships: List[dict], ship_index: int, r: int, c: int) -> None:
  key = coord_key(r, c)
  hits = ships[ship_index]["hits"]
  if key not in hits:
    hits.append(key)


def ship_sunk(ship: dict) -> bool:
  return len(ship["hits"]) >= len(ship["cells"])


def all_sunk(ships: List[dict]) -> bool:
  return all(ship_sunk(s) for s in ships)


def remaining(ships: List[dict]) -> int:
  return sum(0 if ship_sunk(s) else 1 for s in ships)


def place_cpu_ships() -> List[dict]:
  ships: List[dict] = []
  for length in SHIP_SIZES:
    placed = False
    guard = 0
    while not placed and guard < 5000:
      guard += 1
      rotation = random.randint(0, 1)
      r = random.randint(0, SIZE - 1)
      c = random.randint(0, SIZE - 1)
      cells = cells_for_placement(r, c, length, rotation)
      if valid_placement(cells, ships):
        place_ship(ships, cells)
        placed = True
    if not placed:
      raise RuntimeError("Failed to place CPU ships")
  return ships


def new_state() -> dict:
  return {
    "phase": "placing",
    "turn": "player",
    "player_ships": [],
    "cpu_ships": place_cpu_ships(),      # hidden from client
    "player_shots": make_grid(0),        # shots at cpu
    "cpu_shots": make_grid(0),           # shots at player
  }


def reset_shots_keep_ships(s: dict) -> None:
  s["player_shots"] = make_grid(0)
  s["cpu_shots"] = make_grid(0)
  s["turn"] = "player"
  # reset hits
  for ship in s["player_ships"]:
    ship["hits"] = []
  for ship in s["cpu_ships"]:
    ship["hits"] = []


def sanitize_for_client(s: dict) -> dict:
  # client gets player ships (visible), but NOT cpu ship locations
  return {
    "phase": s["phase"],
    "turn": s["turn"],
    "player_ships": [
      {"cells": [{"r": r, "c": c} for (r, c) in ship["cells"]]}
      for ship in s["player_ships"]
    ],
    "player_shots": s["player_shots"],
    "cpu_shots": s["cpu_shots"],
    "player_remaining": remaining(s["player_ships"]) if s["player_ships"] else 3,
    "cpu_remaining": remaining(s["cpu_ships"]),
  }


def require_session(sid: str) -> dict:
  if sid not in SESSIONS:
    raise KeyError("Invalid or expired session id. Click New Game.")
  return SESSIONS[sid]


def ok(state: dict, message: str = ""):
  return jsonify({"ok": True, "state": sanitize_for_client(state), "message": message})


def err(msg: str, status: int = 400):
  return jsonify({"ok": False, "error": msg}), status


@app.get("/api/state")
def api_state():
  sid = request.args.get("sid", "")
  if not sid:
    return err("Missing sid")
  try:
    s = require_session(sid)
    return ok(s, "")
  except KeyError:
    return err("Invalid session id", 404)


@app.post("/api/new")
def api_new():
  sid = str(uuid.uuid4())
  s = new_state()
  SESSIONS[sid] = s
  return jsonify({"ok": True, "sid": sid, "state": sanitize_for_client(s)})


@app.post("/api/new_game")
def api_new_game():
  data = request.get_json(force=True)
  sid = data.get("sid", "")
  if not sid:
    return err("Missing sid")
  try:
    s = require_session(sid)
    SESSIONS[sid] = new_state()
    return ok(SESSIONS[sid], "New game created. Place your ship of length 3.")
  except KeyError:
    return err("Invalid session id", 404)


@app.post("/api/restart")
def api_restart():
  data = request.get_json(force=True)
  sid = data.get("sid", "")
  if not sid:
    return err("Missing sid")
  try:
    s = require_session(sid)

    # If player hasn't placed all ships yet, treat restart as "reset shots (none) and keep placed ships"
    reset_shots_keep_ships(s)

    if len(s["player_ships"]) == len(SHIP_SIZES):
      s["phase"] = "playing"
      return ok(s, "Restarted. Same ship placements. Your turn to fire.")
    else:
      s["phase"] = "placing"
      return ok(s, "Restarted placement. Continue placing your remaining ships.")
  except KeyError:
    return err("Invalid session id", 404)


@app.post("/api/place_ship")
def api_place_ship():
  data = request.get_json(force=True)
  sid = data.get("sid", "")
  start = data.get("start", {})
  rotation = int(data.get("rotation", 0))
  length = int(data.get("length", 0))

  if not sid:
    return err("Missing sid")
  if "r" not in start or "c" not in start:
    return err("Missing start coords")
  if rotation not in (0, 1):
    return err("Invalid rotation")
  if length not in SHIP_SIZES:
    return err("Invalid ship length")

  try:
    s = require_session(sid)

    if s["phase"] != "placing":
      return err("Not in placement phase")

    idx = len(s["player_ships"])
    expected = SHIP_SIZES[idx] if idx < len(SHIP_SIZES) else None
    if expected is None:
      return err("All ships already placed")
    if length != expected:
      return err(f"Expected ship length {expected}, got {length}")

    r = int(start["r"])
    c = int(start["c"])
    cells = cells_for_placement(r, c, length, rotation)
    if not valid_placement(cells, s["player_ships"]):
      return err("Invalid placement: out of bounds or overlapping")

    place_ship(s["player_ships"], cells)

    if len(s["player_ships"]) == len(SHIP_SIZES):
      s["phase"] = "playing"
      s["turn"] = "player"
      return ok(s, "All ships placed. Your turn! Click enemy grid to fire.")
    else:
      nxt = SHIP_SIZES[len(s["player_ships"])]
      return ok(s, f"Ship placed. Now place ship of length {nxt}.")
  except KeyError:
    return err("Invalid session id", 404)


def cpu_fire(s: dict) -> Tuple[int, int, bool, bool]:
  # pick random untargeted cell on player board
  candidates = [(r, c) for r in range(SIZE) for c in range(SIZE) if s["cpu_shots"][r][c] == 0]
  if not candidates:
    return (0, 0, False, False)
  r, c = random.choice(candidates)

  ship_index = find_ship_at(s["player_ships"], r, c)
  if ship_index is not None:
    s["cpu_shots"][r][c] = 2
    mark_hit(s["player_ships"], ship_index, r, c)
    sunk = ship_sunk(s["player_ships"][ship_index])
    return (r, c, True, sunk)
  else:
    s["cpu_shots"][r][c] = 1
    return (r, c, False, False)


@app.post("/api/fire")
def api_fire():
  data = request.get_json(force=True)
  sid = data.get("sid", "")
  target = data.get("target", {})

  if not sid:
    return err("Missing sid")
  if "r" not in target or "c" not in target:
    return err("Missing target coords")

  try:
    s = require_session(sid)

    if s["phase"] != "playing":
      return err("Not in battle phase")
    if s["turn"] != "player":
      return err("Not your turn")

    r = int(target["r"])
    c = int(target["c"])
    if not in_bounds(r, c):
      return err("Out of bounds")

    if s["player_shots"][r][c] != 0:
      return err("You already fired there")

    # Player fires at CPU
    cpu_ship_index = find_ship_at(s["cpu_ships"], r, c)
    msg_parts = []

    if cpu_ship_index is not None:
      s["player_shots"][r][c] = 2
      mark_hit(s["cpu_ships"], cpu_ship_index, r, c)
      sunk = ship_sunk(s["cpu_ships"][cpu_ship_index])
      msg_parts.append("Hit!" + (" You sunk a ship!" if sunk else ""))
    else:
      s["player_shots"][r][c] = 1
      msg_parts.append("Miss.")

    # Check win
    if all_sunk(s["cpu_ships"]):
      s["phase"] = "over"
      s["turn"] = "player"
      return ok(s, "You win! Press Restart Game or New Game.")

    # CPU turn immediately after
    s["turn"] = "cpu"
    cr, cc, hit, sunk = cpu_fire(s)

    # Check loss
    if all_sunk(s["player_ships"]):
      s["phase"] = "over"
      s["turn"] = "cpu"
      return ok(s, "Computer fired back and you lost. Press Restart Game or New Game.")

    # back to player
    s["turn"] = "player"
    msg_parts.append("Computer " + ("hit you" + (" and sunk a ship!" if sunk else "!") if hit else "missed. Your turn!"))

    return ok(s, " ".join(msg_parts))

  except KeyError:
    return err("Invalid session id", 404)


if __name__ == "__main__":
  # Run: python server.py
  app.run(host="127.0.0.1", port=5000, debug=True)
