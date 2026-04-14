/**
 * Sumo game rules (mockup): place stones on a hex board, resolve line pushes from the
 * new placement along all six directions, count pins and leapfrog (push-off) scoring.
 *
 * Board encoding: cells are keyed by string id (e.g. "a1"); internal logic often uses
 * axial "q,r" maps for adjacency and rigid line motion.
 *
 * **Pin type** (match setting `pinType`, see {@link SUMO_DEFAULT_PIN_TYPE}):
 * - **Multi** — per-axis sandwiches stack: displayed pin count is the number of such axes, capped
 *   at 3 (current default / classic mockup behavior).
 * - **Single** — any positive number of pin axes counts as **1** on that stone (binary pinned).
 * - **None** — no pins; numerals and pin contribution to totals are always zero.
 */

import { HEX_DIRS, HEX_NEIGHBOR_DIRS } from "../shared/hexBoard.js";

/** @typedef {'white'|'black'} Color */

/** @typedef {'multi'|'single'|'none'} SumoPinType */

/** Multiple pin axes each add to the count (max 3 on the numeral). */
export const SUMO_PIN_TYPE_MULTI = "multi";
/** At most one “pin” per stone regardless of how many axes sandwich it. */
export const SUMO_PIN_TYPE_SINGLE = "single";
/** Pins disabled for scoring and display. */
export const SUMO_PIN_TYPE_NONE = "none";

export const SUMO_DEFAULT_PIN_TYPE = SUMO_PIN_TYPE_MULTI;

export function opposite(c) {
  return c === "white" ? "black" : "white";
}

/** Stable map key for axial coordinates. */
function qrKey(q, r) {
  return `${q},${r}`;
}

function add([q, r], [dq, dr]) {
  return [q + dq, r + dr];
}

/**
 * Live pieces as a Map from axial qrKey → color (only occupied cells).
 * @param {Record<string, Color>} boardById
 * @returns {Map<string, Color>}
 */
function toQrMap(boardById, cells) {
  const m = new Map();
  for (const c of cells) {
    const col = boardById[c.id];
    if (col) m.set(qrKey(c.q, c.r), col);
  }
  return m;
}

/** Inverse of toQrMap: sparse record keyed by cell id for React state. */
function toBoardRecord(qrMap, cells) {
  const out = {};
  for (const c of cells) {
    const col = qrMap.get(qrKey(c.q, c.r));
    if (col) out[c.id] = col;
  }
  return out;
}
/**
 * Map raw axis count `n` to the **displayed** pin value for `pinType`.
 *
 * @param {number} n
 * @param {SumoPinType} [pinType]
 */
export function sumoPinCountForType(n, pinType = SUMO_DEFAULT_PIN_TYPE) {
  if (pinType === SUMO_PIN_TYPE_NONE) return 0;
  if (n <= 0) return 0;
  if (pinType === SUMO_PIN_TYPE_SINGLE) return 1;
  return Math.min(n, 3);
}

/**
 * Pin count per occupied cell for UI and scoring: see **Pin type** in the file header.
 *
 * @param {Record<string, Color>} boardById
 * @param {SumoPinType} [pinType]
 */
export function computePins(
  boardById,
  cells,
  pinType = SUMO_DEFAULT_PIN_TYPE
) {
  const byQr = new Map(cells.map((c) => [qrKey(c.q, c.r), c]));
  /** @type {Record<string, number>} */
  const pins = {};

  for (const c of cells) {
    const center = boardById[c.id];
    if (!center) continue;

    let n = 0;
    for (const [dq, dr] of HEX_DIRS) {
      const c1 = byQr.get(qrKey(c.q + dq, c.r + dr));
      const c2 = byQr.get(qrKey(c.q - dq, c.r - dr));
      if (!c1 || !c2) continue;
      const col1 = boardById[c1.id];
      const col2 = boardById[c2.id];
      if (col1 && col2 && col1 === col2 && col1 !== center) n++;
    }
    const v = sumoPinCountForType(n, pinType);
    if (v > 0) pins[c.id] = v;
  }
  return pins;
}

/**
 * Display score: base “push points” plus pin chips where a black stone earns white’s
 * pin count and vice versa (rulebook pin / leapfrog tie-in for this mockup).
 *
 * @param {SumoPinType} [pinType]
 */
export function computeTotals(
  boardById,
  pushPoints,
  cells,
  pinType = SUMO_DEFAULT_PIN_TYPE
) {
  const pins = computePins(boardById, cells, pinType);
  let wPin = 0;
  let bPin = 0;
  for (const c of cells) {
    const col = boardById[c.id];
    const p = pins[c.id] ?? 0;
    if (!col || !p) continue;
    // Opponent’s color on a sandwiched piece awards pins to the other side’s total.
    if (col === "black") wPin += p;
    else bPin += p;
  }
  return {
    white: pushPoints.white + wPin,
    black: pushPoints.black + bPin,
  };
}

/**
 * Win at start of `active` player's turn (after board full or leapfrog).
 *
 * @param {SumoPinType} [pinType]
 */
export function checkWinAtTurnStart(
  active,
  boardById,
  pushPoints,
  cells,
  pinType = SUMO_DEFAULT_PIN_TYPE
) {
  const t = computeTotals(boardById, pushPoints, cells, pinType);
  const full = cells.every((c) => boardById[c.id]);

  if (full) {
    if (t.white > t.black) return "white";
    if (t.black > t.white) return "black";
    return "draw";
  }

  if (active === "white" && t.white > t.black) return "white";
  if (active === "black" && t.black > t.white) return "black";
  return null;
}

/**
 * Rigidly translate every stone in `sources` (same color `enemyColor`) by exactly `d`
 * axial steps in direction `fwd`, in one atomic update.
 *
 * - Landing off-board: piece is removed (scored elsewhere as push-off).
 * - Landing on occupied hex: illegal → null (cannot squash).
 * - Mid-slide hexes (after sources vacate) must be empty and on-board, else null.
 *
 * Each move record includes `distance` and `dir` for arrows and motion. Push-offs use
 * `toId: null` plus `offBoardAxial` so the UI can tween to an exit point off the board.
 * @returns {{ next: Map<string, Color>, removed: number, moves: object[] } | null}
 */
function applyRigidPush(qrMap, cellByQr, qrToId, sources, enemyColor, fwd, d) {
  const moves = [];
  const next = new Map(qrMap);
  const srcKeys = new Set(sources.map(([q, r]) => qrKey(q, r)));
  let removed = 0;

  for (const k of srcKeys) next.delete(k);

  // Every hex strictly between start and landing must be empty after sources lift;
  // otherwise a line would jump over a different-colored (or any blocking) piece.
  for (const [q, r] of sources) {
    for (let t = 1; t < d; t++) {
      const mq = q + fwd[0] * t;
      const mr = r + fwd[1] * t;
      const mk = qrKey(mq, mr);
      if (!cellByQr.has(mk)) return null;
      if (next.has(mk)) return null;
    }
  }

  for (const [q, r] of sources) {
    const nq = q + fwd[0] * d;
    const nr = r + fwd[1] * d;
    const nk = qrKey(nq, nr);
    const fromId = qrToId.get(qrKey(q, r));
    if (!cellByQr.has(nk)) {
      removed++;
      if (fromId) {
        moves.push({
          fromId,
          toId: null,
          offBoardAxial: { q: nq, r: nr },
          color: enemyColor,
          distance: d,
          dir: [fwd[0], fwd[1]],
        });
      }
      continue;
    }
    if (next.has(nk)) return null;
    next.set(nk, enemyColor);
    const toId = qrToId.get(nk);
    if (fromId && toId) {
      moves.push({
        fromId,
        toId,
        color: enemyColor,
        distance: d,
        dir: [fwd[0], fwd[1]],
      });
    }
  }
  return { next, removed, moves };
}

/** Dry-run: true iff {@link applyRigidPush} would succeed (no mutation of `qrMap`). */
function canRigidPush(qrMap, cellByQr, qrToId, sources, enemyColor, fwd, d) {
  return applyRigidPush(qrMap, cellByQr, qrToId, sources, enemyColor, fwd, d) != null;
}

/**
 * Attempt one push along `fwd` from newly placed stone at P.
 *
 * - Requires immediate neighbor P+fwd to be an enemy (no push if empty or same color).
 * - `pusherLen`: count of contiguous same-color stones including P, backward along −fwd.
 * - `enemies`: contiguous enemy run from P+fwd along +fwd (one rigid line to push).
 * - Strength rule: need pusherLen ≥ pusheeLen; max slide distance is
 *   maxDist = pusherLen − pusheeLen + 1 (e.g. 3 vs 3 → 1).
 * - Chooses the largest d ≤ maxDist for which {@link applyRigidPush} is legal (tries downward).
 */
function tryPushFromPlacement(qrMap, cellByQr, qrToId, P, fwd, placedColor) {
  const enemy = opposite(placedColor);
  const nf = add(P, fwd);
  const nfk = qrKey(nf[0], nf[1]);
  if (!cellByQr.has(nfk) || qrMap.get(nfk) !== enemy) {
    return { qrMap, removed: 0, moves: [] };
  }

  const bwd = [-fwd[0], -fwd[1]];
  let pusherLen = 1;
  let cur = add(P, bwd);
  while (
    cellByQr.has(qrKey(cur[0], cur[1])) &&
    qrMap.get(qrKey(cur[0], cur[1])) === placedColor
  ) {
    pusherLen++;
    cur = add(cur, bwd);
  }

  const enemies = [];
  let scan = nf;
  while (
    cellByQr.has(qrKey(scan[0], scan[1])) &&
    qrMap.get(qrKey(scan[0], scan[1])) === enemy
  ) {
    enemies.push([scan[0], scan[1]]);
    scan = add(scan, fwd);
  }

  const pusheeLen = enemies.length;
  if (pusherLen < pusheeLen) return { qrMap, removed: 0, moves: [] };

  const maxDist = pusherLen - pusheeLen + 1;

  for (let d = maxDist; d >= 1; d--) {
    if (canRigidPush(qrMap, cellByQr, qrToId, enemies, enemy, fwd, d)) {
      const applied = applyRigidPush(
        qrMap,
        cellByQr,
        qrToId,
        enemies,
        enemy,
        fwd,
        d
      );
      if (applied) {
        return {
          qrMap: applied.next,
          removed: applied.removed,
          moves: applied.moves,
        };
      }
    }
  }
  return { qrMap, removed: 0, moves: [] };
}

/**
 * Place `activeColor` on `cellId`, then resolve pushes in a fixed order over
 * {@link HEX_NEIGHBOR_DIRS}. Later directions see the board after earlier pushes on this
 * turn; there is no additional “chain” beyond that single pass.
 *
 * Push-off count increments `pushPoints[activeColor]` by the number of enemy stones
 * removed this turn.
 *
 * @param {Record<string, Color>} boardById
 * @param {{ white: number, black: number }} pushPoints
 * @returns {{ board: Record<string, Color>, pushPoints: typeof pushPoints, pushOffThisTurn: number, pushedMoves: Array<{fromId: string, toId: string | null, offBoardAxial?: { q: number, r: number }, color: Color, distance: number, dir: [number, number]}>, placedId: string | null }}
 */
export function applySumoPlacement(boardById, pushPoints, cells, cellId, activeColor) {
  const target = cells.find((c) => c.id === cellId);
  if (!target || boardById[cellId]) {
    return {
      board: boardById,
      pushPoints,
      pushOffThisTurn: 0,
      pushedMoves: [],
      placedId: null,
    };
  }

  let qrMap = toQrMap(boardById, cells);
  const cellByQr = new Map(cells.map((c) => [qrKey(c.q, c.r), c]));
  const qrToId = new Map(cells.map((c) => [qrKey(c.q, c.r), c.id]));

  qrMap.set(qrKey(target.q, target.r), activeColor);
  const P = [target.q, target.r];

  let removedTotal = 0;
  /** @type {Array<{fromId: string, toId: string | null, offBoardAxial?: { q: number, r: number }, color: Color, distance: number, dir: [number, number] }>} */
  const pushedMoves = [];

  for (const fwd of HEX_NEIGHBOR_DIRS) {
    const { qrMap: nextMap, removed, moves } = tryPushFromPlacement(
      qrMap,
      cellByQr,
      qrToId,
      P,
      fwd,
      activeColor
    );
    qrMap = nextMap;
    removedTotal += removed;
    pushedMoves.push(...moves);
  }

  const board = toBoardRecord(qrMap, cells);
  const nextPush = {
    white: pushPoints.white,
    black: pushPoints.black,
  };
  nextPush[activeColor] += removedTotal;

  return {
    board,
    pushPoints: nextPush,
    pushOffThisTurn: removedTotal,
    pushedMoves,
    placedId: cellId,
  };
}
