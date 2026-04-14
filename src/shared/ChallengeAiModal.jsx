import { useEffect } from "react";

/**
 * Shared pre-AI dialog: choose a bot and review (currently disabled) game settings.
 *
 * For now bot lists can be empty; in that case Confirm is disabled and settings are shown in a
 * disabled fieldset so users can see defaults that future bots may support.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onConfirm: () => void,
 *   botOptions: Array<{ value: string, label: string }>,
 *   botValue: string,
 *   onBotChange: (value: string) => void,
 *   canConfirm: boolean,
 *   boardSizeOptions?: Array<{ value: string, label: string }>,
 *   boardSizeValue?: string,
 *   title?: string,
 *   titleId?: string,
 *   children?: import("react").ReactNode,
 * }} props
 */
export function ChallengeAiModal({
  open,
  onClose,
  onConfirm,
  botOptions,
  botValue,
  onBotChange,
  canConfirm,
  boardSizeOptions = [],
  boardSizeValue = "",
  title = "Challenge AI",
  titleId = "challenge-ai-modal-title",
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
        className="theme-modal game-settings-modal challenge-ai-modal"
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

        <div className="game-settings-modal-body challenge-ai-modal-body">
          <div className="game-settings-field">
            <label
              className="game-settings-field-label"
              htmlFor={`${titleId}-bot-opponent`}
            >
              Bot Opponent
            </label>
            <select
              className="game-settings-field-select"
              id={`${titleId}-bot-opponent`}
              value={botValue}
              onChange={(e) => onBotChange(e.target.value)}
            >
              {botOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <h3 className="side-panel-heading challenge-ai-settings-heading">
            Game Settings
          </h3>
          <fieldset className="challenge-ai-settings-fieldset" disabled>
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
                  onChange={() => {}}
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
          </fieldset>
        </div>

        <div className="theme-modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={onConfirm}
            disabled={!canConfirm}
            title={
              canConfirm
                ? "Start a game versus the selected bot"
                : "No bot opponents available yet"
            }
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
