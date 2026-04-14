/**
 * Primary site actions in the top bar (all routes). Most buttons are inert for now; counts
 * default to `siteTopNavPlaceholders.js` until multiplayer / presence ships.
 *
 * Pass `onOpenSettings` from the home page or game shells to show **Settings** after Discord
 * (opens `ThemeSettingsModal`).
 */
import {
  PLACEHOLDER_TOP_NAV_ONLINE_PLAYER_COUNT,
  PLACEHOLDER_TOP_NAV_SEEK_COUNT,
  PLACEHOLDER_TOP_NAV_SPECTATE_GAME_COUNT,
} from "./siteTopNavPlaceholders.js";
import "./SiteTopNav.css";

const ICON_ATTRS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Icon({ children }) {
  return (
    <span className="site-top-nav__icon" aria-hidden="true">
      <svg {...ICON_ATTRS}>{children}</svg>
    </span>
  );
}

/** Top-nav text button; `onClick` optional so placeholder rows stay inert. */
function NavBtn({ icon, label, ariaLabel, onClick }) {
  return (
    <button
      type="button"
      className="site-top-nav__btn"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {icon}
      <span className="site-top-nav__label">{label}</span>
    </button>
  );
}

/**
 * @param {object} props
 * @param {number} [props.seekCount]
 * @param {number} [props.spectateGameCount]
 * @param {number} [props.onlinePlayerCount]
 * @param {() => void} [props.onOpenSettings] When set, shows **Settings** after Discord.
 */
export function SiteTopNav({
  seekCount = PLACEHOLDER_TOP_NAV_SEEK_COUNT,
  spectateGameCount = PLACEHOLDER_TOP_NAV_SPECTATE_GAME_COUNT,
  onlinePlayerCount = PLACEHOLDER_TOP_NAV_ONLINE_PLAYER_COUNT,
  onOpenSettings,
}) {
  return (
    <nav className="site-top-nav" aria-label="Site menu">
      <NavBtn
        ariaLabel="Host Game"
        icon={
          <Icon>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </Icon>
        }
        label="Host Game"
      />
      <NavBtn
        ariaLabel={`Join Game, ${seekCount} seeks open`}
        icon={
          <Icon>
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </Icon>
        }
        label={
          <>
            Join Game{" "}
            <span className="site-top-nav__meta">(Seeks: {seekCount})</span>
          </>
        }
      />
      <NavBtn
        ariaLabel={`Spectate, ${spectateGameCount} games available`}
        icon={
          <Icon>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </Icon>
        }
        label={
          <>
            Spectate{" "}
            <span className="site-top-nav__meta">
              (Games: {spectateGameCount})
            </span>
          </>
        }
      />
      <NavBtn
        ariaLabel="Past Games"
        icon={
          <Icon>
            {/* Clock — reads as history / archived play vs a live “games grid”. */}
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 16 14" />
          </Icon>
        }
        label="Past Games"
      />
      <NavBtn
        ariaLabel={`Players, ${onlinePlayerCount} online`}
        icon={
          <Icon>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </Icon>
        }
        label={
          <>
            Players{" "}
            <span className="site-top-nav__meta">
              (Online: {onlinePlayerCount})
            </span>
          </>
        }
      />
      <NavBtn
        ariaLabel="Manuals"
        icon={
          <Icon>
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </Icon>
        }
        label="Manuals"
      />
      <NavBtn
        ariaLabel="Events"
        icon={
          <Icon>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </Icon>
        }
        label="Events"
      />
      <NavBtn
        ariaLabel="Discord community"
        icon={
          <Icon>
            {/* Stylized chat bubble; suggests community link without using trademark artwork */}
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </Icon>
        }
        label="Discord"
      />
      {onOpenSettings ? (
        <NavBtn
          ariaLabel="Open settings"
          onClick={onOpenSettings}
          icon={
            <Icon>
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </Icon>
          }
          label="Settings"
        />
      ) : null}
    </nav>
  );
}
