/**
 * Arrow-key and button UI for gamelog review. Parents mount this only while `review != null`;
 * pass `hasTerminalStep` from {@link gamelogReviewHasTerminalStep} so the last scrub index matches
 * the **GAME END** row when present.
 */
import { useEffect } from "react";
import {
  gamelogReviewGoFirst,
  gamelogReviewGoLast,
  gamelogReviewMaxPositionIndex,
  gamelogReviewPointerToIndex,
  gamelogReviewStepBy,
} from "./gamelogReviewNav.js";

/**
 * When focus is in a text field, arrow keys keep normal caret behavior instead
 * of scrubbing the gamelog.
 *
 * @param {EventTarget | null} el
 */
function isTextEditingTarget(el) {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    return (
      t === "text" ||
      t === "search" ||
      t === "url" ||
      t === "tel" ||
      t === "email" ||
      t === "password" ||
      t === "number" ||
      t === "date" ||
      t === "time" ||
      t === "datetime-local" ||
      t === "month" ||
      t === "week" ||
      t === ""
    );
  }
  return false;
}

/**
 * Symbol-only controls for stepping through gamelog review positions, plus
 * keyboard shortcuts when review mode is active.
 *
 * **Mount only when review is non-null** (parent gates rendering).
 *
 * **Keyboard (capture phase):** **Arrow keys** scrub the gamelog unless focus
 * is in a plain text `input` or `textarea` (e.g. notepad). **Tab is never
 * handled here** — the browser keeps normal tab order.
 *
 * - ArrowUp → first ply
 * - ArrowDown → last position (includes terminal row when present)
 * - ArrowLeft → one step earlier
 * - ArrowRight → one step later
 *
 * @param {{
 *   totalPlies: number,
 *   hasTerminalStep: boolean,
 *   review: import('./gamelogReviewNav.js').GamelogReviewPointer,
 *   onSetReview: (p: import('./gamelogReviewNav.js').GamelogReviewPointer) => void,
 * }} props
 */
export function GamelogReviewNav({
  totalPlies,
  hasTerminalStep,
  review,
  onSetReview,
}) {
  const hasTermination = hasTerminalStep;
  const maxIdx = gamelogReviewMaxPositionIndex(totalPlies, hasTermination);
  const idx = gamelogReviewPointerToIndex(review, totalPlies, hasTermination);
  const atFirst = idx <= 0;
  const atLast = idx >= maxIdx;

  useEffect(() => {
    const onKeyDown = (/** @type {KeyboardEvent} */ e) => {
      const target = /** @type {EventTarget | null} */ (e.target);
      if (isTextEditingTarget(target)) {
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          onSetReview(gamelogReviewGoFirst(totalPlies, hasTermination));
          break;
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          onSetReview(gamelogReviewGoLast(totalPlies, hasTermination));
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          if (!atFirst) {
            onSetReview(
              gamelogReviewStepBy(review, totalPlies, hasTermination, -1)
            );
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          if (!atLast) {
            onSetReview(
              gamelogReviewStepBy(review, totalPlies, hasTermination, 1)
            );
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    review,
    totalPlies,
    hasTermination,
    onSetReview,
    atFirst,
    atLast,
  ]);

  return (
    <div
      className="gamelog-review-nav"
      role="toolbar"
      aria-label="Review navigation"
    >
      <button
        type="button"
        className="gamelog-review-nav-btn"
        disabled={atFirst}
        onClick={() =>
          onSetReview(gamelogReviewGoFirst(totalPlies, hasTermination))
        }
        title="First ply (opening) — shortcut: Arrow Up"
        aria-label="First ply, opening position"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" y1="5" x2="4" y2="19" />
          <polyline points="20 6 14 12 20 18" />
          <polyline points="14 6 8 12 14 18" />
        </svg>
      </button>
      <button
        type="button"
        className="gamelog-review-nav-btn"
        disabled={atFirst}
        onClick={() =>
          onSetReview(gamelogReviewStepBy(review, totalPlies, hasTermination, -1))
        }
        title="Previous ply — shortcut: Arrow Left"
        aria-label="Previous ply"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="14 6 8 12 14 18" />
        </svg>
      </button>
      <button
        type="button"
        className="gamelog-review-nav-btn"
        disabled={atLast}
        onClick={() =>
          onSetReview(gamelogReviewStepBy(review, totalPlies, hasTermination, 1))
        }
        title="Next ply — shortcut: Arrow Right"
        aria-label="Next ply"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="10 6 16 12 10 18" />
        </svg>
      </button>
      <button
        type="button"
        className="gamelog-review-nav-btn"
        disabled={atLast}
        onClick={() =>
          onSetReview(gamelogReviewGoLast(totalPlies, hasTermination))
        }
        title="Last position (includes GAME END if any) — shortcut: Arrow Down"
        aria-label="Last ply or game end"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="4 6 10 12 4 18" />
          <polyline points="10 6 16 12 10 18" />
          <line x1="20" y1="5" x2="20" y2="19" />
        </svg>
      </button>
    </div>
  );
}
