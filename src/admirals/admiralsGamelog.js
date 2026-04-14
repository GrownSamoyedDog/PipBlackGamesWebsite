/**
 * Admirals gamelog: human-readable notation, JSON export/import, deterministic replay.
 *
 * **Modules:**
 * - {@link admiralsTurnToNotation} / {@link admiralsTurnsToGamelogRounds} — sidebar log lines
 * - {@link serializeAdmiralsGamelog} / {@link parseAdmiralsGamelogJson} — file I/O
 * - {@link applyAdmiralsTurnRecord} — apply one turn (validation + import)
 * - {@link replayAdmiralsGame} — rebuild board + **undo stack** (matches live play snapshots)
 *
 * @typedef {'resign'|'agreed_draw'|null} AdmiralsGamelogTermination
 */

import { createInitialAdmiralsBoard, cloneAdmiralsBoard } from "./admirals.js";
import {
  buildQrToCellId,
  computeValidShipPlacements,
  computeValidAdmiralMoves,
  applyShipPlacementToCell,
  wouldAdmiralDieAfterMove,
} from "./admiralsLogic.js";

/** Distinct from Sumo/Ouroboros versions. */
export const ADMIRALS_GAMELOG_VERSION = 2;
const ADMIRALS_DEFAULT_BOARD_SIZE = "6x6x6";

/**
 * Empty mid-turn draft (mirrors `emptyTurnDraft` in `AdmiralsGameShell.jsx`).
 * @returns {{
 *   admiralFrom: string | null,
 *   shipSkip: boolean,
 *   shipCell: string | null,
 *   moveSuicide: boolean,
 *   moveCell: string | null,
 *   moveDied: boolean,
 * }}
 */
function emptyUndoDraft() {
  return {
    admiralFrom: /** @type {string | null} */ (null),
    shipSkip: false,
    shipCell: /** @type {string | null} */ (null),
    moveSuicide: false,
    moveCell: /** @type {string | null} */ (null),
    moveDied: false,
  };
}

/**
 * Snapshot before applying `turns[i]` or before applying imported resignation/draw metadata.
 * @param {Record<string, import('./admirals.js').AdmiralsCell>} board
 * @param {'white'|'black'} turn
 * @param {AdmiralsTurnRecord[]} turns full imported list
 * @param {number} i number of turns already applied (slice length for `admiralsTurns`)
 */
function makeImportUndoSnapshot(board, turn, turns, i) {
  return {
    board: cloneAdmiralsBoard(board),
    turn,
    phase: /** @type {const} */ ("select"),
    selectedAdmiralCellId: null,
    draft: emptyUndoDraft(),
    admiralsTurns: turns.slice(0, i).map((t) => ({ ...t })),
    termination: null,
    resignedWinner: null,
    boardAtTurnStart: null,
  };
}

// ----- Notation & rounds (UI gamelog) -----

/**
 * @typedef {Object} AdmiralsTurnRecord
 * @property {'white'|'black'} color
 * @property {string} admiralFrom cell id of admiral used this turn
 * @property {boolean} shipSkip
 * @property {string | null} shipCell placement cell when not skipped
 * @property {boolean} moveSuicide
 * @property {string | null} moveCell destination when moved
 * @property {boolean} moveDied admiral died after moving (not suicide)
 */

/**
 * Sidebar / gamelog line: selected admiral cell, ship token, move token.
 * Example: Af9 Sf8 Mf8 — admiral on f9, ship on f8, moved to f8.
 * @param {AdmiralsTurnRecord} t
 */
export function admiralsTurnToNotation(t) {
  const admiral = `A${t.admiralFrom}`;
  const ship = t.shipSkip ? "Sx" : `S${t.shipCell ?? ""}`;
  let move;
  if (t.moveSuicide) move = "Mx*";
  else if (t.moveCell)
    move = `M${t.moveCell}${t.moveDied ? "*" : ""}`;
  else move = "Mx";
  return `${admiral} ${ship} ${move}`;
}

/**
 * Sidebar “turns”: one display row per full round (white’s record + black’s when present).
 * Turn label in the UI is `roundIndex + 1`, not a single ply.
 *
 * @param {AdmiralsTurnRecord[]} turns
 * @returns {{ white: string, black: string | null }[]}
 */
export function admiralsTurnsToGamelogRounds(turns) {
  /** @type {{ white: string, black: string | null }[]} */
  const rounds = [];
  for (let i = 0; i < turns.length; i += 2) {
    const w = turns[i];
    const b = turns[i + 1];
    if (!w) break;
    rounds.push({
      white: admiralsTurnToNotation(w),
      black: b ? admiralsTurnToNotation(b) : null,
    });
  }
  return rounds;
}

// ----- JSON export -----

/**
 * @param {AdmiralsTurnRecord[]} turns
 * @param {AdmiralsGamelogTermination} termination
 * @param {{ boardSize: string }} [settings]
 */
export function serializeAdmiralsGamelog(
  turns,
  termination,
  settings = { boardSize: ADMIRALS_DEFAULT_BOARD_SIZE }
) {
  return JSON.stringify(
    {
      // Keep settings at the top for quick human scanning.
      settings: {
        boardSize: settings.boardSize ?? ADMIRALS_DEFAULT_BOARD_SIZE,
      },
      version: ADMIRALS_GAMELOG_VERSION,
      game: "admirals",
      turns,
      termination: termination ?? null,
    },
    null,
    2
  );
}

// ----- JSON parse (strict validation) -----

/**
 * @param {string} text
 * @returns {{ turns: AdmiralsTurnRecord[], termination: AdmiralsGamelogTermination, boardSize: string }}
 */
export function parseAdmiralsGamelogJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file.");
  }
  if (data == null || typeof data !== "object") {
    throw new Error("Invalid file shape.");
  }
  if (data.game !== "admirals") {
    throw new Error("Not an Admirals gamelog (missing game: admirals).");
  }
  if (data.version !== 1 && data.version !== ADMIRALS_GAMELOG_VERSION) {
    throw new Error(
      `Unsupported Admirals gamelog version: ${data.version ?? "?"}.`
    );
  }
  if (!Array.isArray(data.turns)) {
    throw new Error("Missing turns array.");
  }
  const boardSize =
    data.settings != null &&
    typeof data.settings === "object" &&
    typeof data.settings.boardSize === "string" &&
    data.settings.boardSize.trim()
      ? data.settings.boardSize
      : ADMIRALS_DEFAULT_BOARD_SIZE;
  const term = data.termination;
  if (term != null && term !== "resign" && term !== "agreed_draw") {
    throw new Error("Invalid termination value.");
  }
  for (let i = 0; i < data.turns.length; i++) {
    const t = data.turns[i];
    if (!t || typeof t !== "object") {
      throw new Error(`Invalid turn at index ${i}.`);
    }
    if (t.color !== "white" && t.color !== "black") {
      throw new Error(`Invalid color at turn ${i}.`);
    }
    if (typeof t.admiralFrom !== "string" || !t.admiralFrom) {
      throw new Error(`Invalid admiralFrom at turn ${i}.`);
    }
    if (typeof t.shipSkip !== "boolean") {
      throw new Error(`Invalid shipSkip at turn ${i}.`);
    }
    if (!t.shipSkip && (typeof t.shipCell !== "string" || !t.shipCell)) {
      throw new Error(`Invalid shipCell at turn ${i}.`);
    }
    if (typeof t.moveSuicide !== "boolean") {
      throw new Error(`Invalid moveSuicide at turn ${i}.`);
    }
    if (!t.moveSuicide) {
      if (t.moveCell != null && typeof t.moveCell !== "string") {
        throw new Error(`Invalid moveCell at turn ${i}.`);
      }
      if (typeof t.moveDied !== "boolean") {
        throw new Error(`Invalid moveDied at turn ${i}.`);
      }
    }
  }
  return {
    turns: /** @type {AdmiralsTurnRecord[]} */ (data.turns),
    termination: term ?? null,
    boardSize,
  };
}

// ----- Single-turn apply + full replay -----

/**
 * Apply one turn in isolation (for import validation).
 * @param {Record<string, import('./admirals.js').AdmiralsCell>} board
 * @param {{ id: string, q: number, r: number }[]} cells
 * @param {Record<string, string>} qrToId
 * @param {AdmiralsTurnRecord} rec
 */
export function applyAdmiralsTurnRecord(board, cells, qrToId, rec) {
  const next = cloneAdmiralsBoard(board);
  const from = rec.admiralFrom;
  const cellFrom = next[from];
  if (!cellFrom) throw new Error(`Unknown cell ${from}.`);

  if (rec.color === "white") {
    if (!cellFrom.whiteAdmiral || cellFrom.whiteAdmiral.dead) {
      throw new Error(`No live white admiral at ${from}.`);
    }
  } else if (!cellFrom.blackAdmiral || cellFrom.blackAdmiral.dead) {
    throw new Error(`No live black admiral at ${from}.`);
  }

  if (!rec.shipSkip) {
    if (!rec.shipCell) throw new Error("Missing ship cell.");
    const valid = computeValidShipPlacements(
      next,
      cells,
      qrToId,
      from,
      rec.color
    );
    if (!valid.has(rec.shipCell)) {
      throw new Error(`Illegal ship placement at ${rec.shipCell}.`);
    }
    applyShipPlacementToCell(next[rec.shipCell], rec.color);
  }

  if (rec.moveSuicide) {
    if (rec.color === "white" && next[from].whiteAdmiral) {
      next[from].whiteAdmiral.dead = true;
    } else if (rec.color === "black" && next[from].blackAdmiral) {
      next[from].blackAdmiral.dead = true;
    }
    return next;
  }

  if (typeof rec.moveCell !== "string" || !rec.moveCell) {
    throw new Error("Missing move destination.");
  }

  const { survive, death } = computeValidAdmiralMoves(
    next,
    cells,
    qrToId,
    from,
    rec.color
  );
  if (!survive.has(rec.moveCell) && !death.has(rec.moveCell)) {
    throw new Error(`Illegal admiral move to ${rec.moveCell}.`);
  }

  const target = next[rec.moveCell];
  const expectedDied = wouldAdmiralDieAfterMove(rec.color, target);
  if (expectedDied !== rec.moveDied) {
    throw new Error(
      `Death flag mismatch for move to ${rec.moveCell} (expected ${expectedDied}).`
    );
  }

  if (rec.color === "white") {
    next[from].whiteAdmiral = null;
    next[rec.moveCell].whiteAdmiral = { dead: rec.moveDied };
  } else {
    next[from].blackAdmiral = null;
    next[rec.moveCell].blackAdmiral = { dead: rec.moveDied };
  }

  return next;
}

/**
 * Rebuild board, side-to-move, termination, and an **undo stack** compatible with live play.
 *
 * Stack order (oldest → newest): one entry before each applied turn, then (if the file
 * records resign or agreed draw) one entry for “before that metadata,” mirroring Sumo import.
 *
 * @param {AdmiralsTurnRecord[]} turns
 * @param {{ id: string, q: number, r: number }[]} cells
 * @param {AdmiralsGamelogTermination} importedTermination
 * @param {number} [sideLength]
 * @returns {{
 *   board: Record<string, import('./admirals.js').AdmiralsCell>,
 *   turn: 'white'|'black',
 *   turns: AdmiralsTurnRecord[],
 *   termination: AdmiralsGamelogTermination,
 *   resignedWinner: 'white'|'black'|null,
 *   undoStack: Array<ReturnType<typeof makeImportUndoSnapshot>>,
 * }}
 */
export function replayAdmiralsGame(
  turns,
  cells,
  importedTermination,
  sideLength = 6
) {
  const undoStack = [];
  let board = createInitialAdmiralsBoard(cells, sideLength);
  /** @type {'white'|'black'} */
  let turn = "white";
  const qrToId = buildQrToCellId(cells);

  for (let i = 0; i < turns.length; i++) {
    const rec = turns[i];
    if (rec.color !== turn) {
      throw new Error(
        `Expected ${turn} at turn ${i + 1}, found ${rec.color}.`
      );
    }
    undoStack.push(makeImportUndoSnapshot(board, turn, turns, i));
    board = applyAdmiralsTurnRecord(board, cells, qrToId, rec);
    turn = turn === "white" ? "black" : "white";
  }

  /** @type {'white'|'black'|null} */
  let resignedWinner = null;
  /** @type {AdmiralsGamelogTermination} */
  let termination = null;

  if (importedTermination === "resign") {
    undoStack.push(
      makeImportUndoSnapshot(board, turn, turns, turns.length)
    );
    termination = "resign";
    resignedWinner = turn === "white" ? "black" : "white";
  } else if (importedTermination === "agreed_draw") {
    undoStack.push(
      makeImportUndoSnapshot(board, turn, turns, turns.length)
    );
    termination = "agreed_draw";
  }

  return {
    board,
    turn,
    turns: turns.map((t) => ({ ...t })),
    termination,
    resignedWinner,
    undoStack,
  };
}
