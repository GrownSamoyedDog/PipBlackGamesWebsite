/**
 * Ouroboros gamelog: notation, sidebar rounds, JSON export/import, deterministic replay.
 *
 * **One string per completed turn** (same flat list pattern as Sumo hex ids):
 * - Placement: `a1` — active player placed on that square.
 * - Gather: `Ga1-a2-a3` — chose stack `a1`, then gathered from `a2`, then `a3` (order matters).
 * - Scatter: `Sa1-a2-a3` — chose stack `a1`, then scattered to `a2`, then `a3`.
 *   (`+` between cells is still accepted on import for older files.)
 *
 * Draft Gather/Scatter is not logged until **End Turn**; **Cancel** drops the draft with no line.
 * Sidebar also shows **HOOPSNAKE WIN** / **STACK SCORE WIN** when the match ends by those rules.
 * JSON `termination` may be `resign`, `agreed_draw`, `hoopsnake_win`, `road_win`, `amass_win`, `stack_score_win`, or `null`
 * (v2); natural outcomes include `winner` (`white` | `black` | `draw`). **Amass** matches include
 * optional `settings.reservesNeededToAmassWin` (defaults by board size from `ouroborosLogic.js`).
 * That key is stable in JSON; in the app UI the same number is labeled **Reserves Until Amass Win Possible**,
 * and the running countdown beside the board is **Amass Reserves** (see `ouroborosLogic.js` naming note).
 *
 * **Import + undo:** {@link replayOuroborosGameForImport} rebuilds an undo stack (one snapshot
 * before each applied move, plus one before imported resign/draw metadata), matching Sumo /
 * Admirals so **Request Undo** works after loading a file.
 */

import {
  OUROBOROS_DEFAULT_IMMEDIATE_OBJECTIVE,
  OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP,
  OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP,
  OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP,
  OUROBOROS_LEGACY_IMMEDIATE_OBJECTIVE_HOOP,
  OUROBOROS_IMMEDIATE_OBJECTIVE_ROAD,
  OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS,
  OUROBOROS_DEFAULT_BOARD_SIZE,
  OUROBOROS_MAX_STACK,
  OUROBOROS_INITIAL_RESERVE_PER_COLOR,
  OUROBOROS_STACK_SCORE_KOMI,
  OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_4,
  OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6,
  OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_8,
  applySnakeMarkerEndOfTurn,
  isGatherTarget,
  isScatterTarget,
} from "./ouroborosLogic.js";

/** @typedef {'white'|'black'} OuroborosColor */
/** @typedef {{ color: OuroborosColor, face: 'blank'|'snake_head' }} OuroborosCellPiece */

export const OUROBOROS_GAMELOG_FORMAT_VERSION = 3;

/** Import-time defaults per `settings.boardSize` (must stay aligned with `OuroborosGameShell` presets). */
const OUROBOROS_SETTINGS_DEFAULTS_BY_BOARD_SIZE = {
  4: {
    initialReservePerColor: 10,
    blackKomi: 0.5,
    maxStackHeight: 3,
    immediateObjectiveType: OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP,
    reservesNeededToAmassWin: OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_4,
  },
  6: {
    initialReservePerColor: OUROBOROS_INITIAL_RESERVE_PER_COLOR,
    blackKomi: 0.5,
    maxStackHeight: OUROBOROS_MAX_STACK,
    immediateObjectiveType: OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP,
    reservesNeededToAmassWin: OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6,
  },
  8: {
    initialReservePerColor: 42,
    blackKomi: 1.5,
    maxStackHeight: 7,
    immediateObjectiveType: OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP,
    reservesNeededToAmassWin: OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_8,
  },
};

function settingsDefaultsForBoardSize(boardSize) {
  return (
    OUROBOROS_SETTINGS_DEFAULTS_BY_BOARD_SIZE[boardSize] ?? {
      initialReservePerColor: OUROBOROS_INITIAL_RESERVE_PER_COLOR,
      blackKomi: OUROBOROS_STACK_SCORE_KOMI,
      maxStackHeight: OUROBOROS_MAX_STACK,
      immediateObjectiveType: OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP,
      reservesNeededToAmassWin: OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6,
    }
  );
}

/**
 * @param {unknown} raw
 * @param {{ immediateObjectiveType: string }} boardDefaults
 */
function normalizeImmediateObjectiveFromGamelog(raw, boardDefaults) {
  if (raw == null || raw === "") {
    return boardDefaults.immediateObjectiveType;
  }
  if (typeof raw !== "string") {
    throw new Error(`Unsupported immediateObjectiveType: ${String(raw)}`);
  }
  if (raw === OUROBOROS_LEGACY_IMMEDIATE_OBJECTIVE_HOOP) {
    return OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP;
  }
  if (
    raw === OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP ||
    raw === OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP ||
    raw === OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP ||
    raw === OUROBOROS_IMMEDIATE_OBJECTIVE_ROAD ||
    raw === OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS
  ) {
    return raw;
  }
  throw new Error(`Unsupported immediateObjectiveType: ${raw}`);
}

/**
 * `big_hoopsnake_win` in JSON is **Large Hoopsnake** in Game Settings (same wording as Large Board).
 *
 * @typedef {{
 *   boardSize: number,
 *   immediateObjectiveType: 'micro_hoopsnake_win' | 'small_hoopsnake_win' | 'big_hoopsnake_win' | 'road' | 'amass',
 *   initialReservePerColor: number,
 *   blackKomi: number,
 *   maxStackHeight: number,
 *   reservesNeededToAmassWin?: number,
 * }} OuroborosGamelogSettings
 */

/** @typedef {'white'|'black'|'draw'|null} OuroborosGamelogWinner */

// ----- Display (sidebar): same pairing as Sumo -----

/**
 * Sidebar “turns”: one object per full round (white’s completed-turn line plus black’s).
 * Display index `i + 1` is the turn number, not a single ply.
 *
 * @param {string[]} moveLines one completed turn per entry, white first in time
 * @returns {{ white: string, black: string | null }[]}
 */
export function ouroborosMovesToGamelogRounds(moveLines) {
  /** @type {{ white: string, black: string | null }[]} */
  const rounds = [];
  for (let i = 0; i < moveLines.length; i += 2) {
    const w = moveLines[i];
    const b = moveLines[i + 1];
    rounds.push({ white: w, black: b ?? null });
  }
  return rounds;
}

// ----- JSON -----

/**
 * @param {string[]} moves completed-turn lines
 * @param {null | 'resign' | 'agreed_draw' | 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win'} termination
 * @param {OuroborosGamelogWinner} [winner] recorded winner (incl. `"draw"` for stack-score tie)
 * @param {OuroborosGamelogSettings} settings
 */
export function serializeOuroborosGamelog(
  moves,
  termination,
  winner = null,
  settings
) {
  const objType =
    settings.immediateObjectiveType ?? OUROBOROS_DEFAULT_IMMEDIATE_OBJECTIVE;
  const boardDefaults = settingsDefaultsForBoardSize(settings.boardSize);
  const normalizedSettings = {
    boardSize: settings.boardSize,
    immediateObjectiveType: objType,
    initialReservePerColor:
      settings.initialReservePerColor ?? OUROBOROS_INITIAL_RESERVE_PER_COLOR,
    blackKomi: settings.blackKomi ?? OUROBOROS_STACK_SCORE_KOMI,
    maxStackHeight: settings.maxStackHeight ?? OUROBOROS_MAX_STACK,
    // Amass-only: omit from JSON when another objective is selected (smaller files, clear intent).
    ...(objType === OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS
      ? {
          reservesNeededToAmassWin:
            settings.reservesNeededToAmassWin ??
            boardDefaults.reservesNeededToAmassWin,
        }
      : {}),
  };
  /** @type {Record<string, unknown>} */
  const payload = {
    // Keep all match configuration at the very top of the file for quick inspection.
    settings: normalizedSettings,
    game: "ouroboros",
    version: OUROBOROS_GAMELOG_FORMAT_VERSION,
    moves,
    termination: termination ?? null,
    // Backward-compatible convenience mirror for older consumers.
    boardSize: normalizedSettings.boardSize,
  };
  if (
    winner != null &&
    (termination === "resign" ||
      termination === "hoopsnake_win" ||
      termination === "road_win" ||
      termination === "amass_win" ||
      termination === "stack_score_win")
  ) {
    payload.winner = winner;
  }
  return JSON.stringify(payload, null, 2);
}

/**
 * @param {string} text
 * @returns {{
 *   moves: string[],
 *   termination: null | 'resign' | 'agreed_draw' | 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win',
 *   winner: OuroborosGamelogWinner,
 *   boardSize: number,
 *   immediateObjectiveType: 'micro_hoopsnake_win' | 'small_hoopsnake_win' | 'big_hoopsnake_win' | 'road' | 'amass',
 *   initialReservePerColor: number,
 *   blackKomi: number,
 *   maxStackHeight: number,
 *   reservesNeededToAmassWin: number,
 * }}
 */
export function parseOuroborosGamelogJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file.");
  }
  if (data == null || typeof data !== "object") {
    throw new Error("Invalid file shape.");
  }
  const ver = data.version;
  if (ver !== 1 && ver !== 2 && ver !== 3) {
    throw new Error(`Unsupported gamelog version: ${ver ?? "?"}`);
  }
  if (data.game != null && data.game !== "ouroboros") {
    throw new Error("This file is not an Ouroboros gamelog.");
  }
  if (!Array.isArray(data.moves)) {
    throw new Error("Missing moves array.");
  }
  const rawSettings =
    data.settings != null && typeof data.settings === "object"
      ? data.settings
      : null;
  const rawBoardSize = rawSettings?.boardSize ?? data.boardSize;
  const boardSize =
    typeof rawBoardSize === "number" && Number.isInteger(rawBoardSize)
      ? rawBoardSize
      : OUROBOROS_DEFAULT_BOARD_SIZE;
  if (boardSize < 4 || boardSize > 26) {
    throw new Error("Invalid boardSize value.");
  }
  const boardDefaults = settingsDefaultsForBoardSize(boardSize);
  const rawImmediateObjectiveType = rawSettings?.immediateObjectiveType;
  const immediateObjectiveType = normalizeImmediateObjectiveFromGamelog(
    rawImmediateObjectiveType,
    boardDefaults
  );
  const rawInitialReservePerColor = rawSettings?.initialReservePerColor;
  const initialReservePerColor =
    typeof rawInitialReservePerColor === "number" &&
    Number.isInteger(rawInitialReservePerColor)
      ? rawInitialReservePerColor
      : boardDefaults.initialReservePerColor;
  if (initialReservePerColor < 1) {
    throw new Error("Invalid initialReservePerColor value.");
  }
  const rawBlackKomi = rawSettings?.blackKomi;
  const blackKomi =
    typeof rawBlackKomi === "number" ? rawBlackKomi : boardDefaults.blackKomi;
  if (!Number.isFinite(blackKomi) || blackKomi < 0) {
    throw new Error("Invalid blackKomi value.");
  }
  const rawMaxStackHeight = rawSettings?.maxStackHeight;
  const maxStackHeight =
    typeof rawMaxStackHeight === "number" &&
    Number.isInteger(rawMaxStackHeight) &&
    rawMaxStackHeight >= 2
      ? rawMaxStackHeight
      : boardDefaults.maxStackHeight;
  // Always resolved so import can hydrate shell state; ignored when objective ≠ Amass.
  const rawReservesNeededToAmassWin = rawSettings?.reservesNeededToAmassWin;
  const reservesNeededToAmassWin =
    typeof rawReservesNeededToAmassWin === "number" &&
    Number.isInteger(rawReservesNeededToAmassWin) &&
    rawReservesNeededToAmassWin >= 1
      ? rawReservesNeededToAmassWin
      : boardDefaults.reservesNeededToAmassWin;
  const term = data.termination;
  const allowed =
    term == null ||
    term === "resign" ||
    term === "agreed_draw" ||
    term === "hoopsnake_win" ||
    term === "road_win" ||
    term === "amass_win" ||
    term === "stack_score_win";
  if (!allowed) {
    throw new Error("Invalid termination value.");
  }
  for (let i = 0; i < data.moves.length; i++) {
    const m = data.moves[i];
    if (typeof m !== "string" || !m.trim()) {
      throw new Error(`Invalid move at index ${i}.`);
    }
  }
  const w = data.winner;
  /** @type {OuroborosGamelogWinner} */
  let winner = null;
  if (w === "white" || w === "black" || w === "draw") {
    winner = w;
  } else if (w != null && w !== "") {
    throw new Error("Invalid winner value.");
  }
  if (
    ver === 1 &&
    (term === "hoopsnake_win" ||
      term === "road_win" ||
      term === "amass_win" ||
      term === "stack_score_win")
  ) {
    throw new Error("This gamelog requires version 2 for natural outcomes.");
  }
  if (
    (ver === 2 || ver === 3) &&
    (term === "hoopsnake_win" ||
      term === "road_win" ||
      term === "amass_win" ||
      term === "stack_score_win") &&
    winner == null
  ) {
    throw new Error("Natural outcome gamelog must include winner (or draw).");
  }
  return {
    moves: data.moves,
    termination: term ?? null,
    winner,
    boardSize,
    immediateObjectiveType,
    initialReservePerColor,
    blackKomi,
    maxStackHeight,
    reservesNeededToAmassWin,
  };
}

// ----- Parsing & replay -----

/** @param {string} c */
function assertValidCoord(c, boardSize = OUROBOROS_DEFAULT_BOARD_SIZE) {
  const file = c[0];
  const rank = Number(c.slice(1));
  const col = file.charCodeAt(0) - 96;
  if (
    !/^[a-z][0-9]+$/.test(c) ||
    !Number.isInteger(rank) ||
    col < 1 ||
    col > boardSize ||
    rank < 1 ||
    rank > boardSize
  ) {
    throw new Error(`Invalid square: ${c}`);
  }
}

/**
 * G/S moves use `-` between squares (e.g. `Ga1-a2`). `+` is still split on for legacy gamelogs.
 *
 * @param {string} line
 * @returns {{ type: 'place', coord: string } | { type: 'gather', source: string, targets: string[] } | { type: 'scatter', source: string, targets: string[] }}
 */
export function parseOuroborosMoveLine(
  line,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE
) {
  const s = line.trim();
  if (!s) throw new Error("Empty move line.");

  if (/^[a-z][0-9]+$/i.test(s)) {
    const coord = s.toLowerCase();
    assertValidCoord(coord, boardSize);
    return { type: "place", coord };
  }

  const head = s[0];
  const rest = s.slice(1);
  if ((head === "G" || head === "g") && rest.length > 0) {
    const parts = rest
      .split(/[-+]/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length < 1) throw new Error("Gather move needs a source square.");
    for (const p of parts) assertValidCoord(p, boardSize);
    return { type: "gather", source: parts[0], targets: parts.slice(1) };
  }

  if ((head === "S" || head === "s") && rest.length > 0) {
    const parts = rest
      .split(/[-+]/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length < 1) throw new Error("Scatter move needs a source square.");
    for (const p of parts) assertValidCoord(p, boardSize);
    return { type: "scatter", source: parts[0], targets: parts.slice(1) };
  }

  throw new Error(`Unrecognized move notation: ${line}`);
}

/**
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 */
function cloneStacksRecord(stacks) {
  /** @type {Record<string, OuroborosCellPiece[]>} */
  const out = {};
  for (const key of Object.keys(stacks)) {
    out[key] = (stacks[key] ?? []).map((p) => ({ ...p }));
  }
  return out;
}

/**
 * @param {Record<string, OuroborosCellPiece[]>} draft
 * @param {string} source
 * @param {string} targetCoord
 */
function applyGatherMutation(draft, source, targetCoord, maxStackHeight) {
  const src = [...(draft[source] ?? [])];
  const tgt = [...(draft[targetCoord] ?? [])];
  if (src.length >= maxStackHeight) return null;
  if (tgt.length === 0) return null;
  const lifted = tgt.pop();
  if (!lifted) return null;
  src.push(lifted);
  return { ...draft, [source]: src, [targetCoord]: tgt };
}

/**
 * @param {Record<string, OuroborosCellPiece[]>} draft
 * @param {string} source
 * @param {string} targetCoord
 */
function applyScatterMutation(draft, source, targetCoord, maxStackHeight) {
  const src = [...(draft[source] ?? [])];
  const tgt = [...(draft[targetCoord] ?? [])];
  if (src.length === 0) return null;
  if (tgt.length >= maxStackHeight) return null;
  const lifted = src.pop();
  if (!lifted) return null;
  tgt.push(lifted);
  return { ...draft, [source]: src, [targetCoord]: tgt };
}

/**
 * Snapshot shape stored on the undo stack during import (between turns: no draft).
 * Matches the shell’s `OuroborosUndoSnapshot` so `Request Undo` can restore after **Import Game**.
 *
 * @typedef {{
 *   stackByCoord: Record<string, OuroborosCellPiece[]>,
 *   piece_reserve: { white: number, black: number },
 *   turn: 'white'|'black',
 *   moveHistory: string[],
 *   interaction: null,
 *   draftStacks: null,
 *   draftNotation: { kind: null, source: string, targets: string[] },
 *   pendingSnakeTopCoord: null,
 *   termination: null,
 *   resignedWinner: null,
 *   naturalOutcome: null,
 * }} OuroborosImportUndoSnapshot
 */

/**
 * Apply one parsed turn; mutates `stackByCoord`, `piece_reserve`, `turn` (throws on illegal play).
 *
 * @param {string} line raw gamelog line
 * @param {Record<string, OuroborosCellPiece[]>} stackByCoord
 * @param {{ white: number, black: number }} piece_reserve
 * @param {'white'|'black'} turn
 * @param {number} moveIndex 1-based for error messages
 */
function applyOuroborosMoveLineToState(
  line,
  stackByCoord,
  piece_reserve,
  turn,
  moveIndex,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  const parsed = parseOuroborosMoveLine(line, boardSize);

  if (parsed.type === "place") {
    const coord = parsed.coord;
    if ((stackByCoord[coord] ?? []).length > 0) {
      throw new Error(`Square ${coord} already has pieces (move ${moveIndex}).`);
    }
    if (piece_reserve[turn] <= 0) {
      throw new Error(`No pieces in reserve for ${turn} (move ${moveIndex}).`);
    }
    let next = {
      ...stackByCoord,
      [coord]: [
        ...(stackByCoord[coord] ?? []),
        { color: turn, face: /** @type {const} */ ("blank") },
      ].slice(0, maxStackHeight),
    };
    next = applySnakeMarkerEndOfTurn(next, coord);
    for (const k of Object.keys(stackByCoord)) delete stackByCoord[k];
    Object.assign(stackByCoord, next);
    piece_reserve[turn] = Math.max(0, piece_reserve[turn] - 1);
    return turn === "white" ? "black" : "white";
  }

  if (parsed.type === "gather") {
    const { source, targets } = parsed;
    let draft = cloneStacksRecord(stackByCoord);
    const range = (draft[source] ?? []).length;
    if (range < 1) {
      throw new Error(`Gather source ${source} empty (move ${moveIndex}).`);
    }
    for (let ti = 0; ti < targets.length; ti++) {
      const t = targets[ti];
      if (!isGatherTarget(t, source, draft, range, boardSize, maxStackHeight)) {
        throw new Error(
          `Illegal Gather from ${t} onto ${source} (step ${ti + 1}, move ${moveIndex}).`
        );
      }
      const nextDraft = applyGatherMutation(draft, source, t, maxStackHeight);
      if (!nextDraft) {
        throw new Error(`Gather mutation failed (step ${ti + 1}, move ${moveIndex}).`);
      }
      draft = nextDraft;
    }
    const merged =
      targets.length > 0 ? applySnakeMarkerEndOfTurn(draft, source) : draft;
    for (const k of Object.keys(stackByCoord)) delete stackByCoord[k];
    Object.assign(stackByCoord, merged);
    return turn === "white" ? "black" : "white";
  }

  if (parsed.type === "scatter") {
    const { source, targets } = parsed;
    let draft = cloneStacksRecord(stackByCoord);
    const range = (draft[source] ?? []).length;
    if (range < 1) {
      throw new Error(`Scatter source ${source} empty (move ${moveIndex}).`);
    }
    for (let ti = 0; ti < targets.length; ti++) {
      const t = targets[ti];
      if (!isScatterTarget(t, source, draft, range, boardSize, maxStackHeight)) {
        throw new Error(
          `Illegal Scatter to ${t} from ${source} (step ${ti + 1}, move ${moveIndex}).`
        );
      }
      const nextDraft = applyScatterMutation(draft, source, t, maxStackHeight);
      if (!nextDraft) {
        throw new Error(`Scatter mutation failed (step ${ti + 1}, move ${moveIndex}).`);
      }
      draft = nextDraft;
    }
    const merged =
      targets.length > 0
        ? applySnakeMarkerEndOfTurn(draft, targets[targets.length - 1])
        : draft;
    for (const k of Object.keys(stackByCoord)) delete stackByCoord[k];
    Object.assign(stackByCoord, merged);
    return turn === "white" ? "black" : "white";
  }

  return turn;
}

/**
 * Push “clean” between-turn state (mirrors live play after **End Turn** / place).
 *
 * @param {OuroborosImportUndoSnapshot[]} undoStack
 * @param {Record<string, OuroborosCellPiece[]>} stackByCoord
 * @param {{ white: number, black: number }} piece_reserve
 * @param {'white'|'black'} turn
 * @param {string[]} moveHistory
 */
function pushImportUndoSnapshot(undoStack, stackByCoord, piece_reserve, turn, moveHistory) {
  undoStack.push({
    stackByCoord: cloneStacksRecord(stackByCoord),
    piece_reserve: { ...piece_reserve },
    turn,
    moveHistory: [...moveHistory],
    interaction: null,
    draftStacks: null,
    draftNotation: { kind: null, source: "", targets: [] },
    pendingSnakeTopCoord: null,
    termination: null,
    resignedWinner: null,
    naturalOutcome: null,
  });
}

/**
 * Replay `moves` from empty board, build **undo stack** for import (Sumo / Admirals pattern).
 *
 * Stack order: snapshot before each move, then (if `importedTermination` is resign or agreed
 * draw) one more snapshot before that outcome — so undo can strip **RESIGNED** / **AGREED DRAW**.
 *
 * @param {string[]} moves
 * @param {'resign'|'agreed_draw'|'hoopsnake_win'|'road_win'|'amass_win'|'stack_score_win'|null} importedTermination
 * @param {number} [boardSize]
 * @param {number} [initialReservePerColor]
 * @returns {{
 *   stackByCoord: Record<string, OuroborosCellPiece[]>,
 *   piece_reserve: { white: number, black: number },
 *   turn: 'white'|'black',
 *   moveHistory: string[],
 *   undoStack: OuroborosImportUndoSnapshot[],
 * }}
 */
export function replayOuroborosGameForImport(
  moves,
  importedTermination,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  initialReservePerColor = OUROBOROS_INITIAL_RESERVE_PER_COLOR,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  /** @type {Record<string, OuroborosCellPiece[]>} */
  const stackByCoord = {};
  const piece_reserve = {
    white: initialReservePerColor,
    black: initialReservePerColor,
  };
  /** @type {'white'|'black'} */
  let turn = "white";
  /** @type {string[]} */
  const moveHistory = [];
  /** @type {OuroborosImportUndoSnapshot[]} */
  const undoStack = [];

  for (let mi = 0; mi < moves.length; mi++) {
    pushImportUndoSnapshot(undoStack, stackByCoord, piece_reserve, turn, moveHistory);
    turn = applyOuroborosMoveLineToState(
      moves[mi],
      stackByCoord,
      piece_reserve,
      turn,
      mi + 1,
      boardSize,
      maxStackHeight
    );
    moveHistory.push(moves[mi]);
  }

  if (
    importedTermination === "resign" ||
    importedTermination === "agreed_draw"
  ) {
    pushImportUndoSnapshot(undoStack, stackByCoord, piece_reserve, turn, moveHistory);
  }

  return {
    stackByCoord: cloneStacksRecord(stackByCoord),
    piece_reserve: { ...piece_reserve },
    turn,
    moveHistory: [...moveHistory],
    undoStack,
  };
}

/**
 * Replay `moves` from empty board and full reserves (no undo stack). Prefer
 * {@link replayOuroborosGameForImport} when loading a file.
 *
 * @param {string[]} moves
 * @returns {{
 *   stackByCoord: Record<string, OuroborosCellPiece[]>,
 *   piece_reserve: { white: number, black: number },
 *   turn: 'white'|'black',
 * }}
 */
export function replayOuroborosFromMoves(
  moves,
  boardSize = OUROBOROS_DEFAULT_BOARD_SIZE,
  initialReservePerColor = OUROBOROS_INITIAL_RESERVE_PER_COLOR,
  maxStackHeight = OUROBOROS_MAX_STACK
) {
  const r = replayOuroborosGameForImport(
    moves,
    null,
    boardSize,
    initialReservePerColor,
    maxStackHeight
  );
  return {
    stackByCoord: r.stackByCoord,
    piece_reserve: r.piece_reserve,
    turn: r.turn,
  };
}
