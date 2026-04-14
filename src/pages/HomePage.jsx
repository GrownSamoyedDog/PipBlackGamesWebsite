/**
 * Site landing at `/`.
 *
 * Header is a direct child of `app-root` (like game shells) so the bar spans the
 * full viewport width; `shell--home` wraps only the main column. Same classes as
 * in-game chrome (`site site--full-bleed`) but no `brand-mega`; `SiteTopNav` includes
 * **Settings** (theme modal) like game routes. Each entry in `SITE_GAMES` is a
 * `NavLink` to that game’s `path`, with the same mark + wordmark markup as game
 * shells so styling stays consistent.
 */
import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { SITE_GAMES } from "../shared/gameRegistry.js";
import { SiteTopNav } from "../shared/SiteTopNav.jsx";
import { ThemeSettingsModal } from "../shared/ThemeSettingsModal.jsx";
import {
  mergeTheme,
  loadStoredTheme,
  themeToCssVars,
} from "../shared/theme.js";
import "./HomePage.css";

export default function HomePage() {
  const [theme, setTheme] = useState(() => mergeTheme(loadStoredTheme()));
  const [themeOpen, setThemeOpen] = useState(false);
  const themeCss = useMemo(() => themeToCssVars(theme), [theme]);
  const coreGames = useMemo(
    () => SITE_GAMES.filter((g) => g.id !== "mimoveyumove"),
    []
  );
  const fanVariantGames = useMemo(
    () => SITE_GAMES.filter((g) => g.id === "mimoveyumove"),
    []
  );

  return (
    <div className="app-root app-root--home" style={themeCss}>
      <header className="site site--full-bleed site--home-bar">
        <SiteTopNav onOpenSettings={() => setThemeOpen(true)} />
      </header>

      <div className="shell shell--home">
        <main className="home-main">
          <nav aria-label="Games on this site">
            <ul className="home-game-list home-game-list--as-brand">
              {coreGames.map((g) => (
                <li key={g.id} className="home-game-brand-row">
                  {/* `end`: active state only on exact path (same as game shell picker). */}
                  <NavLink
                    to={g.path}
                    end
                    className={({ isActive }) =>
                      "brand-logo home-game-brand-tile" +
                      (isActive ? " brand-logo--active" : "")
                    }
                    aria-label={g.ariaLabel}
                  >
                    {g.brandMarkType === "emoji" ? (
                      <span className="logo-emoji" aria-hidden="true">
                        {g.brandEmoji}
                      </span>
                    ) : (
                      <span className="logo-mark" aria-hidden="true" />
                    )}
                    <span className="logo-wordmark">{g.wordmark}</span>
                  </NavLink>
                </li>
              ))}
              <li className="home-game-section-label" aria-hidden="true">
                Fan Variants
              </li>
              {fanVariantGames.map((g) => (
                <li key={g.id} className="home-game-brand-row">
                  <NavLink
                    to={g.path}
                    end
                    className={({ isActive }) =>
                      "brand-logo home-game-brand-tile" +
                      (isActive ? " brand-logo--active" : "")
                    }
                    aria-label={g.ariaLabel}
                  >
                    {g.brandMarkType === "emoji" ? (
                      <span className="logo-emoji" aria-hidden="true">
                        {g.brandEmoji}
                      </span>
                    ) : (
                      <span className="logo-mark" aria-hidden="true" />
                    )}
                    <span className="logo-wordmark">{g.wordmark}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </main>
      </div>

      <ThemeSettingsModal
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        theme={theme}
        setTheme={setTheme}
      />
    </div>
  );
}
