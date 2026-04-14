/**
 * Admirals **rules engine** (pure functions): LOS for ships and moves, legality helpers, win.
 *
 * Used by `AdmiralsGameShell.jsx` (hints + mutations) and `admiralsGamelog.js` (replay validation).
 */
import { HEX_NEIGHBOR_DIRS } from "../shared/hexBoard.js";

/** @typedef {'white'|'black'} AdmiralsPlayer */

// ----- Cell predicates -----

/**
 * @param {import('./admirals.js').AdmiralsCell} cell
 */
export function cellHasAnyAdmiral(cell) {
  return cell.whiteAdmiral != null || cell.blackAdmiral != null;
}

/**
 * Which ship color the active player would add on this hex, or null if neither fits.
 * @param {AdmiralsPlayer} player
 * @param {import('./admirals.js').AdmiralsCell} cell
 * @returns {'white'|'black'|null}
 */
export function placementShipType(player, cell) {
  if (player === "white") {
    if (!cell.whiteShip) return "white";
    if (!cell.blackShip) return "black";
    return null;
  }
  if (!cell.blackShip) return "black";
  if (!cell.whiteShip) return "white";
  return null;
}

/**
 * @param {AdmiralsPlayer} player
 * @param {import('./admirals.js').AdmiralsCell} cell
 */
export function hexHasEnemyShip(player, cell) {
  return player === "white" ? cell.blackShip : cell.whiteShip;
}

/**
 * After moving: admiral dies if no allied ship on the hex OR an enemy ship is present.
 * @param {AdmiralsPlayer} player
 * @param {import('./admirals.js').AdmiralsCell} cell
 */
export function wouldAdmiralDieAfterMove(player, cell) {
  if (player === "white") {
    if (!cell.whiteShip) return true;
    if (cell.blackShip) return true;
    return false;
  }
  if (!cell.blackShip) return true;
  if (cell.whiteShip) return true;
  return false;
}

/**
 * @param {{ id: string, q: number, r: number }[]} cells
 * @returns {Record<string, string>}
 */
export function buildQrToCellId(cells) {
  return Object.fromEntries(cells.map((c) => [`${c.q},${c.r}`, c.id]));
}

// ----- Phase 2: ship placement (rook rays from selected admiral) -----

/**
 * Rook-like LOS from an admiral hex for **ship placement**.
 * Obstacles: any admiral (stop, no placement); enemy ship stops the ray after processing this hex.
 * @param {Record<string, import('./admirals.js').AdmiralsCell>} board
 * @param {{ id: string, q: number, r: number }[]} cells
 * @param {Record<string, string>} qrToId
 * @param {string} admiralCellId
 * @param {AdmiralsPlayer} player
 * @returns {Set<string>}
 */
export function computeValidShipPlacements(
  board,
  cells,
  qrToId,
  admiralCellId,
  player
) {
  const start = cells.find((c) => c.id === admiralCellId);
  /** @type {Set<string>} */
  const valid = new Set();
  if (!start) return valid;

  for (const [dq, dr] of HEX_NEIGHBOR_DIRS) {
    let q = start.q + dq;
    let r = start.r + dr;
    while (true) {
      const id = qrToId[`${q},${r}`];
      if (!id) break;
      const cell = board[id] ?? {};
      if (cellHasAnyAdmiral(cell)) break;

      if (placementShipType(player, cell) != null) valid.add(id);

      if (hexHasEnemyShip(player, cell)) break;
      if (cell.whiteShip && cell.blackShip) break;

      q += dq;
      r += dr;
    }
  }
  return valid;
}

// ----- Phase 3: admiral movement (rook rays; split survive vs death destinations) -----

/**
 * Rook-like LOS for **admiral movement** (no admiral on destination; can land on two-ship hexes).
 * Enemy ship hex ends the ray after that hex. Both full also ends after.
 * @returns {{ survive: Set<string>, death: Set<string> }}
 */
export function computeValidAdmiralMoves(
  board,
  cells,
  qrToId,
  fromCellId,
  player
) {
  const start = cells.find((c) => c.id === fromCellId);
  /** @type {Set<string>} */
  const survive = new Set();
  /** @type {Set<string>} */
  const death = new Set();
  if (!start) return { survive, death };

  for (const [dq, dr] of HEX_NEIGHBOR_DIRS) {
    let q = start.q + dq;
    let r = start.r + dr;
    while (true) {
      const id = qrToId[`${q},${r}`];
      if (!id) break;
      const cell = board[id] ?? {};
      if (cellHasAnyAdmiral(cell)) break;

      if (wouldAdmiralDieAfterMove(player, cell)) death.add(id);
      else survive.add(id);

      if (hexHasEnemyShip(player, cell)) break;
      if (cell.whiteShip && cell.blackShip) break;

      q += dq;
      r += dr;
    }
  }
  return { survive, death };
}

// ----- Board mutation helper + end state -----

/**
 * @param {Record<string, import('./admirals.js').AdmiralsCell>} board
 * @param {{ id: string, q: number, r: number }[]} cells
 * @param {AdmiralsPlayer} player
 */
export function countLivingAdmirals(board, cells, player) {
  let n = 0;
  for (const c of cells) {
    const cell = board[c.id];
    if (!cell) continue;
    if (player === "white" && cell.whiteAdmiral && !cell.whiteAdmiral.dead) n++;
    if (player === "black" && cell.blackAdmiral && !cell.blackAdmiral.dead) n++;
  }
  return n;
}

/**
 * @param {Record<string, import('./admirals.js').AdmiralsCell>} board
 * @param {{ id: string, q: number, r: number }[]} cells
 * @returns {'white'|'black'|'draw'|null}
 */
export function findWinner(board, cells) {
  const w = countLivingAdmirals(board, cells, "white");
  const b = countLivingAdmirals(board, cells, "black");
  if (w === 0 && b > 0) return "black";
  if (b === 0 && w > 0) return "white";
  if (w === 0 && b === 0) return "draw";
  return null;
}

/**
 * Apply one ship of the type implied by `placementShipType` for this player.
 * Caller must ensure placement is legal.
 * @param {import('./admirals.js').AdmiralsCell} cell
 * @param {AdmiralsPlayer} player
 */
export function applyShipPlacementToCell(cell, player) {
  const st = placementShipType(player, cell);
  if (st === "white") cell.whiteShip = true;
  else if (st === "black") cell.blackShip = true;
}
