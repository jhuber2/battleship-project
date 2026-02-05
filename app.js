/* Battleship (local, single-page)
   - 10x10 boards
   - 3 ships: 3,4,5
   - Player places ships w/ translucent hover preview
   - ONLY 'R' rotates
   - Rotation updates preview immediately (no mouse move needed)
   - Two buttons: Restart (keep ship placements), New Game (reset everything)
   - localStorage persistence
*/

(() => {
  const SIZE = 10;
  const SHIP_SIZES = [3, 4, 5];
  const LS_KEY = "battleshipStateV2";

  const elPlayerGrid = document.getElementById("playerGrid");
  const elCpuGrid = document.getElementById("cpuGrid");
  const elStatus = document.getElementById("statusText");
  const elPhasePill = document.getElementById("phasePill");
  const elRotatePill = document.getElementById("rotatePill");
  const elTurnPill = document.getElementById("turnPill");
  const elShipsLeftPill = document.getElementById("shipsLeftPill");
  const btnRestart = document.getElementById("btnRestart");
  const btnNew = document.getElementById("btnNew");

  // Track the last hovered cell on the player grid so we can re-render preview instantly on 'R'
  let lastHover = { r: null, c: null, active: false };

  /** STATE SHAPE
   * phase: "placing" | "playing" | "over"
   * rotation: 0 (horizontal) | 1 (vertical)
   * placementIndex: 0..SHIP_SIZES.length
   * playerShips: [{cells:[{r,c}], hits:[ "r,c", ... ]}]
   * cpuShips: same
   * playerShots: 10x10: 0 unknown, 1 miss, 2 hit
   * cpuShots: 10x10: 0 unknown, 1 miss, 2 hit
   * turn: "player" | "cpu"
   */
  let state = null;

  // ---------- Utils ----------
  const makeGrid = (fill = 0) =>
    Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => fill));

  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  const coordKey = (r, c) => `${r},${c}`;

  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function setStatus(text) {
    elStatus.textContent = text;
  }

  function currentShipSize() {
    return SHIP_SIZES[state.placementIndex] ?? null;
  }

  // ---------- Placement logic ----------
  function cellsForPlacement(startR, startC, length, rotation) {
    // rotation: 0 horizontal (right), 1 vertical (down)
    const cells = [];
    for (let i = 0; i < length; i++) {
      const r = startR + (rotation === 1 ? i : 0);
      const c = startC + (rotation === 0 ? i : 0);
      cells.push({ r, c });
    }
    return cells;
  }

  function shipOverlaps(cells, ships) {
    const occupied = new Set();
    for (const s of ships) {
      for (const cell of s.cells) occupied.add(coordKey(cell.r, cell.c));
    }
    return cells.some((cell) => occupied.has(coordKey(cell.r, cell.c)));
  }

  function isValidPlacement(cells, ships) {
    for (const cell of cells) {
      if (!inBounds(cell.r, cell.c)) return false;
    }
    if (shipOverlaps(cells, ships)) return false;
    return true;
  }

  function placeShip(ships, cells) {
    ships.push({ cells, hits: [] });
  }

  // ---------- CPU ship placement ----------
  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function placeCpuShips() {
    const ships = [];
    for (const len of SHIP_SIZES) {
      let placed = false;
      let guard = 0;

      while (!placed && guard < 5000) {
        guard++;
        const rotation = randomInt(2); // 0/1
        const r = randomInt(SIZE);
        const c = randomInt(SIZE);
        const cells = cellsForPlacement(r, c, len, rotation);
        if (isValidPlacement(cells, ships)) {
          placeShip(ships, cells);
          placed = true;
        }
      }

      if (!placed) throw new Error("Failed to place CPU ships. Try New Game.");
    }
    return ships;
  }

  // ---------- Hits / sinks ----------
  function findShipAt(ships, r, c) {
    for (let si = 0; si < ships.length; si++) {
      const ship = ships[si];
      for (let ci = 0; ci < ship.cells.length; ci++) {
        const cell = ship.cells[ci];
        if (cell.r === r && cell.c === c) return { shipIndex: si, cellIndex: ci };
      }
    }
    return null;
  }

  function markHit(ships, shipIndex, r, c) {
    const ship = ships[shipIndex];
    const key = coordKey(r, c);
    if (!ship.hits.includes(key)) ship.hits.push(key);
  }

  function isShipSunk(ship) {
    return ship.hits.length >= ship.cells.length;
  }

  function allShipsSunk(ships) {
    return ships.every(isShipSunk);
  }

  function remainingShipsCount(ships) {
    return ships.filter((s) => !isShipSunk(s)).length;
  }

  // ---------- Preview rendering ----------
  function clearPreview() {
    for (const cell of elPlayerGrid.querySelectorAll(".cell")) {
      cell.classList.remove("preview-ok", "preview-bad");
    }
  }

  function applyPreviewAt(r, c) {
    // Only show preview during placement, and only if we have a current ship
    if (state.phase !== "placing") return;
    const len = currentShipSize();
    if (!len) return;

    const cells = cellsForPlacement(r, c, len, state.rotation);
    const valid = isValidPlacement(cells, state.playerShips);

    clearPreview();

    // Color only in-bounds cells; if any out-of-bounds -> valid=false already
    for (const cell of cells) {
      if (!inBounds(cell.r, cell.c)) continue;
      const cellEl = elPlayerGrid.querySelector(
        `.cell[data-r="${cell.r}"][data-c="${cell.c}"]`
      );
      if (cellEl) cellEl.classList.add(valid ? "preview-ok" : "preview-bad");
    }
  }

  // ---------- Main rendering ----------
  function renderGrids() {
    // Player grid
    const pCells = elPlayerGrid.querySelectorAll(".cell");
    pCells.forEach((cellEl) => {
      const r = Number(cellEl.dataset.r);
      const c = Number(cellEl.dataset.c);

      cellEl.classList.remove("ship", "hit", "miss", "disabled");

      // Ships visible on player grid
      const hasShip = findShipAt(state.playerShips, r, c);
      if (hasShip) cellEl.classList.add("ship");

      // CPU shots on player grid
      const shot = state.cpuShots[r][c];
      if (shot === 1) cellEl.classList.add("miss");
      if (shot === 2) cellEl.classList.add("hit");

      if (state.phase !== "placing") cellEl.classList.add("disabled");
    });

    // CPU grid
    const cCells = elCpuGrid.querySelectorAll(".cell");
    cCells.forEach((cellEl) => {
      const r = Number(cellEl.dataset.r);
      const c = Number(cellEl.dataset.c);

      cellEl.classList.remove("hit", "miss", "disabled");

      const shot = state.playerShots[r][c];
      if (shot === 1) cellEl.classList.add("miss");
      if (shot === 2) cellEl.classList.add("hit");

      const alreadyShot = shot !== 0;
      const disabled =
        state.phase !== "playing" || state.turn !== "player" || alreadyShot;
      if (disabled) cellEl.classList.add("disabled");
    });

    // Pills
    elPhasePill.textContent =
      state.phase === "placing" ? "Phase: Placing" :
      state.phase === "playing" ? "Phase: Battle" :
      "Phase: Game Over";

    elRotatePill.textContent =
      "Rotation: " + (state.rotation === 0 ? "Horizontal" : "Vertical");

    elTurnPill.textContent =
      state.phase === "playing"
        ? `Turn: ${state.turn === "player" ? "You" : "Computer"}`
        : "Turn: —";

    if (state.phase === "playing" || state.phase === "over") {
      const youLeft = remainingShipsCount(state.playerShips);
      const cpuLeft = remainingShipsCount(state.cpuShips);
      elShipsLeftPill.textContent = `Ships Left — You: ${youLeft} | CPU: ${cpuLeft}`;
    } else {
      elShipsLeftPill.textContent = `Ships: placing ${Math.min(state.placementIndex + 1, 3)}/3`;
    }
  }

  function renderPlacementStatus() {
    if (state.phase !== "placing") return;
    const len = currentShipSize();
    if (len != null) {
      setStatus(
        `Place your ship of length ${len}. Hover your board to preview, click to place. Press R to rotate.`
      );
    }
  }

  // ---------- Game flow ----------
  function startNewGame() {
    state = {
      phase: "placing",
      rotation: 0,
      placementIndex: 0,
      playerShips: [],
      cpuShips: placeCpuShips(),
      playerShots: makeGrid(0),
      cpuShots: makeGrid(0),
      turn: "player",
    };

    // reset hover tracking
    lastHover = { r: null, c: null, active: false };

    saveState();
    clearPreview();
    renderPlacementStatus();
    renderGrids();
    setStatus("Place your ship of length 3. Press R to rotate.");
  }

  function restartSamePlacements() {
    const hadAllPlaced = state.playerShips.length === SHIP_SIZES.length;

    state.playerShots = makeGrid(0);
    state.cpuShots = makeGrid(0);
    state.turn = "player";

    // Reset hits
    state.playerShips = state.playerShips.map((s) => ({ ...s, hits: [] }));
    state.cpuShips = state.cpuShips.map((s) => ({ ...s, hits: [] }));

    if (hadAllPlaced) {
      state.phase = "playing";
      setStatus("Restarted! Same ship placements. Your turn to fire.");
    } else {
      state.phase = "placing";
      state.placementIndex = state.playerShips.length;
      setStatus("Restarted placement. Your placed ships stayed. Continue placing.");
    }

    saveState();
    clearPreview();
    renderGrids();
    renderPlacementStatus();
  }

  function finishPlacementIfDone() {
    if (state.playerShips.length === SHIP_SIZES.length) {
      state.phase = "playing";
      state.turn = "player";
      clearPreview();
      setStatus("All ships placed. Your turn! Click the enemy grid to fire.");
    }
  }

  // ---------- Player interactions ----------
  function handlePlayerGridEnter(r, c) {
    if (state.phase !== "placing") return;

    // record last hover position so we can re-apply preview on R press
    lastHover = { r, c, active: true };
    applyPreviewAt(r, c);
  }

  function handlePlayerGridLeave() {
    lastHover.active = false;
    clearPreview();
  }

  function handlePlayerGridClick(r, c) {
    if (state.phase !== "placing") return;

    const len = currentShipSize();
    if (!len) return;

    const cells = cellsForPlacement(r, c, len, state.rotation);
    if (!isValidPlacement(cells, state.playerShips)) {
      setStatus("Invalid placement: out of bounds or overlapping another ship.");
      return;
    }

    placeShip(state.playerShips, cells);
    state.placementIndex = state.playerShips.length;

    clearPreview();
    saveState();
    renderGrids();

    finishPlacementIfDone();

    if (state.phase === "placing") {
      renderPlacementStatus();
      const nextLen = currentShipSize();
      setStatus(`Placed! Now place your ship of length ${nextLen}. Press R to rotate.`);
    } else {
      renderGrids();
      saveState();
    }
  }

  function handleCpuGridClick(r, c) {
    if (state.phase !== "playing") return;
    if (state.turn !== "player") return;
    if (state.playerShots[r][c] !== 0) return;

    const hitInfo = findShipAt(state.cpuShips, r, c);
    if (hitInfo) {
      state.playerShots[r][c] = 2;
      markHit(state.cpuShips, hitInfo.shipIndex, r, c);

      const sunk = isShipSunk(state.cpuShips[hitInfo.shipIndex]);
      setStatus(sunk ? "Hit! You sunk a ship!" : "Hit!");
    } else {
      state.playerShots[r][c] = 1;
      setStatus("Miss.");
    }

    if (allShipsSunk(state.cpuShips)) {
      state.phase = "over";
      state.turn = "player";
      setStatus("You win! Press Restart Game (same ships) or New Game.");
      renderGrids();
      saveState();
      return;
    }

    state.turn = "cpu";
    renderGrids();
    saveState();

    window.setTimeout(cpuFire, 450);
  }

  function cpuFire() {
    if (state.phase !== "playing") return;
    if (state.turn !== "cpu") return;

    const candidates = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.cpuShots[r][c] === 0) candidates.push({ r, c });
      }
    }
    if (candidates.length === 0) {
      state.turn = "player";
      renderGrids();
      saveState();
      return;
    }

    const pick = candidates[randomInt(candidates.length)];
    const r = pick.r, c = pick.c;

    const hitInfo = findShipAt(state.playerShips, r, c);
    if (hitInfo) {
      state.cpuShots[r][c] = 2;
      markHit(state.playerShips, hitInfo.shipIndex, r, c);
      const sunk = isShipSunk(state.playerShips[hitInfo.shipIndex]);
      setStatus(sunk ? "Computer hit you and sunk a ship!" : "Computer hit you!");
    } else {
      state.cpuShots[r][c] = 1;
      setStatus("Computer missed. Your turn!");
    }

    if (allShipsSunk(state.playerShips)) {
      state.phase = "over";
      state.turn = "cpu";
      setStatus("You lost. Press Restart Game (same ships) or New Game.");
      renderGrids();
      saveState();
      return;
    }

    state.turn = "player";
    renderGrids();
    saveState();
  }

  // ---------- DOM setup ----------
  function buildGrid(el, onEnter, onLeave, onClick) {
    el.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.tabIndex = 0;
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);

        if (onEnter) cell.addEventListener("mouseenter", () => onEnter(r, c));
        if (onLeave) cell.addEventListener("mouseleave", () => onLeave());

        if (onClick) cell.addEventListener("click", () => onClick(r, c));

        // Keyboard support
        cell.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.(r, c);
          }
        });

        el.appendChild(cell);
      }
    }
  }

  function rotateWithR() {
    state.rotation = state.rotation === 0 ? 1 : 0;
    saveState();
    renderGrids();

    // ✅ Critical: immediately re-apply preview at the last hovered cell
    if (state.phase === "placing" && lastHover.active && lastHover.r != null && lastHover.c != null) {
      applyPreviewAt(lastHover.r, lastHover.c);
    }

    if (state.phase === "placing") {
      setStatus(`Rotation: ${state.rotation === 0 ? "Horizontal" : "Vertical"} (Press R again to rotate).`);
    }
  }

  // Only 'R' rotates
  document.addEventListener("keydown", (e) => {
    if (!state) return;
    if (e.key.toLowerCase() === "r") {
      rotateWithR();
    }
  });

  btnRestart.addEventListener("click", () => {
    if (!state) return;
    restartSamePlacements();
  });

  btnNew.addEventListener("click", () => {
    startNewGame();
  });

  // ---------- Init ----------
  function init() {
    buildGrid(elPlayerGrid, handlePlayerGridEnter, handlePlayerGridLeave, handlePlayerGridClick);
    buildGrid(elCpuGrid, null, null, handleCpuGridClick);

    const loaded = loadState();
    if (loaded) {
      state = loaded;

      // basic sanity
      if (!state.playerShots || !state.cpuShots || !state.cpuShips) {
        startNewGame();
        return;
      }

      // If not done placing, ensure correct phase
      if (state.playerShips.length !== SHIP_SIZES.length && state.phase !== "placing") {
        state.phase = "placing";
        state.placementIndex = state.playerShips.length;
        state.turn = "player";
      }

      // If done placing, ensure phase is battle
      if (state.playerShips.length === SHIP_SIZES.length) {
        state.placementIndex = SHIP_SIZES.length;
        if (state.phase === "placing") state.phase = "playing";
      }

      lastHover = { r: null, c: null, active: false };

      setStatus("Game loaded. If placing, hover your board and press R to rotate.");
      renderGrids();
      if (state.phase === "placing") renderPlacementStatus();
    } else {
      startNewGame();
    }
  }

  init();
})();
