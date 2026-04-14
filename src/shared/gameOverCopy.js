/**
 * Shared strings for the game-over modal **kicker** (small uppercase line above the main title).
 *
 * Shells pass their `termination` value; natural/rule-based endings without a stored termination
 * (Sumo / Admirals) use `null` and get the generic “Game over” line — the title still names the
 * winner. Ouroboros always sets `termination` for natural endings so the kicker can say e.g.
 * “Hoopsnake win”.
 *
 * @param {null | 'resign' | 'agreed_draw' | 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win' | 'igo_win' | 'wego_win' | 'wego_draw'} termination
 * @returns {string}
 */
export function gameOverModalKicker(termination) {
  if (termination === "agreed_draw") return "Agreed draw";
  if (termination === "resign") return "Resignation";
  if (termination === "hoopsnake_win") return "Hoopsnake win";
  if (termination === "road_win") return "Road win";
  if (termination === "amass_win") return "Amass win";
  if (termination === "stack_score_win") return "Stack score win";
  if (termination === "igo_win") return "Igo win";
  if (termination === "wego_win") return "Wego win";
  if (termination === "wego_draw") return "Wego draw";
  return "Game over";
}
