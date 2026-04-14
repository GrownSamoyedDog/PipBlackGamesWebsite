import { useEffect } from "react";

/** Set on :root while a game shell is mounted (zoom / resize-safe height). */
export const GAME_VIEWPORT_HEIGHT_PROP = "--game-viewport-h";

function readVisibleHeightPx() {
  if (typeof window === "undefined") return null;
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  return h > 0 ? Math.round(h * 100) / 100 : null;
}

/**
 * Keeps `document.documentElement` `--game-viewport-h` equal to the visible
 * viewport height (Visual Viewport API when available). Updates on window
 * resize and visual viewport resize/scroll so layout stays correct at any
 * browser zoom and window size.
 */
export function useSyncGameViewportHeight() {
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = readVisibleHeightPx();
        if (h != null) {
          document.documentElement.style.setProperty(
            GAME_VIEWPORT_HEIGHT_PROP,
            `${h}px`
          );
        }
      });
    };

    apply();
    window.addEventListener("resize", apply, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply, { passive: true });
    vv?.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("orientationchange", apply, { passive: true });
    window.addEventListener("pageshow", apply, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", apply);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("pageshow", apply);
      document.documentElement.style.removeProperty(GAME_VIEWPORT_HEIGHT_PROP);
    };
  }, []);
}
