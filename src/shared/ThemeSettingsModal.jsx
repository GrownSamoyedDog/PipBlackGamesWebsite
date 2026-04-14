/**
 * **Settings** dialog opened from the site header (`SiteTopNav` → Settings). Uses the same modal
 * shell as `GameSettingsModal`: translucent backdrop (no click-outside dismiss), large fixed
 * dialog, scrollable body. Theme changes write through `saveTheme` on each edit; Escape closes
 * without losing values already saved.
 */
import { useEffect, useCallback } from "react";
import { DEFAULT_THEME, THEME_FIELD_SECTIONS, saveTheme } from "./theme.js";

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   theme: import('./theme.js').Theme,
 *   setTheme: (t: import('./theme.js').Theme) => void,
 * }} props
 */
export function ThemeSettingsModal({ open, onClose, theme, setTheme }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const patch = useCallback(
    (key, value) => {
      const next = { ...theme, [key]: value };
      setTheme(next);
      saveTheme(next);
    },
    [theme, setTheme]
  );

  const reset = useCallback(() => {
    setTheme(DEFAULT_THEME);
    saveTheme(DEFAULT_THEME);
  }, [setTheme]);

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
        aria-labelledby="theme-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="theme-modal-head">
          <h2 id="theme-modal-title">Settings</h2>
          <button
            type="button"
            className="theme-modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>
        <div className="game-settings-modal-body">
          <p className="theme-modal-intro theme-modal-intro--in-settings-body">
            Theme colors by area: page atmosphere, site chrome, Sumo (hex surfaces
            then orange player aids), Ouroboros (grid, cell labels, square pieces,
            snake-eye glyph), Admirals (ships through HUD), then Mimoveyumove
            (cells, labels, pieces). Overlays and buttons mostly follow site
            chrome and accent. Stored in this browser only.
          </p>
          <div
            className="theme-fields"
            role="group"
            aria-label="Theme options by category"
          >
            {THEME_FIELD_SECTIONS.map((section) => (
              <section
                key={section.id}
                className="theme-field-section"
                aria-labelledby={`theme-section-${section.id}`}
              >
                <h3
                  className="theme-field-section-title"
                  id={`theme-section-${section.id}`}
                >
                  {section.title}
                </h3>
                <p className="theme-field-section-desc">{section.description}</p>
                <div className="theme-field-section-rows">
                  {section.fields.map(({ key, label }) => {
                    const raw =
                      typeof theme[key] === "string"
                        ? theme[key]
                        : DEFAULT_THEME[key];
                    const hex8 = normalizeHexWithAlpha(raw);
                    return (
                      <label key={key} className="theme-field">
                        <span className="theme-field-label">{label}</span>
                        <span className="theme-field-input">
                          <input
                            type="color"
                            value={hex8.slice(0, 7)}
                            onChange={(e) => patch(key, e.target.value)}
                            aria-label={label}
                          />
                          <span className="theme-field-hex mono">{hex8}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="theme-modal-actions">
          <button type="button" className="ghost" onClick={reset}>
            Reset to defaults
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Normalize theme color strings to `#RRGGBBAA` for consistent display.
 * Accepts hex shorthand/full and rgb/rgba() forms.
 */
function normalizeHexWithAlpha(v) {
  if (typeof v !== "string") return "#000000ff";
  const s = v.trim().toLowerCase();

  if (/^#[0-9a-f]{3}$/.test(s)) {
    const [r, g, b] = s.slice(1);
    return `#${r}${r}${g}${g}${b}${b}ff`;
  }
  if (/^#[0-9a-f]{4}$/.test(s)) {
    const [r, g, b, a] = s.slice(1);
    return `#${r}${r}${g}${g}${b}${b}${a}${a}`;
  }
  if (/^#[0-9a-f]{6}$/.test(s)) return `${s}ff`;
  if (/^#[0-9a-f]{8}$/.test(s)) return s;

  const rgb = /^rgba?\((.+)\)$/.exec(s);
  if (!rgb) return "#000000ff";
  const parts = rgb[1].split(",").map((p) => p.trim());
  if (parts.length < 3) return "#000000ff";

  const r = clampByte(Number.parseFloat(parts[0]));
  const g = clampByte(Number.parseFloat(parts[1]));
  const b = clampByte(Number.parseFloat(parts[2]));
  const alphaRaw = parts[3] == null ? 1 : Number.parseFloat(parts[3]);
  const a = clampByte(Math.round(Math.max(0, Math.min(1, alphaRaw || 0)) * 255));
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}${toHex2(a)}`;
}

function clampByte(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex2(n) {
  return n.toString(16).padStart(2, "0");
}
