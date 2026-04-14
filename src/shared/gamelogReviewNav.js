/**
 * Shared math for gamelog **review** / scrub mode (Sumo, Admirals, Ouroboros).
 *
 * **Ply:** one step in the flat gamelog array —
 * - Sumo: one stone placement (cell id),
 * - Ouroboros: one completed-turn line in `moveHistory`,
 * - Admirals: one `AdmiralsTurnRecord`.
 *
 * **GAME END:** when the match has finished, shells show one extra scrub position after the last
 * ply (`includeTermination: true`). The board matches “after all plies”; the UI treats the final
 * outcome as active (and may open the game-over modal on that step).
 */

/**
 * @typedef {{ plies: number, includeTermination: boolean }} GamelogReviewPointer
 */

/**
 * True when `termination` is a value persisted in JSON (resign, draw, or Ouroboros natural keys).
 *
 * @param {null | 'resign' | 'agreed_draw' | 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win'} termination
 * @returns {boolean}
 */
export function gamelogReviewHasTermination(termination) {
  return (
    termination === "resign" ||
    termination === "agreed_draw" ||
    termination === "hoopsnake_win" ||
    termination === "road_win" ||
    termination === "amass_win" ||
    termination === "stack_score_win"
  );
}

/**
 * Whether the sidebar shows **GAME END** and the scrubber gets one more step after the last ply.
 *
 * - **Recorded** endings: `termination` is resign, agreed draw, or an Ouroboros natural key.
 * - **Sumo / Admirals rule wins:** `termination` is still null but `naturalOutcomeAtEndOfMoves` is
 *   set from a full replay (see shells).
 *
 * @param {null | 'resign' | 'agreed_draw' | 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win'} termination
 * @param {'white'|'black'|'draw'|null} naturalOutcomeAtEndOfMoves
 */
export function gamelogReviewHasTerminalStep(
  termination,
  naturalOutcomeAtEndOfMoves
) {
  if (gamelogReviewHasTermination(termination)) return true;
  return naturalOutcomeAtEndOfMoves != null;
}

/**
 * Highest linear index in the review strip (inclusive). Index 0 = before any ply.
 *
 * @param {number} totalPlies `moveHistory.length` or `admiralsTurns.length`
 * @param {boolean} hasTermination
 */
export function gamelogReviewMaxPositionIndex(totalPlies, hasTermination) {
  return totalPlies + (hasTermination ? 1 : 0);
}

/**
 * @param {number} index 0 .. {@link gamelogReviewMaxPositionIndex}
 * @param {number} totalPlies
 * @param {boolean} hasTermination
 * @returns {GamelogReviewPointer}
 */
export function gamelogReviewIndexToPointer(index, totalPlies, hasTermination) {
  const maxI = gamelogReviewMaxPositionIndex(totalPlies, hasTermination);
  const i = Math.max(0, Math.min(index, maxI));
  if (i === 0) return { plies: 0, includeTermination: false };
  if (hasTermination && i === maxI) {
    return { plies: totalPlies, includeTermination: true };
  }
  return { plies: i, includeTermination: false };
}

/**
 * @param {GamelogReviewPointer | null} pointer
 * @param {number} totalPlies
 * @param {boolean} hasTermination
 * @returns {number}
 */
export function gamelogReviewPointerToIndex(
  pointer,
  totalPlies,
  hasTermination
) {
  if (!pointer) return 0;
  if (
    pointer.includeTermination &&
    hasTermination &&
    pointer.plies === totalPlies
  ) {
    return gamelogReviewMaxPositionIndex(totalPlies, hasTermination);
  }
  return Math.min(Math.max(0, pointer.plies), totalPlies);
}

/**
 * @param {GamelogReviewPointer} pointer
 * @param {number} totalPlies
 * @param {boolean} hasTermination
 * @param {number} delta -1 or +1 for step back / forward
 * @returns {GamelogReviewPointer}
 */
export function gamelogReviewStepBy(
  pointer,
  totalPlies,
  hasTermination,
  delta
) {
  const idx = gamelogReviewPointerToIndex(pointer, totalPlies, hasTermination);
  return gamelogReviewIndexToPointer(
    idx + delta,
    totalPlies,
    hasTermination
  );
}

/**
 * @param {number} totalPlies
 * @param {boolean} hasTermination
 * @returns {GamelogReviewPointer}
 */
export function gamelogReviewGoFirst(totalPlies, hasTermination) {
  return gamelogReviewIndexToPointer(0, totalPlies, hasTermination);
}

/**
 * @param {number} totalPlies
 * @param {boolean} hasTermination
 * @returns {GamelogReviewPointer}
 */
export function gamelogReviewGoLast(totalPlies, hasTermination) {
  return gamelogReviewIndexToPointer(
    gamelogReviewMaxPositionIndex(totalPlies, hasTermination),
    totalPlies,
    hasTermination
  );
}

/**
 * 1-based fraction for the review banner (`Review Ply: num/den`).
 *
 * @param {GamelogReviewPointer} pointer
 * @param {number} totalPlies
 * @param {boolean} hasTerminalStep same idea as {@link gamelogReviewHasTerminalStep}
 * @returns {{ num: number, den: number }}
 */
export function gamelogReviewDisplayFraction(
  pointer,
  totalPlies,
  hasTerminalStep
) {
  const hasT = hasTerminalStep;
  const maxI = gamelogReviewMaxPositionIndex(totalPlies, hasT);
  const i = gamelogReviewPointerToIndex(pointer, totalPlies, hasT);
  return { num: i + 1, den: maxI + 1 };
}
