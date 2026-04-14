/**
 * Mimoveyumove core rules and board helpers.
 *
 * Board model:
 * - 10x10 physical grid with edge spawners and 8x8 playable interior.
 * - Exactly one piece per cell.
 */

export const MIMO_PIECE_WHITE_MIGO = "white_migo";
export const MIMO_PIECE_WHITE_YUGO = "white_yugo";
export const MIMO_PIECE_WHITE_SPAWNER = "white_spawner";
export const MIMO_PIECE_BLACK_MIGO = "black_migo";
export const MIMO_PIECE_BLACK_YUGO = "black_yugo";
export const MIMO_PIECE_BLACK_SPAWNER = "black_spawner";

export const MIMO_FILES = [
  "z",
  ...Array.from({ length: 9 }, (_, i) => String.fromCharCode(97 + i)),
];

const BOARD_SIZE = 10;
const QUEEN_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const LINE_AXES = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/**
 * @returns {Record<string, string>}
 */
export function createInitialMimoBoard() {
  /** @type {Record<string, string>} */
  const setup = {};
  const whiteSpawners = [
    "z4",
    "z3",
    "z2",
    "z1",
    "z0",
    "a0",
    "b0",
    "c0",
    "d0",
    "e0",
    "f0",
    "g0",
    "h0",
    "i0",
    "i1",
    "i2",
    "i3",
    "i4",
  ];
  const blackSpawners = [
    "z5",
    "z6",
    "z7",
    "z8",
    "z9",
    "a9",
    "b9",
    "c9",
    "d9",
    "e9",
    "f9",
    "g9",
    "h9",
    "i9",
    "i8",
    "i7",
    "i6",
    "i5",
  ];
  for (const coord of whiteSpawners) setup[coord] = MIMO_PIECE_WHITE_SPAWNER;
  for (const coord of blackSpawners) setup[coord] = MIMO_PIECE_BLACK_SPAWNER;
  return setup;
}

/**
 * Backward compatibility for older placeholder imports (`white`/`black` entries).
 * @param {string | undefined | null} raw
 */
export function normalizeMimoPiece(raw) {
  if (raw === "white") return MIMO_PIECE_WHITE_MIGO;
  if (raw === "black") return MIMO_PIECE_BLACK_MIGO;
  return raw ?? null;
}

/**
 * @param {string | null | undefined} piece
 * @returns {'white' | 'black' | null}
 */
export function mimoPieceColor(piece) {
  if (
    piece === MIMO_PIECE_WHITE_MIGO ||
    piece === MIMO_PIECE_WHITE_YUGO ||
    piece === MIMO_PIECE_WHITE_SPAWNER
  ) {
    return "white";
  }
  if (
    piece === MIMO_PIECE_BLACK_MIGO ||
    piece === MIMO_PIECE_BLACK_YUGO ||
    piece === MIMO_PIECE_BLACK_SPAWNER
  ) {
    return "black";
  }
  return null;
}

/**
 * @param {string | null | undefined} piece
 * @returns {'spawner' | 'migo' | 'yugo' | null}
 */
export function mimoPieceRole(piece) {
  if (piece === MIMO_PIECE_WHITE_SPAWNER || piece === MIMO_PIECE_BLACK_SPAWNER) {
    return "spawner";
  }
  if (piece === MIMO_PIECE_WHITE_MIGO || piece === MIMO_PIECE_BLACK_MIGO) return "migo";
  if (piece === MIMO_PIECE_WHITE_YUGO || piece === MIMO_PIECE_BLACK_YUGO) return "yugo";
  return null;
}

/**
 * @param {string} coord
 * @returns {{ fileIndex: number, rank: number } | null}
 */
export function mimoCoordToPos(coord) {
  if (typeof coord !== "string" || coord.length < 2) return null;
  const file = coord[0];
  const fileIndex = MIMO_FILES.indexOf(file);
  const rank = Number.parseInt(coord.slice(1), 10);
  if (fileIndex < 0 || !Number.isFinite(rank)) return null;
  return { fileIndex, rank };
}

/**
 * @param {number} fileIndex
 * @param {number} rank
 * @returns {string | null}
 */
export function mimoPosToCoord(fileIndex, rank) {
  if (
    fileIndex < 0 ||
    fileIndex >= BOARD_SIZE ||
    rank < 0 ||
    rank >= BOARD_SIZE
  ) {
    return null;
  }
  return `${MIMO_FILES[fileIndex]}${rank}`;
}

/**
 * @param {string} coord
 */
export function mimoIsInteriorCoord(coord) {
  const pos = mimoCoordToPos(coord);
  if (!pos) return false;
  return (
    pos.fileIndex > 0 &&
    pos.fileIndex < BOARD_SIZE - 1 &&
    pos.rank > 0 &&
    pos.rank < BOARD_SIZE - 1
  );
}

function isOwnColorPlayablePiece(piece, color) {
  return (
    piece === `${color}_migo` ||
    piece === `${color}_yugo`
  );
}

function runAlongAxis(board, startCoord, color, df, dr) {
  const startPos = mimoCoordToPos(startCoord);
  if (!startPos) return [];
  /** @type {string[]} */
  const left = [];
  /** @type {string[]} */
  const right = [];

  let f = startPos.fileIndex - df;
  let r = startPos.rank - dr;
  while (true) {
    const c = mimoPosToCoord(f, r);
    if (!c) break;
    const p = normalizeMimoPiece(board[c]);
    if (!isOwnColorPlayablePiece(p, color)) break;
    left.push(c);
    f -= df;
    r -= dr;
  }

  f = startPos.fileIndex + df;
  r = startPos.rank + dr;
  while (true) {
    const c = mimoPosToCoord(f, r);
    if (!c) break;
    const p = normalizeMimoPiece(board[c]);
    if (!isOwnColorPlayablePiece(p, color)) break;
    right.push(c);
    f += df;
    r += dr;
  }

  return [...left.reverse(), startCoord, ...right];
}

function collectExactFourOwnLinesThroughCoord(board, coord, color) {
  /** @type {string[][]} */
  const lines = [];
  for (const [df, dr] of LINE_AXES) {
    const run = runAlongAxis(board, coord, color, df, dr);
    if (run.length === 4) lines.push(run);
  }
  return lines;
}

function createsOverlineThroughCoord(board, coord, color) {
  for (const [df, dr] of LINE_AXES) {
    const run = runAlongAxis(board, coord, color, df, dr);
    if (run.length > 4) return true;
  }
  return false;
}

/**
 * Legal destinations from a selected piece after:
 * 1) queen line-of-sight,
 * 2) interior-only filter,
 * 3) anti-overline rule (no >4 own playable pieces in line).
 *
 * @param {Record<string, string>} board
 * @param {string} source
 * @param {'spawn'|'move'} mode
 * @param {'white'|'black'} actor
 * @returns {Set<string>}
 */
export function collectLegalTargets(board, source, mode, actor) {
  const sourcePos = mimoCoordToPos(source);
  if (!sourcePos) return new Set();

  /** @type {Set<string>} */
  const out = new Set();
  for (const [df, dr] of QUEEN_DIRECTIONS) {
    let f = sourcePos.fileIndex + df;
    let r = sourcePos.rank + dr;
    while (f >= 0 && f < BOARD_SIZE && r >= 0 && r < BOARD_SIZE) {
      const coord = mimoPosToCoord(f, r);
      if (!coord) break;
      if (normalizeMimoPiece(board[coord])) break;
      if (mimoIsInteriorCoord(coord)) {
        const simulated = { ...board };
        if (mode === "move") {
          const sourcePiece = normalizeMimoPiece(board[source]);
          if (!sourcePiece) break;
          delete simulated[source];
          simulated[coord] = sourcePiece;
        } else {
          simulated[coord] =
            actor === "white" ? MIMO_PIECE_WHITE_MIGO : MIMO_PIECE_BLACK_MIGO;
        }
        if (!createsOverlineThroughCoord(simulated, coord, actor)) {
          out.add(coord);
        }
      }
      f += df;
      r += dr;
    }
  }
  return out;
}

/**
 * @param {Record<string, string>} board
 * @returns {{ white: number, black: number }}
 */
export function computeMimoYugoScores(board) {
  let white = 0;
  let black = 0;
  for (const piece of Object.values(board)) {
    const p = normalizeMimoPiece(piece);
    if (p === MIMO_PIECE_WHITE_YUGO) white += 1;
    else if (p === MIMO_PIECE_BLACK_YUGO) black += 1;
  }
  return { white, black };
}

/**
 * @param {Record<string, string>} board
 */
export function isInteriorFull(board) {
  for (let f = 1; f < BOARD_SIZE - 1; f++) {
    for (let r = 1; r < BOARD_SIZE - 1; r++) {
      const coord = mimoPosToCoord(f, r);
      if (!coord) continue;
      if (!normalizeMimoPiece(board[coord])) return false;
    }
  }
  return true;
}

/**
 * @param {Record<string, string>} board
 * @param {'white'|'black'} player
 */
export function playerHasAnyLegalAction(board, player) {
  for (const [coord, rawPiece] of Object.entries(board)) {
    const piece = normalizeMimoPiece(rawPiece);
    if (mimoPieceColor(piece) !== player) continue;
    const role = mimoPieceRole(piece);
    if (role === "spawner") {
      if (collectLegalTargets(board, coord, "spawn", player).size > 0) return true;
    } else if (role === "migo") {
      if (collectLegalTargets(board, coord, "move", player).size > 0) return true;
    }
  }
  return false;
}

/**
 * Returns all exact-length-4 contiguous Yugo lines for one color.
 * Lines longer than 4 are intentionally excluded.
 *
 * @param {Record<string, string>} board
 * @param {'white'|'black'} color
 * @returns {string[][]}
 */
function collectExactFourYugoLines(board, color) {
  /** @type {string[][]} */
  const lines = [];
  for (let f = 0; f < BOARD_SIZE; f++) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      const start = mimoPosToCoord(f, r);
      if (!start) continue;
      const p = normalizeMimoPiece(board[start]);
      if (p !== `${color}_yugo`) continue;
      for (const [df, dr] of LINE_AXES) {
        const prev = mimoPosToCoord(f - df, r - dr);
        if (prev && normalizeMimoPiece(board[prev]) === `${color}_yugo`) continue;
        let len = 0;
        let cf = f;
        let cr = r;
        while (true) {
          const c = mimoPosToCoord(cf, cr);
          if (!c) break;
          if (normalizeMimoPiece(board[c]) !== `${color}_yugo`) break;
          len += 1;
          cf += df;
          cr += dr;
        }
        if (len === 4) {
          lines.push([
            start,
            mimoPosToCoord(f + df, r + dr),
            mimoPosToCoord(f + 2 * df, r + 2 * dr),
            mimoPosToCoord(f + 3 * df, r + 3 * dr),
          ].filter(Boolean));
        }
      }
    }
  }
  return lines;
}

/**
 * Applies one validated spawn/move action.
 *
 * Yugo creation rule:
 * - if the landing square creates one or more exact-4 own-color lines,
 *   landing piece becomes a yugo and own-color migos on those lines are removed.
 *
 * @param {Record<string, string>} board
 * @param {{ source: string, target: string, mode: 'spawn'|'move' }} action
 * @param {'white'|'black'} actor
 * @returns {{ board: Record<string, string>, yugoLineCount: number }}
 */
export function applyMimoAction(board, action, actor) {
  const next = { ...board };
  const migoPiece = actor === "white" ? MIMO_PIECE_WHITE_MIGO : MIMO_PIECE_BLACK_MIGO;
  const yugoPiece = actor === "white" ? MIMO_PIECE_WHITE_YUGO : MIMO_PIECE_BLACK_YUGO;
  if (action.mode === "move") {
    delete next[action.source];
    next[action.target] = migoPiece;
  } else {
    next[action.target] = migoPiece;
  }

  const exactLines = collectExactFourOwnLinesThroughCoord(next, action.target, actor);
  const yugoLineCount = exactLines.length;
  if (yugoLineCount > 0) {
    next[action.target] = yugoPiece;
    const keep = new Set([action.target]);
    for (const line of exactLines) {
      for (const coord of line) keep.add(coord);
    }
    for (const coord of keep) {
      if (coord === action.target) continue;
      if (normalizeMimoPiece(next[coord]) === migoPiece) {
        delete next[coord];
      }
    }
  }

  return { board: next, yugoLineCount };
}

/**
 * @param {Record<string, string>} board
 * @param {'white'|'black'} actor
 * @returns {'white'|'black'|null}
 */
export function evaluateIgoWinner(board, actor) {
  return collectExactFourYugoLines(board, actor).length > 0 ? actor : null;
}

/**
 * Union of all coordinates that belong to exact-4 Yugo lines for one color.
 * Used by the shell to keep winning Igo patterns visible after game end.
 *
 * @param {Record<string, string>} board
 * @param {'white'|'black'} color
 * @returns {Set<string>}
 */
export function collectIgoHighlightCoords(board, color) {
  const out = new Set();
  const lines = collectExactFourYugoLines(board, color);
  for (const line of lines) {
    for (const coord of line) out.add(coord);
  }
  return out;
}

/**
 * @param {Record<string, string>} board
 * @returns {'white'|'black'|'draw'}
 */
export function evaluateWegoOutcome(board) {
  const scores = computeMimoYugoScores(board);
  if (scores.white > scores.black) return "white";
  if (scores.black > scores.white) return "black";
  return "draw";
}
