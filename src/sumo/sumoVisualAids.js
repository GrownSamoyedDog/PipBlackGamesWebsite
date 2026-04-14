/**
 * Sumo visual aids — UI feedback helpers only. They do not affect game rules or scoring.
 *
 * - Pin-change highlighting (orange pin numeral via `sumoVisualAccent`) and push HUD accents
 *   are driven from App state on each placement; they persist until the **next** placement
 *   (same rhythm as push arrows).
 * - Colors come from theme keys → CSS vars (`sumoVisualAccent`, `sumoScoreAheadMarker`, …).
 */

/**
 * Compare two pin maps (same shape as `computePins` in sumo.js) and list every cell
 * id whose **displayed** pin count changed (including 0 ↔ positive and any delta).
 *
 * @param {Record<string, number>} pinsBefore pins before the placement
 * @param {Record<string, number>} pinsAfter pins after resolution
 * @param {{ id: string }[]} cells full cell list (defines iteration order)
 * @returns {string[]} cell ids whose pin numerals should use the accent color until the next move
 */
export function cellIdsWithPinCountChange(pinsBefore, pinsAfter, cells) {
  /** @type {string[]} */
  const out = [];
  for (const c of cells) {
    const id = c.id;
    const after = pinsAfter[id] ?? 0;
    const before = pinsBefore[id] ?? 0;
    if (after !== before) out.push(id);
  }
  return out;
}
