/**
 * Game shells only: link back to `/`, styled like `SiteTopNav` text buttons.
 */
import { NavLink } from "react-router-dom";
import "./SiteTopNav.css";

const ICON_ATTRS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function SiteHomepageLink() {
  return (
    <NavLink
      to="/"
      end
      className="site-top-nav__btn site-homepage-link"
      aria-label="Homepage"
    >
      <span className="site-top-nav__icon" aria-hidden="true">
        <svg {...ICON_ATTRS}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </span>
      <span className="site-top-nav__label">Homepage</span>
    </NavLink>
  );
}
