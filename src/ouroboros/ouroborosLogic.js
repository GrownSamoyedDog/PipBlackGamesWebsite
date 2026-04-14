/**
 * Pure rules for Ouroboros: coordinates, rook-range, Gather/Scatter legality, end-of-turn marker.
 *
 * **Coords:** chess-style labels on an N×N board (`a1` … up to the size’s last file/rank), matching `OuroborosGameShell`.
 *
 * **Gather / Scatter:** “control” requires top piece = current player’s color and `blank` face.
 * Target stacks may not contain a snake-eye (`snake_head`) piece anywhere in the stack.
 * Gather cannot add a piece if the gathering stack already has `maxStackHeight` pieces (match
 * setting; default `OUROBOROS_MAX_STACK`).
 * Scatter highlights and moves require a non-empty source stack.
 *
 * **Snake marker (`applySnakeMarkerEndOfTurn`):** when a turn ends, every `snake_head` on the
 * board flips to `blank`, then exactly one piece — the top of the cell where that player last
 * placed or moved a piece this turn — becomes `snake_head`. So at the start of any turn there
 * is at most one snake-eye piece, and it is always on top of some stack.
 *
 * **Hoopsnake:** **Micro** — a 2×2 ring (all four cells), **Small** — a 3×3 outer ring (eight
 * cells), **Large** — a 4×4 outer ring (twelve cells). See `playerFormsHoopsnake` and
 * `coordsInAnyHoopsnakeRing` (shell highlights after the match has ended).
 *
 * **Road:** one orthogonally connected group of stacks you own whose tops link the **left and
 * right** board edges and/or the **top and bottom** (`coordToRC` rows/cols). See `playerHasRoadWin`
 * and `coordsInAnyWinningRoad`.
 *
 * **Amass:** when the **Amass Reserves** HUD counter from `amassReservesNeededRemaining` hits **0**
 * (enough placements from the match-start pool per **Reserves Until Amass Win Possible**), and every stack that color owns forms
 * **exactly one** orthogonal component (≥1 stack, not multiple islands). Ends immediately like
 * hoopsnake / road; shared win on the same turn → `actor` wins.
 */

/** Default stack height cap when a match does not specify one (gamelog import / API default). */
export const OUROBOROS_MAX_STACK = 5;
export const OUROBOROS_DEFAULT_BOARD_SIZE = 6;

/** Pieces per color in reserve at match start (before any placement). */
export const OUROBOROS_INITIAL_RESERVE_PER_COLOR = 24;

/**
 * **Komi** (from Go): a fixed handicap added to the second player’s (Black’s) **displayed** stack
 * score so the first-move advantage is partially offset. Does not change board state — only the
 * number shown in the UI (`raw black stack count + OUROBOROS_STACK_SCORE_KOMI`).
 */
export const OUROBOROS_STACK_SCORE_KOMI = 0.5;
/** 2×2 ring (all 4 cells); used for **Micro Hoopsnake** objective. */
export const OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP = "micro_hoopsnake_win";
/** 3×3 outer ring (8 cells); used for **Small Hoopsnake** objective. */
export const OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP = "small_hoopsnake_win";
/** 4×4 outer ring (12 cells); **Large Hoopsnake** in UI; JSON value remains `big_hoopsnake_win`. */
export const OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP = "big_hoopsnake_win";
/** Older gamelogs / API default before small/large split; treated as `small_hoopsnake_win`. */
export const OUROBOROS_LEGACY_IMMEDIATE_OBJECTIVE_HOOP = "hoopsnake_win";

/** Immediate objective: win by spanning the board with an orthogonal “road” of owned stacks. */
export const OUROBOROS_IMMEDIATE_OBJECTIVE_ROAD = "road";

/** Immediate objective: placement threshold + exactly one orthogonal group of owned stacks. */
export const OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS = "amass";

/** Recorded in gamelog `termination` when the Road objective ends the game (not stack score). */
export const OUROBOROS_TERMINATION_ROAD_WIN = "road_win";

/** Recorded in gamelog `termination` when the Amass objective ends the game. */
export const OUROBOROS_TERMINATION_AMASS_WIN = "amass_win";

/**
 * Default **Reserves Until Amass Win Possible** (pieces a color must place from their starting pool before the
 * **Amass Reserves** HUD reaches 0 and they become eligible to win on shape). One value per supported preset
 * board (4×4 / 6×6 / 8×8); `OuroborosGameShell` and `ouroborosGamelog.js` import these.
 * {@link evaluateOuroborosNaturalEndOfTurn} uses the 6×6 default if called without explicit match settings.
 *
 * **Naming (intentional mismatch):** APIs, gamelog JSON, and parameters still use
 * `reservesNeededToAmassWin` / `OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_*` for backward compatibility;
 * the shell uses clearer copy—“Reserves Until Amass Win Possible” for this setting and “Amass Reserves”
 * for the live remainder in the side HUD.
 */
export const OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_4 = 5;
export const OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6 = 12;
export const OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_8 = 21;

export const OUROBOROS_DEFAULT_IMMEDIATE_OBJECTIVE =
  OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP;

/**
 * @typedef {'white'|'black'} OuroborosColor
 * @typedef {'blank'|'snake_head'} OuroborosFace
 * @typedef {{ color: OuroborosColor, face: OuroborosFace }} OuroborosCellPiece
 */

/**
 * @param {string} coord e.g. "a4"
 * @returns {{ row: number, col: number }} row 1 = top (largest rank), col 1 = file a
 */
export function coordToRC(coord, boardSize = OUROBOROS_DEFAULT_BOARD_SIZE) {
  const file = coord[0];
  const rank = Number(coord.slice(1));
  const col = file.charCodeAt(0) - 96;
  const row = boardSize + 1 - rank;
  return { row, col };
}

/**
 * @param {number} row 1..N top..bottom
 * @param {number} col 1..N a..?
 */
export function rcToCoord(row, col, boardSize = OUROBOROS_DEFAULT_BOARD_SIZE) {
  const file = String.fromCharCode(96 + col);
  const rank = boardSize + 1 - row;
  return `${file}${rank}`;
}

/**
 * Orthogonal cells within `range` steps (rook moves only), excluding distance 0.
 *
 * @param {string} fromCoord
 * @param {number} range stack height at start of Gather / Scatter (>=1)
 * @returns {Set<string>}
 */
export function orthoCellsInRange(
  fromCoord,
  range,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE
) {
  const { row, col } = coordToRC(fromCoord, boardSize);
  const out = new Set();
  const R = Math.max(0, Math.floor(range));
  for (let d = 1; d <= R; d++) {
    if (col + d <= boardSize) out.add(rcToCoord(row, col + d, boardSize));
    if (col - d >= 1) out.add(rcToCoord(row, col - d, boardSize));
    if (row + d <= boardSize) out.add(rcToCoord(row + d, col, boardSize));
    if (row - d >= 1) out.add(rcToCoord(row - d, col, boardSize));
  }
  return out;
}

/** @param {OuroborosCellPiece[] | undefined} stack */
export function stackTop(stack) {
  const s = stack ?? [];
  return s.length ? s[s.length - 1] : null;
}

/**
 * Counts occupied stacks by the **top** piece’s color (ownership). Empty cells are skipped.
 * Pass the **committed** `stackByCoord` so totals match the position at the end of completed
 * turns (not a mid–Gather/Scatter `draftStacks` preview).
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @returns {{ white: number, black: number }}
 */
export function countOwnedStacks(stacks) {
  let white = 0;
  let black = 0;
  for (const stack of Object.values(stacks)) {
    const top = stackTop(stack);
    if (!top) continue;
    if (top.color === "white") white++;
    else if (top.color === "black") black++;
  }
  return { white, black };
}

/**
 * All six files × six ranks have a stack (any height ≥ 1).
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 */
export function ouroborosBoardIsFull(
  stacks,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE
) {
  for (let row = 1; row <= boardSize; row++) {
    for (let col = 1; col <= boardSize; col++) {
      if ((stacks[rcToCoord(row, col, boardSize)] ?? []).length === 0) return false;
    }
  }
  return true;
}

/** The four cells of a 2×2 ring (all cells are perimeter). */
const HOOP_SNAKE_MICRO_RING_OFFSETS = /** @type {const} */ ([
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
]);

/** The eight cells of a 3×3 outer ring; center is excluded. */
const HOOP_SNAKE_SMALL_RING_OFFSETS = /** @type {const} */ ([
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 2],
  [2, 0],
  [2, 1],
  [2, 2],
]);

/** The twelve cells of a 4×4 outer ring (perimeter only). */
const HOOP_SNAKE_BIG_RING_OFFSETS = /** @type {const} */ ([
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 0],
  [1, 3],
  [2, 0],
  [2, 3],
  [3, 0],
  [3, 1],
  [3, 2],
  [3, 3],
]);

/**
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {OuroborosColor} color
 * @param {number} boardSize
 * @param {readonly (readonly [number, number])[]} ringOffsets 0-based within a WxW window
 * @param {number} windowSize 2 (micro hoop), 3 (small hoop), or 4 (large hoop)
 */
function playerFormsHoopsnakeRing(
  stacks,
  color,
  boardSize,
  ringOffsets,
  windowSize
) {
  const maxStart = boardSize - windowSize + 1;
  for (let r0 = 1; r0 <= maxStart; r0++) {
    for (let c0 = 1; c0 <= maxStart; c0++) {
      let ringOk = true;
      for (const [dr, dc] of ringOffsets) {
        const top = stackTop(stacks[rcToCoord(r0 + dr, c0 + dc, boardSize)]);
        if (!top || top.color !== color) {
          ringOk = false;
          break;
        }
      }
      if (ringOk) return true;
    }
  }
  return false;
}

/**
 * True if `color` completes a Hoopsnake ring of the given **variant** somewhere on the board.
 *
 * - **`micro`**: some 2×2 window’s four cells are owned by `color`.
 * - **`small`**: some 3×3 window’s eight ring cells are owned by `color`.
 * - **`big`** (Large Hoopsnake): some 4×4 window’s twelve ring cells are owned by `color`.
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {OuroborosColor} color
 * @param {'micro'|'small'|'big'} [variant]
 */
export function playerFormsHoopsnake(
  stacks,
  color,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  variant = /** @type {const} */ ("small")
) {
  if (variant === "micro") {
    return playerFormsHoopsnakeRing(
      stacks,
      color,
      boardSize,
      HOOP_SNAKE_MICRO_RING_OFFSETS,
      2
    );
  }
  if (variant === "big") {
    return playerFormsHoopsnakeRing(
      stacks,
      color,
      boardSize,
      HOOP_SNAKE_BIG_RING_OFFSETS,
      4
    );
  }
  return playerFormsHoopsnakeRing(
    stacks,
    color,
    boardSize,
    HOOP_SNAKE_SMALL_RING_OFFSETS,
    3
  );
}

/**
 * Every coordinate on at least one **complete** Hoopsnake ring for the given **variant** (White or
 * Black). Post-game board highlight in the shell.
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks committed board or draft preview
 * @param {'micro'|'small'|'big'} [variant]
 * @returns {Set<string>}
 */
export function coordsInAnyHoopsnakeRing(
  stacks,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  variant = /** @type {const} */ ("small")
) {
  const ringOffsets =
    variant === "micro"
      ? HOOP_SNAKE_MICRO_RING_OFFSETS
      : variant === "big"
        ? HOOP_SNAKE_BIG_RING_OFFSETS
        : HOOP_SNAKE_SMALL_RING_OFFSETS;
  const windowSize =
    variant === "micro" ? 2 : variant === "big" ? 4 : 3;
  /** @type {Set<string>} */
  const out = new Set();
  const maxStart = boardSize - windowSize + 1;
  for (let r0 = 1; r0 <= maxStart; r0++) {
    for (let c0 = 1; c0 <= maxStart; c0++) {
      for (const color of /** @type {const} */ (["white", "black"])) {
        let ringOk = true;
        for (const [dr, dc] of ringOffsets) {
          const top = stackTop(stacks[rcToCoord(r0 + dr, c0 + dc, boardSize)]);
          if (!top || top.color !== color) {
            ringOk = false;
            break;
          }
        }
        if (ringOk) {
          for (const [dr, dc] of ringOffsets) {
            out.add(rcToCoord(r0 + dr, c0 + dc, boardSize));
          }
        }
      }
    }
  }
  return out;
}

// ----- Road objective (orthogonal connectivity, edge span) -----

/** Unit steps in board row/col space (`coordToRC`), same adjacency as Gather/Scatter range. */
const ORTHO_STEP_RC = /** @type {const} */ ([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]);

/**
 * All coords whose stack tops are owned by `color` (empty cells omitted).
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {OuroborosColor} color
 */
function coordsOwnedByTopColor(stacks, color, boardSize) {
  /** @type {Set<string>} */
  const out = new Set();
  for (let row = 1; row <= boardSize; row++) {
    for (let col = 1; col <= boardSize; col++) {
      const c = rcToCoord(row, col, boardSize);
      const top = stackTop(stacks[c]);
      if (top && top.color === color) out.add(c);
    }
  }
  return out;
}

/**
 * @param {string[]} component same connected component (coords)
 * @returns {boolean} true if the group touches left+right cols or top+bottom rows (inclusive).
 */
function ownedComponentFormsRoad(component, boardSize) {
  let touchesLeft = false;
  let touchesRight = false;
  let touchesTop = false;
  let touchesBottom = false;
  for (const coord of component) {
    const { row, col } = coordToRC(coord, boardSize);
    if (col === 1) touchesLeft = true;
    if (col === boardSize) touchesRight = true;
    if (row === 1) touchesTop = true;
    if (row === boardSize) touchesBottom = true;
  }
  return (
    (touchesLeft && touchesRight) || (touchesTop && touchesBottom)
  );
}

/**
 * BFS one orthogonally connected component of `ownedSet` from `start`; mutates `visited`.
 *
 * @param {string} start
 * @param {Set<string>} ownedSet
 * @param {Set<string>} visited
 * @returns {string[]}
 */
function collectOwnedOrthoComponent(start, ownedSet, visited, boardSize) {
  /** @type {string[]} */
  const component = [];
  const queue = [start];
  visited.add(start);
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    component.push(cur);
    const { row, col } = coordToRC(cur, boardSize);
    for (const [dr, dc] of ORTHO_STEP_RC) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 1 || nr > boardSize || nc < 1 || nc > boardSize) continue;
      const n = rcToCoord(nr, nc, boardSize);
      if (!ownedSet.has(n) || visited.has(n)) continue;
      visited.add(n);
      queue.push(n);
    }
  }
  return component;
}

/**
 * True if `color` has at least one orthogonally connected set of owned stacks that forms a road
 * (left–right and/or top–bottom span). Tie-breaking when **both** colors have a road on the same
 * turn matches hoopsnake: shared win → `actor` wins.
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {OuroborosColor} color
 */
export function playerHasRoadWin(
  stacks,
  color,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE
) {
  const ownedSet = coordsOwnedByTopColor(stacks, color, boardSize);
  if (ownedSet.size === 0) return false;
  const visited = new Set();
  for (const start of ownedSet) {
    if (visited.has(start)) continue;
    const component = collectOwnedOrthoComponent(
      start,
      ownedSet,
      visited,
      boardSize
    );
    if (ownedComponentFormsRoad(component, boardSize)) return true;
  }
  return false;
}

/**
 * All cells that belong to **any** winning road component for White or Black (post-game highlight).
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 */
export function coordsInAnyWinningRoad(
  stacks,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE
) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const color of /** @type {const} */ (["white", "black"])) {
    const ownedSet = coordsOwnedByTopColor(stacks, color, boardSize);
    const visited = new Set();
    for (const start of ownedSet) {
      if (visited.has(start)) continue;
      const component = collectOwnedOrthoComponent(
        start,
        ownedSet,
        visited,
        boardSize
      );
      if (ownedComponentFormsRoad(component, boardSize)) {
        for (const c of component) out.add(c);
      }
    }
  }
  return out;
}

// ----- Amass objective (placement threshold + single orthogonal component) -----
//
// Eligibility: `amassReservesNeededRemaining` === 0. Win: ≥1 owned stack, all owned cells one
// orthogonal group. Evaluation runs in `evaluateOuroborosNaturalEndOfTurn` before stack-score.

/**
 * Remaining count shown as **Amass Reserves** in the HUD: starts at `needed` and
 * decreases by 1 each time the player spends one reserve (placement). Floors at 0.
 *
 * @param {number} initialReservePerColor match start reserve per color
 * @param {number} currentReserve that player’s reserve now
 * @param {number} reservesNeededToAmassWin **Reserves Until Amass Win Possible** numeric setting
 */
export function amassReservesNeededRemaining(
  initialReservePerColor,
  currentReserve,
  reservesNeededToAmassWin
) {
  const spent = initialReservePerColor - currentReserve;
  return Math.max(0, reservesNeededToAmassWin - spent);
}

/**
 * True if {@link amassReservesNeededRemaining} is 0 for `color` (placement threshold met) and they
 * own at least one stack, and all owned stacks form a single orthogonal group.
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {OuroborosColor} color
 * @param {{ white: number, black: number }} piece_reserve after the turn
 * @param {number} initialReservePerColor match start reserve per color
 * @param {number} reservesNeededToAmassWin **Reserves Until Amass Win Possible** setting (game settings)
 */
export function playerHasAmassWin(
  stacks,
  color,
  boardSize,
  piece_reserve,
  initialReservePerColor,
  reservesNeededToAmassWin
) {
  if (
    amassReservesNeededRemaining(
      initialReservePerColor,
      piece_reserve[color],
      reservesNeededToAmassWin
    ) !== 0
  ) {
    return false;
  }
  const ownedSet = coordsOwnedByTopColor(stacks, color, boardSize);
  if (ownedSet.size === 0) return false;
  const visited = new Set();
  let componentCount = 0;
  for (const start of ownedSet) {
    if (visited.has(start)) continue;
    collectOwnedOrthoComponent(start, ownedSet, visited, boardSize);
    componentCount++;
    if (componentCount > 1) return false;
  }
  return componentCount === 1;
}

/**
 * Cells in any winning amass group (either color that satisfies {@link playerHasAmassWin}), for
 * post-game board highlights.
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {{ white: number, black: number }} piece_reserve
 * @param {number} initialReservePerColor
 * @param {number} reservesNeededToAmassWin
 */
export function coordsInWinningAmassShape(
  stacks,
  boardSize,
  piece_reserve,
  initialReservePerColor,
  reservesNeededToAmassWin
) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const color of /** @type {const} */ (["white", "black"])) {
    if (
      !playerHasAmassWin(
        stacks,
        color,
        boardSize,
        piece_reserve,
        initialReservePerColor,
        reservesNeededToAmassWin
      )
    ) {
      continue;
    }
    const ownedSet = coordsOwnedByTopColor(stacks, color, boardSize);
    for (const c of ownedSet) out.add(c);
  }
  return out;
}

/**
 * Natural endings after a completed turn (`actor` = player who just moved / committed).
 * **Hoopsnake** (micro / small / large) is evaluated when that objective is selected; **Road** when selected;
 * **Amass** when selected.
 * **Stack score** runs when no immediate win applies; it triggers when `actor` has empty reserve
 * or the board is full, then compares stack counts (black includes komi).
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {{ white: number, black: number }} piece_reserve after the turn
 * @param {OuroborosColor} actor
 * @param {number} [blackKomi]
 * @param {string} [immediateObjectiveType]
 * @param {number} [initialReservePerColor] required for **Amass** evaluation
 * @param {number} [reservesNeededToAmassWin] **Reserves Until Amass Win Possible** (defaults to {@link OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6})
 * @returns {null | { termination: 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win', outcome: 'white' | 'black' | 'draw' }}
 */
export function evaluateOuroborosNaturalEndOfTurn(
  stacks,
  piece_reserve,
  actor,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  blackKomi = OUROBOROS_STACK_SCORE_KOMI,
  immediateObjectiveType = OUROBOROS_DEFAULT_IMMEDIATE_OBJECTIVE,
  initialReservePerColor = OUROBOROS_INITIAL_RESERVE_PER_COLOR,
  reservesNeededToAmassWin = OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6
) {
  /** @type {'micro' | 'small' | 'big' | null} */
  let hoopVariant = null;
  if (immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP) {
    hoopVariant = "micro";
  } else if (
    immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP ||
    immediateObjectiveType === OUROBOROS_LEGACY_IMMEDIATE_OBJECTIVE_HOOP
  ) {
    hoopVariant = "small";
  } else if (immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP) {
    hoopVariant = "big";
  }
  if (hoopVariant != null) {
    const whiteHoop = playerFormsHoopsnake(stacks, "white", boardSize, hoopVariant);
    const blackHoop = playerFormsHoopsnake(stacks, "black", boardSize, hoopVariant);
    if (whiteHoop || blackHoop) {
      /** @type {'white' | 'black'} */
      let outcome;
      if (whiteHoop && !blackHoop) outcome = "white";
      else if (blackHoop && !whiteHoop) outcome = "black";
      else outcome = actor;
      return { termination: /** @type {const} */ ("hoopsnake_win"), outcome };
    }
  } else if (immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_ROAD) {
    const whiteRoad = playerHasRoadWin(stacks, "white", boardSize);
    const blackRoad = playerHasRoadWin(stacks, "black", boardSize);
    if (whiteRoad || blackRoad) {
      /** @type {'white' | 'black'} */
      let outcome;
      if (whiteRoad && !blackRoad) outcome = "white";
      else if (blackRoad && !whiteRoad) outcome = "black";
      else outcome = actor;
      return { termination: /** @type {const} */ ("road_win"), outcome };
    }
    // Amass: evaluated before stack-score; requires match `initialReservePerColor` + threshold.
  } else if (immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS) {
    const whiteAmass = playerHasAmassWin(
      stacks,
      "white",
      boardSize,
      piece_reserve,
      initialReservePerColor,
      reservesNeededToAmassWin
    );
    const blackAmass = playerHasAmassWin(
      stacks,
      "black",
      boardSize,
      piece_reserve,
      initialReservePerColor,
      reservesNeededToAmassWin
    );
    if (whiteAmass || blackAmass) {
      /** @type {'white' | 'black'} */
      let outcome;
      if (whiteAmass && !blackAmass) outcome = "white";
      else if (blackAmass && !whiteAmass) outcome = "black";
      else outcome = actor;
      return { termination: /** @type {const} */ ("amass_win"), outcome };
    }
  }

  const reserveSpent = piece_reserve[actor] === 0;
  const full = ouroborosBoardIsFull(stacks, boardSize);
  if (!reserveSpent && !full) return null;

  const { white, black } = countOwnedStacks(stacks);
  const whiteScore = white;
  const blackScore = black + blackKomi;
  /** @type {'white' | 'black' | 'draw'} */
  let outcome;
  if (whiteScore > blackScore) outcome = "white";
  else if (blackScore > whiteScore) outcome = "black";
  else outcome = "draw";

  return { termination: /** @type {const} */ ("stack_score_win"), outcome };
}

/** True if any piece in the stack shows the snake-head (snake eye) face. */
export function stackHasSnakeEye(stack) {
  return (stack ?? []).some((p) => p.face === "snake_head");
}

/**
 * Player may select this stack: top matches their color and is blank (not snake eye).
 *
 * @param {OuroborosCellPiece[] | undefined} stack
 * @param {OuroborosColor} player
 */
export function playerControlsStack(stack, player) {
  const t = stackTop(stack);
  return Boolean(t && t.color === player && t.face === "blank");
}

/**
 * @param {string} sourceCoord
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {number} range fixed for this Gather / Scatter action
 */
/** Used for Gather menu enablement and to detect when a Gather draft must auto-commit. */
export function gatherHasValidTarget(
  sourceCoord,
  stacks,
  range,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  const source = stacks[sourceCoord] ?? [];
  if (source.length >= maxStackHeight) return false;
  for (const c of orthoCellsInRange(sourceCoord, range, boardSize)) {
    if (c === sourceCoord) continue;
    const t = stacks[c] ?? [];
    if (t.length === 0) continue;
    if (stackHasSnakeEye(t)) continue;
    return true;
  }
  return false;
}

/**
 * @param {string} sourceCoord
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {number} range
 */
/** Used for Scatter menu enablement and to detect when a Scatter draft must auto-commit. */
export function scatterHasValidTarget(
  sourceCoord,
  stacks,
  range,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  const source = stacks[sourceCoord] ?? [];
  if (source.length === 0) return false;
  for (const c of orthoCellsInRange(sourceCoord, range, boardSize)) {
    if (c === sourceCoord) continue;
    const t = stacks[c] ?? [];
    if (t.length >= maxStackHeight) continue;
    if (stackHasSnakeEye(t)) continue;
    return true;
  }
  return false;
}

/**
 * @param {string} sourceCoord
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 */
export function gatherEnabledForMenu(
  sourceCoord,
  stacks,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  const h = (stacks[sourceCoord] ?? []).length;
  if (h === 0 || h >= maxStackHeight) return false;
  return gatherHasValidTarget(sourceCoord, stacks, h, boardSize, maxStackHeight);
}

/**
 * @param {string} sourceCoord
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 */
export function scatterEnabledForMenu(
  sourceCoord,
  stacks,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  const h = (stacks[sourceCoord] ?? []).length;
  if (h === 0) return false;
  return scatterHasValidTarget(sourceCoord, stacks, h, boardSize, maxStackHeight);
}

/**
 * Legal cell to lift the top piece **from** onto `sourceCoord`. Requires room on the gathering
 * stack (`length < maxStackHeight`) so another piece can never be added via Gather.
 *
 * @param {string} coord
 * @param {string} sourceCoord
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {number} range
 */
export function isGatherTarget(
  coord,
  sourceCoord,
  stacks,
  range,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  if (coord === sourceCoord) return false;
  const gathering = stacks[sourceCoord] ?? [];
  if (gathering.length >= maxStackHeight) return false;
  if (!orthoCellsInRange(sourceCoord, range, boardSize).has(coord)) return false;
  const t = stacks[coord] ?? [];
  if (t.length === 0) return false;
  if (stackHasSnakeEye(t)) return false;
  return true;
}

/**
 * Legal cell to receive the top piece **from** `sourceCoord`. If the source stack is empty,
 * returns false for every coord (no highlights, no moves).
 *
 * @param {string} coord
 * @param {string} sourceCoord
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 * @param {number} range
 */
export function isScatterTarget(
  coord,
  sourceCoord,
  stacks,
  range,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  if (coord === sourceCoord) return false;
  const from = stacks[sourceCoord] ?? [];
  if (from.length === 0) return false;
  if (!orthoCellsInRange(sourceCoord, range, boardSize).has(coord)) return false;
  const t = stacks[coord] ?? [];
  if (t.length >= maxStackHeight) return false;
  if (stackHasSnakeEye(t)) return false;
  return true;
}

/**
 * End-of-turn snake-eye rule: clear all snake faces globally, then mark one top piece.
 *
 * 1. Every piece with `face === 'snake_head'` becomes `blank`.
 * 2. The top piece on `lastMoveTopCoord` becomes `snake_head` (the piece the player last placed
 *    or moved — Placing: that cell; Gather: source stack receiving the lift; Scatter: target cell).
 *
 * Returns a new record (does not mutate `stacks`).
 *
 * @param {Record<string, OuroborosCellPiece[]>} stacks merged board state for the ended turn
 * @param {string} lastMoveTopCoord chess coord whose stack top receives the marker
 * @returns {Record<string, OuroborosCellPiece[]>}
 */
export function applySnakeMarkerEndOfTurn(stacks, lastMoveTopCoord) {
  /** @type {Record<string, OuroborosCellPiece[]>} */
  const next = {};
  for (const key of Object.keys(stacks)) {
    next[key] = (stacks[key] ?? []).map((p) => ({
      ...p,
      face: p.face === "snake_head" ? "blank" : p.face,
    }));
  }
  const stack = next[lastMoveTopCoord];
  if (stack && stack.length > 0) {
    const copy = [...stack];
    const i = copy.length - 1;
    copy[i] = { ...copy[i], face: "snake_head" };
    next[lastMoveTopCoord] = copy;
  }
  return next;
}
