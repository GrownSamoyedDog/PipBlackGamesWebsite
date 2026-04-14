import { useEffect } from "react";

/**
 * Shared pre-practice dialog for all three game shells.
 *
 * Styling reuses `theme-modal-backdrop` / `theme-modal` from `index.css`. The first setting is a
 * board-size dropdown; each shell passes `onConfirm` to start a match (e.g. `newGame` /
 * `resetMatch`) and set `practiceSessionActive`.
 *
 * **Draft vs committed:** shells keep a *draft* of settings bound to this modal while it is open.
 * Changing controls does not affect the live match until **Confirm** applies them and starts or
 * resets play. **Cancel** / close discards the draft; reopening copies from the current committed
 * settings again.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onConfirm: () => void,
 *   title?: string,
 *   titleId?: string,
 *   boardSizeOptions?: Array<{ value: string, label: string }>,
 *   boardSizeValue?: string,
 *   onBoardSizeChange?: (value: string) => void,
 *   children?: import("react").ReactNode,
 * }} props
 */
export function GameSettingsModal({
  open,
  onClose,
  onConfirm,
  title = "Game Settings",
  titleId = "game-settings-modal-title",
  boardSizeOptions = [],
  boardSizeValue = "",
  onBoardSizeChange,
  children = null,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="theme-modal-backdrop game-settings-backdrop"
      role="presentation"
      aria-hidden={false}
    >
      <div
        className="theme-modal game-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="theme-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="theme-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="game-settings-modal-body">
          {boardSizeOptions.length > 0 ? (
            <div className="game-settings-field">
              <label
                className="game-settings-field-label"
                htmlFor={`${titleId}-board-size`}
              >
                Board Size
              </label>
              <select
                className="game-settings-field-select"
                id={`${titleId}-board-size`}
                value={boardSizeValue}
                onChange={(e) => onBoardSizeChange?.(e.target.value)}
              >
                {boardSizeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {children}
        </div>
        <div className="theme-modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
