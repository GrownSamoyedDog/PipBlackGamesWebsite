/**
 * Admirals **board model** only: cell shape, starting position on the 91-hex board, deep clone.
 *
 * Rules and LOS live in `admiralsLogic.js`; persistence notation in `admiralsGamelog.js`.
 * Each hex may hold white/black half-ships and at most one admiral per color (`dead` flag).
 */

/**
 * @typedef {Object} AdmiralsCell
 * @property {boolean} whiteShip
 * @property {boolean} blackShip
 * @property {{ dead: boolean } | null} whiteAdmiral null = absent; dead=true → X mark
 * @property {{ dead: boolean } | null} blackAdmiral
 */

/** @returns {AdmiralsCell} */
export function emptyAdmiralsCell() {
  return {
    whiteShip: false,
    blackShip: false,
    whiteAdmiral: null,
    blackAdmiral: null,
  };
}

function coordFromFileRank(fileIndex, rank) {
  const file = String.fromCharCode("a".charCodeAt(0) + fileIndex - 1);
  return `${file}${rank}`;
}

function buildAdmiralsOpeningSetup(sideLength) {
  const L = Math.max(3, Math.floor(sideLength));
  const smallSetup = {
    white: ["c3", "i6", "f9"],
    black: ["i9", "f3", "c6"],
  };
  if (L === 6) return smallSetup;
  if (L === 12) {
    return {
      white: ["c3", "l21", "u12", "f12", "r18", "l6", "i9", "l15", "o12"],
      black: ["c12", "u21", "l3", "f6", "l18", "r12", "i12", "o15", "l9"],
    };
  }
  if (L === 9) {
    return {
      white: ["f6", "i12", "l9", "c9", "o15", "i3"],
      black: ["f9", "l12", "i6", "c3", "i15", "o9"],
    };
  }
  const inner = Math.max(2, L - 1);
  const far = 2 * L - 3;
  const white = [
    coordFromFileRank(inner, inner),
    coordFromFileRank(far, L),
    coordFromFileRank(L, far),
  ];
  const black = [
    coordFromFileRank(far, far),
    coordFromFileRank(L, inner),
    coordFromFileRank(inner, L),
  ];
  return { white, black };
}

/**
 * @param {{ id: string, q: number, r: number }[]} cells
 * @returns {Record<string, AdmiralsCell>}
 */
export function createInitialAdmiralsBoard(cells, sideLength = 6) {
  /** @type {Record<string, AdmiralsCell>} */
  const board = Object.fromEntries(cells.map((c) => [c.id, emptyAdmiralsCell()]));
  const { white: WHITE_SETUP, black: BLACK_SETUP } =
    buildAdmiralsOpeningSetup(sideLength);

  for (const id of [...WHITE_SETUP, ...BLACK_SETUP]) {
    if (!board[id]) {
      throw new Error(`Admirals: setup cell ${id} is not on this board.`);
    }
  }

  for (const id of WHITE_SETUP) {
    board[id].whiteShip = true;
    board[id].whiteAdmiral = { dead: false };
  }
  for (const id of BLACK_SETUP) {
    board[id].blackShip = true;
    board[id].blackAdmiral = { dead: false };
  }

  return board;
}

/** Deep copy for immutable updates. */
export function cloneAdmiralsBoard(board) {
  /** @type {Record<string, AdmiralsCell>} */
  const next = {};
  for (const [id, cell] of Object.entries(board)) {
    next[id] = {
      whiteShip: cell.whiteShip,
      blackShip: cell.blackShip,
      whiteAdmiral: cell.whiteAdmiral
        ? { dead: cell.whiteAdmiral.dead }
        : null,
      blackAdmiral: cell.blackAdmiral
        ? { dead: cell.blackAdmiral.dead }
        : null,
    };
  }
  return next;
}
