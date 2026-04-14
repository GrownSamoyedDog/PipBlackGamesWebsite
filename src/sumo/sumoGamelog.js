/**
 * Sumo gamelog: sidebar rounds, JSON export/import, deterministic replay.
 *
 * `settings.pinType` mirrors the **Pin Type** practice option (`multi` | `single` | `none`);
 * omitted in older files defaults to `multi`.
 */

import {
  applySumoPlacement,
  SUMO_DEFAULT_PIN_TYPE,
  SUMO_PIN_TYPE_MULTI,
  SUMO_PIN_TYPE_NONE,
  SUMO_PIN_TYPE_SINGLE,
} from "./sumo.js";

/** @type {Set<import("./sumo.js").SumoPinType>} */
const SUMO_ALLOWED_PIN_TYPES = new Set([
  SUMO_PIN_TYPE_MULTI,
  SUMO_PIN_TYPE_SINGLE,
  SUMO_PIN_TYPE_NONE,
]);

// ----- Display (sidebar) -----

/**
 * Sidebar “turns”: one object per full round (white’s ply plus black’s when played).
 * Display index `i + 1` is the turn number, not a single ply.
 *
 * @param {string[]} moveIds ordered placements from start of game
 * @returns {{ white: string, black: string | null }[]}
 */
export function movesToGamelogRounds(moveIds) {
  /** @type {{ white: string, black: string | null }[]} */
  const rounds = [];
  for (let i = 0; i < moveIds.length; i += 2) {
    const w = moveIds[i];
    const b = moveIds[i + 1];
    rounds.push({ white: w, black: b ?? null });
  }
  return rounds;
}

// ----- JSON export / import / replay -----

export const GAMELOG_FORMAT_VERSION = 2;

const SUMO_DEFAULT_BOARD_SIZE = "6x6x5";

/**
 * @param {string[]} moveHistory flat cell ids in order
 * @param {null | 'resign' | 'agreed_draw'} termination
 * @param {{ boardSize: string, pinType?: import("./sumo.js").SumoPinType }} [settings]
 */
export function serializeGamelog(
  moveHistory,
  termination,
  settings = {
    boardSize: SUMO_DEFAULT_BOARD_SIZE,
    pinType: SUMO_DEFAULT_PIN_TYPE,
  }
) {
  return JSON.stringify(
    {
      // Keep settings first for quick “what game config is this?” inspection.
      settings: {
        boardSize: settings.boardSize ?? SUMO_DEFAULT_BOARD_SIZE,
        pinType: settings.pinType ?? SUMO_DEFAULT_PIN_TYPE,
      },
      version: GAMELOG_FORMAT_VERSION,
      game: "sumo",
      moves: moveHistory,
      termination: termination ?? null,
    },
    null,
    2
  );
}

/**
 * @param {string} text
 * @returns {{
 *   moves: string[],
 *   termination: null | 'resign' | 'agreed_draw',
 *   boardSize: string,
 *   pinType: import("./sumo.js").SumoPinType,
 * }}
 */
export function parseGamelogJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file.");
  }
  if (data == null || typeof data !== "object") {
    throw new Error("Invalid file shape.");
  }
  if (data.version !== 1 && data.version !== GAMELOG_FORMAT_VERSION) {
    throw new Error(`Unsupported gamelog version: ${data.version ?? "?"}`);
  }
  if (data.game != null && data.game !== "sumo") {
    throw new Error("This file is not a Sumo gamelog.");
  }
  if (!Array.isArray(data.moves)) {
    throw new Error("Missing moves array.");
  }
  const boardSize =
    data.settings != null &&
    typeof data.settings === "object" &&
    typeof data.settings.boardSize === "string" &&
    data.settings.boardSize.trim()
      ? data.settings.boardSize
      : SUMO_DEFAULT_BOARD_SIZE;

  /** @type {import("./sumo.js").SumoPinType} */
  let pinType = SUMO_DEFAULT_PIN_TYPE;
  if (
    data.settings != null &&
    typeof data.settings === "object" &&
    typeof data.settings.pinType === "string" &&
    data.settings.pinType.trim()
  ) {
    const p = data.settings.pinType.trim().toLowerCase();
    if (!SUMO_ALLOWED_PIN_TYPES.has(/** @type {import("./sumo.js").SumoPinType} */ (p))) {
      throw new Error("Invalid pinType in gamelog settings.");
    }
    pinType = /** @type {import("./sumo.js").SumoPinType} */ (p);
  }

  const term = data.termination;
  if (term != null && term !== "resign" && term !== "agreed_draw") {
    throw new Error("Invalid termination value.");
  }
  for (let i = 0; i < data.moves.length; i++) {
    const m = data.moves[i];
    if (typeof m !== "string" || !m.trim()) {
      throw new Error(`Invalid move at index ${i}.`);
    }
  }
  return {
    moves: data.moves,
    termination: term ?? null,
    boardSize,
    pinType,
  };
}

/**
 * Replay the first `plies` placements for gamelog scrub / review (no undo stack).
 *
 * @param {string[]} moves full match history (only `plies` are applied)
 * @param {{ id: string }[]} cells
 * @param {number} plies clamped to `[0, moves.length]`
 * @returns {{
 *   board: Record<string, 'white'|'black'>,
 *   pushPoints: { white: number, black: number },
 *   turn: 'white'|'black',
 *   lastPlacedId: string | null,
 * }}
 */
export function replaySumoStateAtPlies(moves, cells, plies) {
  const n = Math.max(0, Math.min(moves.length, Math.floor(plies)));
  const r = replayGameForImport(moves.slice(0, n), cells, null);
  return {
    board: r.board,
    pushPoints: r.pushPoints,
    turn: r.turn,
    lastPlacedId: r.lastPlacedId,
  };
}

/**
 * @param {string[]} moves
 * @param {{ id: string }[]} cells
 * @param {'resign' | 'agreed_draw' | null} importedTermination
 */
export function replayGameForImport(moves, cells, importedTermination) {
  const undoStack = [];
  let board = {};
  let pushPoints = { white: 0, black: 0 };
  /** @type {'white'|'black'} */
  let turn = "white";
  let moveHistory = [];
  let lastPlacedId = null;

  for (let i = 0; i < moves.length; i++) {
    const cellId = moves[i];
    if (board[cellId]) {
      throw new Error(
        `Cell ${cellId} already occupied at step ${i + 1}.`
      );
    }
    undoStack.push({
      board: { ...board },
      pushPoints: { ...pushPoints },
      turn,
      moveHistory: [...moveHistory],
      lastPlacedId,
      resignedWinner: null,
      termination: null,
      lastPushMoves: null,
    });
    const res = applySumoPlacement(board, pushPoints, cells, cellId, turn);
    if (!res.placedId) {
      throw new Error(
        `Illegal placement at ${cellId} (step ${i + 1}).`
      );
    }
    board = res.board;
    pushPoints = res.pushPoints;
    turn = turn === "white" ? "black" : "white";
    lastPlacedId = res.placedId;
    moveHistory = [...moveHistory, cellId];
  }

  if (
    importedTermination === "resign" ||
    importedTermination === "agreed_draw"
  ) {
    undoStack.push({
      board: { ...board },
      pushPoints: { ...pushPoints },
      turn,
      moveHistory: [...moveHistory],
      lastPlacedId,
      resignedWinner: null,
      termination: null,
      lastPushMoves: null,
    });
  }

  return {
    board,
    pushPoints,
    turn,
    lastPlacedId,
    moveHistory,
    undoStack,
  };
}
