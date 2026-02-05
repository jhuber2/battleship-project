(() => {
  const SIZE = 10;
  const SHIP_SIZES = [3, 4, 5];

  // Flask backend
  const API_BASE = "http://localhost:5000/api";

  const elPlayerGrid = document.getElementById("playerGrid");
  const elCpuGrid = document.getElementById("cpuGrid");
  const elStatus = document.getElementById("statusText");
  const elPhasePill = document.getElementById("phasePill");
  const elRotatePill = document.getElementById("rotatePill");
  const elTurnPill = document.getElementById("turnPill");
  const elShipsLeftPill = document.getElementById("shipsLeftPill");
  const btnRestart = document.getElementById("btnRestart");
  const btnNew = document.getElementById("btnNew");

  // client UI state (NOT authoritative game state)
  let rotation = 0; // 0 horizontal, 1 vertical

  // session + server state snapshot
  let sid = null;
  let snapshot = null;

  // hover tracking for instant rotate preview
  let lastHover = { r: null, c: null, active: false };

  // ---------- helpers ----------
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  const coordKey = (r, c) => `${r},${c}`;

  function setStatus(msg) {
    elStatus.textContent = msg;
  }

  async function api(path, body = null) {
    const opts = body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "GET" };

    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || "Server error");
    }
    return data;
  }

  function cellsForPlacement(startR, startC, length, rot) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      const r = startR + (rot === 1 ? i : 0);
      const c = startC + (rot === 0 ? i : 0);
      cells.push({ r, c });
    }
    return cells;
  }

  function clearPreview() {
    for (const cell of elPlayerGrid.querySelectorAll(".cell")) {
      cell.classList.remove("preview-ok", "preview-bad");
    }
  }

  function occupiedSetFromPlayerShips() {
    const set = new Set();
    for (const ship of (snapshot?.player_ships || [])) {
      for (const cell of ship.cells) set.add(coordKey(cell.r, cell.c));
    }
    return set;
  }

  function isValidPreview(cells) {
    const occ = occupiedSetFromPlayerShips();
    for (const cell of cells) {
      if (!inBounds(cell.r, cell.c)) return false;
      if (occ.has(coordKey(cell.r, cell.c))) return false;
    }
    return true;
  }

  function applyPreviewAt(r, c) {
    if (!snapshot || snapshot.phase !== "placing") return;

    const idx = snapshot.player_ships.length;
    const len = SHIP_SIZES[idx];
    if (!len) return;

    const cells = cellsForPlacement(r, c, len, rotation);
    const valid = isValidPreview(cells);

    clearPreview();
    for (const cell of cells) {
      if (!inBounds(cell.r, cell.c)) continue;
      const el = elPlayerGrid.querySelector(`.cell[data-r="${cell.r}"][data-c="${cell.c}"]`);
      if (el) el.classList.add(valid ? "preview-ok" : "preview-bad");
    }
  }

  // ---------- rendering ----------
  function buildGrid(el, handlers) {
    el.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.tabIndex = 0;
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);

        if (handlers?.enter) cell.addEventListener("mouseenter", () => handlers.enter(r, c));
        if (handlers?.leave) cell.addEventListener("mouseleave", () => handlers.leave());
        if (handlers?.click) cell.addEventListener("click", () => handlers.click(r, c));

        cell.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handlers?.click?.(r, c);
          }
        });

        el.appendChild(cell);
      }
    }
  }

  function render() {
    if (!snapshot) return;

    // pills
    elPhasePill.textContent =
      snapshot.phase === "placing" ? "Phase: Placing" :
      snapshot.phase === "playing" ? "Phase: Battle" :
      "Phase: Game Over";

    elRotatePill.textContent = "Rotation: " + (rotation === 0 ? "Horizontal" : "Vertical");

    elTurnPill.textContent =
      snapshot.phase === "playing"
        ? `Turn: ${snapshot.turn === "player" ? "You" : "Computer"}`
        : "Turn: —";

    if (snapshot.phase === "playing" || snapshot.phase === "over") {
      elShipsLeftPill.textContent = `Ships Left — You: ${snapshot.player_remaining} | CPU: ${snapshot.cpu_remaining}`;
    } else {
      elShipsLeftPill.textContent = `Ships: placing ${Math.min(snapshot.player_ships.length + 1, 3)}/3`;
    }

    // render player grid
    const shipOcc = new Set();
    for (const ship of snapshot.player_ships) {
      for (const cell of ship.cells) shipOcc.add(coordKey(cell.r, cell.c));
    }

    elPlayerGrid.querySelectorAll(".cell").forEach((cellEl) => {
      const r = Number(cellEl.dataset.r);
      const c = Number(cellEl.dataset.c);
      cellEl.classList.remove("ship", "hit", "miss", "disabled");

      if (shipOcc.has(coordKey(r, c))) cellEl.classList.add("ship");

      const shot = snapshot.cpu_shots[r][c];
      if (shot === 1) cellEl.classList.add("miss");
      if (shot === 2) cellEl.classList.add("hit");

      if (snapshot.phase !== "placing") cellEl.classList.add("disabled");
    });

    // render cpu grid (only shots are shown)
    elCpuGrid.querySelectorAll(".cell").forEach((cellEl) => {
      const r = Number(cellEl.dataset.r);
      const c = Number(cellEl.dataset.c);
      cellEl.classList.remove("hit", "miss", "disabled");

      const shot = snapshot.player_shots[r][c];
      if (shot === 1) cellEl.classList.add("miss");
      if (shot === 2) cellEl.classList.add("hit");

      const alreadyShot = shot !== 0;
      const disabled =
        snapshot.phase !== "playing" || snapshot.turn !== "player" || alreadyShot;

      if (disabled) cellEl.classList.add("disabled");
    });
  }

  // ---------- actions ----------
  async function ensureSession() {
    const stored = localStorage.getItem("battleship_sid");
    if (stored) {
      sid = stored;
      try {
        const data = await api(`/state?sid=${encodeURIComponent(sid)}`);
        snapshot = data.state;
        setStatus("Session loaded from server.");
        render();
        return;
      } catch {
        // session missing/expired on server; create new
      }
    }

    const created = await api("/new", {});
    sid = created.sid;
    localStorage.setItem("battleship_sid", sid);
    snapshot = created.state;
    setStatus("New session created. Place your ship of length 3.");
    render();
  }

  async function placeShipAt(r, c) {
    if (!snapshot || snapshot.phase !== "placing") return;

    const idx = snapshot.player_ships.length;
    const len = SHIP_SIZES[idx];
    if (!len) return;

    try {
      const data = await api("/place_ship", {
        sid,
        start: { r, c },
        rotation,
        length: len
      });
      snapshot = data.state;
      clearPreview();

      if (snapshot.phase === "playing") {
        setStatus("All ships placed. Your turn! Click the enemy grid to fire.");
      } else {
        const nextLen = SHIP_SIZES[snapshot.player_ships.length];
        setStatus(`Placed! Now place ship of length ${nextLen}. Press R to rotate.`);
      }

      render();
    } catch (e) {
      setStatus(e.message);
    }
  }

  async function fireAt(r, c) {
    if (!snapshot || snapshot.phase !== "playing") return;
    if (snapshot.turn !== "player") return;
    if (snapshot.player_shots[r][c] !== 0) return;

    try {
      const data = await api("/fire", { sid, target: { r, c } });
      snapshot = data.state;

      // server provides a human-readable message of what happened
      if (data.message) setStatus(data.message);

      render();
    } catch (e) {
      setStatus(e.message);
    }
  }

  async function restartGame() {
    try {
      const data = await api("/restart", { sid });
      snapshot = data.state;
      clearPreview();
      setStatus("Restarted. Ship placements kept. Shots reset.");
      render();
    } catch (e) {
      setStatus(e.message);
    }
  }

  async function newGame() {
    try {
      const data = await api("/new_game", { sid });
      snapshot = data.state;
      clearPreview();
      lastHover = { r: null, c: null, active: false };
      setStatus("New game. Place your ship of length 3.");
      render();
    } catch (e) {
      setStatus(e.message);
    }
  }

  // ---------- events ----------
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") {
      rotation = rotation === 0 ? 1 : 0;
      render(); // update pill immediately

      // instant preview redraw
      if (snapshot?.phase === "placing" && lastHover.active && lastHover.r != null) {
        applyPreviewAt(lastHover.r, lastHover.c);
      }
    }
  });

  btnRestart.addEventListener("click", restartGame);
  btnNew.addEventListener("click", newGame);

  // ---------- init ----------
  function init() {
    buildGrid(elPlayerGrid, {
      enter: (r, c) => {
        lastHover = { r, c, active: true };
        applyPreviewAt(r, c);
      },
      leave: () => {
        lastHover.active = false;
        clearPreview();
      },
      click: (r, c) => placeShipAt(r, c),
    });

    buildGrid(elCpuGrid, {
      click: (r, c) => fireAt(r, c),
    });

    ensureSession();
  }

  init();
})();
