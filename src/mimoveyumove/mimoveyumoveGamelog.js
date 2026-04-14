/**
 * Mimoveyumove gamelog: sidebar rounds, JSON export/import, deterministic replay.
 */
import {
  createInitialMimoBoard,
  MIMO_PIECE_WHITE_MIGO,
  MIMO_PIECE_BLACK_MIGO,
  MIMO_PIECE_WHITE_SPAWNER,
  MIMO_PIECE_BLACK_SPAWNER,
  collectLegalTargets,
  applyMimoAction,
} from "./mimoveyumoveLogic.js";

export const MIMOVE_GAMELOG_FORMAT_VERSION = 1;
/**
 * Public rules board size (playable interior). Physical grid remains 10x10 with edge spawners.
 * Keep this as `8x8` in exported logs to match the game settings UI.
 */
export const MIMOVE_DEFAULT_BOARD_SIZE = "8x8";

/**
 * Accept legacy logs that stored the physical grid label.
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeMimoveBoardSize(raw) {
  if (typeof raw !== "string" || !raw.trim()) return MIMOVE_DEFAULT_BOARD_SIZE;
  const trimmed = raw.trim();
  return trimmed === "10x10" ? "8x8" : trimmed;
}

/**
 * @param {string} move
 * @returns {{ kind: 'spawn' | 'move', source: string, target: string, yugoLineCount: number } | null}
 */
function parseMimoActionMove(move) {
  const m = /^([SM])([za-i]\d)-([za-i]\d)(\*{1,4})?$/.exec(move);
  if (!m) return null;
  return {
    kind: m[1] === "S" ? "spawn" : "move",
    source: m[2],
    target: m[3],
    yugoLineCount: m[4] ? m[4].length : 0,
  };
}

/**
 * @param {string[]} moveIds
 * @returns {{ white: string, black: string | null }[]}
 */
export function movesToGamelogRounds(moveIds) {
  /** @type {{ white: string, black: string | null }[]} */
  const rounds = [];
  for (let i = 0; i < moveIds.length; i += 2) {
    rounds.push({ white: moveIds[i], black: moveIds[i + 1] ?? null });
  }
  return rounds;
}

/**
 * @param {string[]} moveHistory
 * @param {null | 'resign' | 'agreed_draw' | 'igo_win' | 'wego_win' | 'wego_draw'} termination
 * @param {'white'|'black'|'draw'|null} [winner]
 * @param {{ boardSize: string }} [settings]
 */
export function serializeMimoveGamelog(
  moveHistory,
  termination,
  winner = null,
  settings = { boardSize: MIMOVE_DEFAULT_BOARD_SIZE }
) {
  return JSON.stringify(
    {
      settings: {
        boardSize: settings.boardSize ?? MIMOVE_DEFAULT_BOARD_SIZE,
      },
      version: MIMOVE_GAMELOG_FORMAT_VERSION,
      game: "mimoveyumove",
      moves: moveHistory,
      termination: termination ?? null,
      winner: winner ?? null,
    },
    null,
    2
  );
}

/**
 * @param {string} text
 * @returns {{
 *   moves: string[],
 *   termination: null | 'resign' | 'agreed_draw' | 'igo_win' | 'wego_win' | 'wego_draw',
 *   winner: 'white'|'black'|'draw'|null,
 *   boardSize: string,
 * }}
 */
export function parseMimoveGamelogJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file.");
  }
  if (data == null || typeof data !== "object") {
    throw new Error("Invalid file shape.");
  }
  if (data.version !== MIMOVE_GAMELOG_FORMAT_VERSION) {
    throw new Error(`Unsupported gamelog version: ${data.version ?? "?"}`);
  }
  if (data.game != null && data.game !== "mimoveyumove") {
    throw new Error("This file is not a Mimoveyumove gamelog.");
  }
  if (!Array.isArray(data.moves)) {
    throw new Error("Missing moves array.");
  }
  const boardSize = normalizeMimoveBoardSize(
    data.settings != null &&
      typeof data.settings === "object" &&
      "boardSize" in data.settings
      ? data.settings.boardSize
      : undefined
  );
  const term = data.termination;
  if (
    term != null &&
    term !== "resign" &&
    term !== "agreed_draw" &&
    term !== "igo_win" &&
    term !== "wego_win" &&
    term !== "wego_draw"
  ) {
    throw new Error("Invalid termination value.");
  }
  const winner =
    data.winner === "white" || data.winner === "black" || data.winner === "draw"
      ? data.winner
      : null;
  for (let i = 0; i < data.moves.length; i++) {
    const m = data.moves[i];
    if (typeof m !== "string" || !m.trim()) {
      throw new Error(`Invalid move at index ${i}.`);
    }
  }
  return {
    moves: data.moves,
    termination: term ?? null,
    winner,
    boardSize,
  };
}

/**
 * @param {string[]} moves
 * @param {{ id: string }[]} cells
 * @param {number} plies
 * @returns {{
 *   board: Record<string, string>,
 *   turn: 'white'|'black',
 *   lastPlacedId: string | null,
 * }}
 */
export function replayMimoveStateAtPlies(moves, cells, plies) {
  const n = Math.max(0, Math.min(moves.length, Math.floor(plies)));
  const r = replayMimoveGameForImport(moves.slice(0, n), cells, null);
  return {
    board: r.board,
    turn: r.turn,
    lastPlacedId: r.lastPlacedId,
  };
}

/**
 * @param {string[]} moves
 * @param {{ id: string }[]} cells
 * @param {'resign' | 'agreed_draw' | 'igo_win' | 'wego_win' | 'wego_draw' | null} importedTermination
 */
export function replayMimoveGameForImport(moves, cells, importedTermination) {
  const undoStack = [];
  let board = createInitialMimoBoard();
  /** @type {'white'|'black'} */
  let turn = "white";
  let moveHistory = [];
  let lastPlacedId = null;
  const valid = new Set(cells.map((c) => c.id));

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const parsed = parseMimoActionMove(move);
    undoStack.push({
      board: { ...board },
      turn,
      moveHistory: [...moveHistory],
      lastPlacedId,
      termination: null,
      naturalOutcome: null,
      resignedWinner: null,
    });
    if (!parsed) {
      // Legacy format support: plain coord means place a migo on that empty cell.
      const cellId = move;
      if (!valid.has(cellId)) {
        throw new Error(`Unknown cell id: ${cellId} (move ${i + 1}).`);
      }
      if (board[cellId]) {
        throw new Error(`Cell ${cellId} already occupied at step ${i + 1}.`);
      }
      board = {
        ...board,
        [cellId]: turn === "white" ? MIMO_PIECE_WHITE_MIGO : MIMO_PIECE_BLACK_MIGO,
      };
      turn = turn === "white" ? "black" : "white";
      lastPlacedId = cellId;
      moveHistory = [...moveHistory, cellId];
      continue;
    }

    if (!valid.has(parsed.source) || !valid.has(parsed.target)) {
      throw new Error(`Unknown cell in move ${i + 1}: ${move}.`);
    }
    if (board[parsed.target]) {
      throw new Error(`Target ${parsed.target} occupied at step ${i + 1}.`);
    }
    if (parsed.kind === "spawn") {
      const expectedSpawner =
        turn === "white" ? MIMO_PIECE_WHITE_SPAWNER : MIMO_PIECE_BLACK_SPAWNER;
      if (board[parsed.source] !== expectedSpawner) {
        throw new Error(`Invalid spawn source at step ${i + 1}: ${parsed.source}.`);
      }
    } else {
      const expectedMigo = turn === "white" ? MIMO_PIECE_WHITE_MIGO : MIMO_PIECE_BLACK_MIGO;
      if (board[parsed.source] !== expectedMigo) {
        throw new Error(`Invalid migo move source at step ${i + 1}: ${parsed.source}.`);
      }
    }
    const legalTargets = collectLegalTargets(board, parsed.source, parsed.kind, turn);
    if (!legalTargets.has(parsed.target)) {
      throw new Error(`Illegal move at step ${i + 1}: ${move}.`);
    }
    const actionResult = applyMimoAction(
      board,
      { source: parsed.source, target: parsed.target, mode: parsed.kind },
      turn
    );
    board = actionResult.board;
    if (parsed.yugoLineCount !== actionResult.yugoLineCount) {
      throw new Error(`Yugo star marker mismatch at step ${i + 1}: ${move}.`);
    }
    turn = turn === "white" ? "black" : "white";
    lastPlacedId = parsed.target;
    moveHistory = [...moveHistory, move];
  }

  if (
    importedTermination === "resign" ||
    importedTermination === "agreed_draw" ||
    importedTermination === "igo_win" ||
    importedTermination === "wego_win" ||
    importedTermination === "wego_draw"
  ) {
    undoStack.push({
      board: { ...board },
      turn,
      moveHistory: [...moveHistory],
      lastPlacedId,
      termination: null,
      naturalOutcome: null,
      resignedWinner: null,
    });
  }

  return {
    board,
    turn,
    lastPlacedId,
    moveHistory,
    undoStack,
  };
}
