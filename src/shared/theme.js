/**
 * Runtime theming: palette keys map to CSS custom properties on `.app-root` via
 * {@link themeToCssVars}. Covers page chrome, Sumo hex board, Ouroboros square grid / pieces /
 * snake glyph / post-game Hoopsnake win highlight, Admirals pieces / HUD, and Mimoveyumove board
 * coordinate tints. The Settings modal
 * (`ThemeSettingsModal`) lists the same keys in {@link THEME_FIELD_SECTIONS}. User overrides persist in localStorage
 * under {@link THEME_STORAGE_KEY}.
 */

/** @typedef {typeof DEFAULT_THEME} Theme */

export const THEME_STORAGE_KEY = "sumo-custom-theme-v1";

/**
 * Hoopsnake **win** highlight (post-game): inset from the cell edge so the fill is slightly smaller
 * than the square, and corner radius for the rounded “tile” look.
 *
 * Not exposed in Settings (only the fill color is). Adjust if the 6×6 cell size changes a lot.
 */
export const OUROBOROS_HOOPSNAKE_WIN_HIGHLIGHT_INSET = "10%";
export const OUROBOROS_HOOPSNAKE_WIN_HIGHLIGHT_RADIUS = "12px";

/** Fallback palette and reset target for the theme modal. */
export const DEFAULT_THEME = {
  bg: "#0c0f14",
  bgGlowTopMix: "#5eead4",
  bgGlowBottomMix: "#f472b6",
  surface: "#141a24",
  panelBg: "#141a24",
  surface2: "#1c2533",
  border: "#2a3548",
  text: "#e8ecf4",
  muted: "#8b95a8",
  accent: "#5eead4",
  accentButtonEnd: "#38bdf8",
  hexHoverFill: "#222c3d",
  hexHoverStroke: "#3d4f6a",
  hexFilledWhiteFill: "#2a303a",
  hexFilledWhiteStroke: "#94a3b8",
  hexFilledBlackFill: "#242830",
  hexFilledBlackStroke: "#64748b",

  /* ----- Ouroboros (`OuroborosGameShell.css` — vars prefixed `--ouroboros-`) ----- */
  /** Empty / default square cell fill inside the grid border. */
  ouroborosCellFill: "#1c2533",
  /** Internal grid lines and outer border of the 6×6. */
  ouroborosCellLine: "#2a3548",
  /** Playable / hover cell fill (rook targets use a mix of this + transparent). */
  ouroborosCellHoverFill: "#222c3d",
  /** Hover cell outline (replaces grid line color on that cell). */
  ouroborosCellHoverLine: "#3d4f6a",
  /** Corner labels `a1`–`f6` (mono); defaults to muted so it matches site chrome until overridden. */
  ouroborosSquareCoord: "#8b95a8",
  /** Stacked square pieces and reserve HUD pips — white owner. */
  ouroborosPieceWhiteFill: "#f8fafc",
  ouroborosPieceWhiteStroke: "#5f6d82",
  /** Stacked square pieces and reserve HUD pips — black owner. */
  ouroborosPieceBlackFill: "#05070b",
  ouroborosPieceBlackStroke: "#cbd5e1",
  /** SVG snake-eye glyph on white pieces (`face === snake_head`). */
  ouroborosSnakeMarkOnWhite: "#0f172a",
  /** SVG snake-eye glyph on black pieces. */
  ouroborosSnakeMarkOnBlack: "#f8fafc",
  /**
   * Post-game only: solid rounded fill under pieces on each cell in a completed Hoopsnake (3×3 ring).
   * Default `#4c6755` — muted green that reads as a win cue on dark cells without matching site teal.
   */
  ouroborosHoopsnakeWinHighlightFill: "#4c6755",
  /** Board player aids: arrows, last-move ring, Pieces Removed HUD, orange pin delta numerals. */
  sumoVisualAccent: "#f97316",
  /** Sidebar “ahead on total” exclamation — separate so it can differ from board orange. */
  sumoScoreAheadMarker: "#f97316",

  /* ----- Admirals (see THEME_FIELD_SECTIONS: ships, discs, glyphs, rings & HUD) ----- */
  admiralsShipWhiteFill: "#f1f5f9",
  admiralsShipWhiteStroke: "#64748b",
  admiralsShipBlackFill: "#000000",
  admiralsShipBlackStroke: "#64748b",
  admiralsDiscWhiteFill: "#f8fafc",
  admiralsDiscWhiteStroke: "#475569",
  admiralsDiscBlackFill: "#000000",
  admiralsDiscBlackStroke: "#64748b",
  /**
   * Black admiral “sphere”: same radial layout as white stones / Sumo dark stones, but stops stay
   * in a ~0–15% lightness band so it still reads as pure black (not charcoal gray overall).
   */
  admiralsDiscBlack3dHi: "#252525",
  admiralsDiscBlack3dMid: "#0c0c0c",
  admiralsDiscBlack3dLo: "#040404",
  admiralsDiscBlack3dDeep: "#000000",
  /** Anchor on white (light) disc */
  admiralsGlyphAnchorOnLight: "#000000",
  /** Anchor on black disc */
  admiralsGlyphAnchorOnDark: "#f8fafc",
  /** Dead “X” on white disc */
  admiralsGlyphDeadOnLight: "#000000",
  /** Dead “X” on black disc */
  admiralsGlyphDeadOnDark: "#f8fafc",

  admiralsSelectRingStroke: "#3b82f6",
  /** Outline on the admiral during place/move — same blue family as the selection ring. */
  admiralsSelectedDiscStroke: "#3b82f6",
  admiralsHudSafeFill: "#3b82f6",
  admiralsHudSafeStroke: "#1d4ed8",
  admiralsHudFatalFill: "#3b82f6",
  admiralsHudFatalStroke: "#1e40af",

  /* ----- Mimoveyumove (`MimoveyumoveGameShell.css`) ----- */
  /** Interior/edge board paint and grid lines (10x10 shell around playable 8x8). */
  mimoCellFill: "#1c2533",
  mimoCellLine: "#2a3548",
  mimoCellEdgeFill: "#10151f",
  /** Mild start-of-turn interactable hint (same pieces as selectable roles). */
  mimoCellHintFill: "#22323d",
  mimoCellEdgeHintFill: "#18252f",
  /** Spawner hint is intentionally stronger than migo hint (especially noticeable on edges). */
  mimoCellSpawnerHintFill: "#2f4b57",
  mimoCellEdgeSpawnerHintFill: "#2a4651",
  /** Stronger LOS destination highlight. */
  mimoCellTargetFill: "#26414a",
  mimoCellEdgeTargetFill: "#203740",
  /** Selected source ring for currently chosen spawner/migo. */
  mimoSelectedRing: "rgba(94, 234, 212, 0.75)",
  /** End-of-game Igo overlay (drawn under pieces, on each winning Yugo-line cell). */
  mimoIgoHighlightFill: "#bfaa40",

  /** Interior coordinate labels on neutral cells. */
  mimoCoordInterior: "#515c6f",
  /** Edge coordinate labels on darker edge cells. */
  mimoCoordEdge: "#394357",
  /** Coordinate labels on LOS-target cells to match actionable highlight state. */
  mimoCoordTarget: "#a8d3dc",

  /** Migo/Yugo disc gradients and outlines (semi-3D circles). */
  mimoPieceWhiteHi: "#ffffff",
  mimoPieceWhiteMid: "#eef1f5",
  mimoPieceWhiteLo: "#cfd6df",
  mimoPieceWhiteDeep: "#9ca6b5",
  mimoPieceWhiteStroke: "rgba(15, 23, 42, 0.14)",
  mimoPieceBlackHi: "#8892a0",
  mimoPieceBlackMid: "#5c6573",
  mimoPieceBlackLo: "#3a404c",
  mimoPieceBlackDeep: "#24282f",
  mimoPieceBlackStroke: "rgba(255, 255, 255, 0.14)",
  /** Prominent disc shadow pair (large + tight). */
  mimoPieceShadowStrong: "rgba(0, 0, 0, 0.5)",
  mimoPieceShadowSoft: "rgba(0, 0, 0, 0.45)",
  /** Role marks on pieces. */
  mimoYugoDotFill: "#c81e1e",
  mimoYugoDotRing: "rgba(0, 0, 0, 0.2)",
  mimoSpawnerMarkDark: "#1f2937",
  mimoSpawnerMarkLight: "#f8fafc",
};

/**
 * Color picker sections in the **Settings** dialog (`ThemeSettingsModal`).
 *
 * Order: page → site chrome → Sumo (board surfaces, then player aids) → **Ouroboros** (grid,
 * coords, pieces, snake glyph, Hoopsnake win highlight) → Admirals (ships, discs, glyphs, rings &
 * HUD) → Mimoveyumove.
 *
 * Every key in {@link DEFAULT_THEME} must appear in exactly one `fields` array so the modal stays
 * complete and `Theme` stays in sync.
 *
 * @typedef {{ key: keyof Theme, label: string }} ThemeFieldRow
 * @typedef {{ id: string, title: string, description: string, fields: ThemeFieldRow[] }} ThemeFieldSection
 * @type {ThemeFieldSection[]}
 */
export const THEME_FIELD_SECTIONS = [
  {
    id: "page-atmosphere",
    title: "Page & atmosphere",
    description:
      "Full-page background and ambient glows behind the app shell (not the hex board).",
    fields: [
      { key: "bg", label: "Page background" },
      { key: "bgGlowTopMix", label: "Top glow tint" },
      { key: "bgGlowBottomMix", label: "Corner glow tint" },
    ],
  },
  {
    id: "website-chrome",
    title: "Website chrome",
    description:
      "Side panels, header, typography, borders, and shared buttons outside the board card.",
    fields: [
      { key: "panelBg", label: "Side panel background" },
      { key: "text", label: "Main text" },
      { key: "muted", label: "Muted / secondary text" },
      { key: "border", label: "Borders & dividers" },
      { key: "accent", label: "Accent (active turn stripe, UI highlights)" },
      { key: "accentButtonEnd", label: "Primary button gradient (end)" },
    ],
  },
  {
    id: "sumo-board-surfaces",
    title: "Sumo — board & stone paints",
    description:
      "Hex tile fills and rings under pieces. (Player-aid oranges live in the next section.)",
    fields: [
      { key: "surface", label: "Board card (center column)" },
      { key: "surface2", label: "Empty hex fill" },
      { key: "hexHoverFill", label: "Playable hex hover (fill)" },
      { key: "hexHoverStroke", label: "Playable hex hover (outline)" },
      { key: "hexFilledWhiteFill", label: "Hex under white stone (fill)" },
      { key: "hexFilledWhiteStroke", label: "Hex under white stone (outline)" },
      { key: "hexFilledBlackFill", label: "Hex under black stone (fill)" },
      { key: "hexFilledBlackStroke", label: "Hex under black stone (outline)" },
    ],
  },
  {
    id: "sumo-player-aids",
    title: "Sumo — player aids (highlights only)",
    description:
      "Same family of cues as push arrows: last move ring, Pieces Removed panel, orange pin numerals when a count changes, and the score “!” — none affect adjudication.",
    fields: [
      {
        key: "sumoVisualAccent",
        label: "Accent — arrows, last-move ring, push HUD, changed pin numerals",
      },
      {
        key: "sumoScoreAheadMarker",
        label: "Sidebar: score “!” and orange total when it just changed",
      },
    ],
  },
  {
    id: "ouroboros-grid",
    title: "Ouroboros — grid & squares",
    description:
      "The 6×6 play area: cell fill, grid lines, and hover / legal-target shading. The Gather/Scatter choice menu (modal over the board) uses shared site colors (surface, border, accent).",
    fields: [
      { key: "ouroborosCellFill", label: "Cell fill (board background)" },
      { key: "ouroborosCellLine", label: "Grid lines & outer border" },
      { key: "ouroborosCellHoverFill", label: "Hovered / highlighted cell (fill)" },
      { key: "ouroborosCellHoverLine", label: "Hovered cell (outline)" },
    ],
  },
  {
    id: "ouroboros-labels-pieces",
    title: "Ouroboros — coords & square pieces",
    description:
      "Chess-style corner labels per cell; stacked pieces and the reserve HUD pips reuse the same white/black fills and strokes.",
    fields: [
      {
        key: "ouroborosSquareCoord",
        label: "Cell corner labels (a1 … f6)",
      },
      { key: "ouroborosPieceWhiteFill", label: "White piece — fill" },
      { key: "ouroborosPieceWhiteStroke", label: "White piece — outline" },
      { key: "ouroborosPieceBlackFill", label: "Black piece — fill" },
      { key: "ouroborosPieceBlackStroke", label: "Black piece — outline" },
    ],
  },
  {
    id: "ouroboros-snake",
    title: "Ouroboros — snake-eye face",
    description:
      "End-of-turn marker only: the top piece that was last placed or moved shows this glyph; other faces stay blank. Separate from piece fill so contrast stays readable on both colors.",
    fields: [
      {
        key: "ouroborosSnakeMarkOnWhite",
        label: "Snake glyph on white piece",
      },
      {
        key: "ouroborosSnakeMarkOnBlack",
        label: "Snake glyph on black piece",
      },
    ],
  },
  {
    id: "ouroboros-hoopsnake-win",
    title: "Ouroboros — Hoopsnake win highlight (post-game)",
    description:
      "After the match ends, a solid rounded fill (slightly inset from each cell) marks every square on a completed Hoopsnake. Fill color is below; inset and corner radius are fixed in code (`OUROBOROS_HOOPSNAKE_WIN_HIGHLIGHT_*` in theme.js).",
    fields: [
      {
        key: "ouroborosHoopsnakeWinHighlightFill",
        label: "Hoopsnake win — cell highlight fill",
      },
    ],
  },
  {
    id: "admirals-ships",
    title: "Admirals — ships (half-hex)",
    description:
      "White and black ship layers on each hex (below coord labels and admiral discs).",
    fields: [
      { key: "admiralsShipWhiteFill", label: "White ship — fill" },
      { key: "admiralsShipWhiteStroke", label: "White ship — outline" },
      { key: "admiralsShipBlackFill", label: "Black ship — fill" },
      { key: "admiralsShipBlackStroke", label: "Black ship — outline" },
    ],
  },
  {
    id: "admirals-discs",
    title: "Admirals — admiral discs",
    description:
      "Board discs use a Sumo-like 3D sphere (white = fixed light gradient; black = near-black radial stops for a lit sphere that still reads as pure black). Sidebar matches. Outline colors apply to both.",
    fields: [
      { key: "admiralsDiscWhiteFill", label: "White admiral disc — fill" },
      { key: "admiralsDiscWhiteStroke", label: "White admiral disc — outline" },
      { key: "admiralsDiscBlackFill", label: "Black admiral disc — fill (ships / sidebar)" },
      { key: "admiralsDiscBlackStroke", label: "Black admiral disc — outline" },
      {
        key: "admiralsDiscBlack3dHi",
        label: "Black disc 3D — highlight (lit top)",
      },
      {
        key: "admiralsDiscBlack3dMid",
        label: "Black disc 3D — main tone (board piece)",
      },
      { key: "admiralsDiscBlack3dLo", label: "Black disc 3D — shadow band" },
      { key: "admiralsDiscBlack3dDeep", label: "Black disc 3D — deep edge" },
    ],
  },
  {
    id: "admirals-glyphs",
    title: "Admirals — ⚓ and elimination X",
    description:
      "Text glyphs on discs: anchor on living admirals, bold X when dead (theme sidebar icons use anchor colors).",
    fields: [
      { key: "admiralsGlyphAnchorOnLight", label: "Anchor on light (white) disc" },
      { key: "admiralsGlyphAnchorOnDark", label: "Anchor on dark (black) disc" },
      { key: "admiralsGlyphDeadOnLight", label: "Dead X on light (white) disc" },
      { key: "admiralsGlyphDeadOnDark", label: "Dead X on dark (black) disc" },
    ],
  },
  {
    id: "admirals-rings-hud",
    title: "Admirals — selection rings & move HUD",
    description:
      "Blue rings (select / confirmed admiral) and board hit targets: dots for legal ship placement & surviving moves, X for fatal moves.",
    fields: [
      { key: "admiralsSelectRingStroke", label: "Ring — selectable admirals" },
      {
        key: "admiralsSelectedDiscStroke",
        label: "Ring — confirmed admiral (place / move steps)",
      },
      { key: "admiralsHudSafeFill", label: "HUD dot / circle — fill (ship & safe move)" },
      { key: "admiralsHudSafeStroke", label: "HUD dot — outline" },
      { key: "admiralsHudFatalFill", label: "HUD fatal move — X fill" },
      { key: "admiralsHudFatalStroke", label: "HUD fatal move — X outline" },
    ],
  },
  {
    id: "mimoveyumove-board-cells",
    title: "Mimoveyumove — board cells & highlights",
    description:
      "Interior/edge cell paint, LOS target tint, turn-start hints, and selected source ring.",
    fields: [
      { key: "mimoCellFill", label: "Cell fill — interior" },
      { key: "mimoCellLine", label: "Grid lines & outer border" },
      { key: "mimoCellEdgeFill", label: "Cell fill — edge ring" },
      { key: "mimoCellHintFill", label: "Turn-start hint — interior" },
      { key: "mimoCellEdgeHintFill", label: "Turn-start hint — edge" },
      { key: "mimoCellSpawnerHintFill", label: "Spawner hint — interior (stronger)" },
      { key: "mimoCellEdgeSpawnerHintFill", label: "Spawner hint — edge (stronger)" },
      { key: "mimoCellTargetFill", label: "LOS target highlight — interior" },
      { key: "mimoCellEdgeTargetFill", label: "LOS target highlight — edge" },
      { key: "mimoSelectedRing", label: "Selected source ring" },
      { key: "mimoIgoHighlightFill", label: "Igo end-shape overlay fill" },
    ],
  },
  {
    id: "mimoveyumove-board-labels",
    title: "Mimoveyumove — coordinate labels",
    description:
      "Coordinate tint for interior cells, edge cells, and LOS-target cells (where a spawn/move can be made).",
    fields: [
      { key: "mimoCoordInterior", label: "Coordinate label — interior cells" },
      { key: "mimoCoordEdge", label: "Coordinate label — edge cells" },
      { key: "mimoCoordTarget", label: "Coordinate label — LOS target cells" },
    ],
  },
  {
    id: "mimoveyumove-pieces",
    title: "Mimoveyumove — pieces & role marks",
    description:
      "Migo/Yugo disc gradients, outlines, shadows, Yugo dot, and spawner infinity-symbol contrast.",
    fields: [
      { key: "mimoPieceWhiteHi", label: "White piece gradient — highlight" },
      { key: "mimoPieceWhiteMid", label: "White piece gradient — mid" },
      { key: "mimoPieceWhiteLo", label: "White piece gradient — low" },
      { key: "mimoPieceWhiteDeep", label: "White piece gradient — deep edge" },
      { key: "mimoPieceWhiteStroke", label: "White piece outline" },
      { key: "mimoPieceBlackHi", label: "Black piece gradient — highlight" },
      { key: "mimoPieceBlackMid", label: "Black piece gradient — mid" },
      { key: "mimoPieceBlackLo", label: "Black piece gradient — low" },
      { key: "mimoPieceBlackDeep", label: "Black piece gradient — deep edge" },
      { key: "mimoPieceBlackStroke", label: "Black piece outline" },
      { key: "mimoPieceShadowStrong", label: "Piece shadow — wide" },
      { key: "mimoPieceShadowSoft", label: "Piece shadow — tight" },
      { key: "mimoYugoDotFill", label: "Yugo center dot fill" },
      { key: "mimoYugoDotRing", label: "Yugo center dot ring" },
      { key: "mimoSpawnerMarkDark", label: "Spawner infinity on white piece" },
      { key: "mimoSpawnerMarkLight", label: "Spawner infinity on black piece" },
    ],
  },
];

/** Maps Theme → inline style vars for `.app-root` (inherited across the tree). */
export function themeToCssVars(t) {
  const sumoAccent = t.sumoVisualAccent;
  const ahead = t.sumoScoreAheadMarker;
  return {
    "--bg": t.bg,
    "--bg-glow-top-mix": t.bgGlowTopMix,
    "--bg-glow-bottom-mix": t.bgGlowBottomMix,
    "--surface": t.surface,
    "--panel-bg": t.panelBg,
    "--surface-2": t.surface2,
    "--border": t.border,
    "--text": t.text,
    "--muted": t.muted,
    "--accent": t.accent,
    "--accent-button-end": t.accentButtonEnd,
    "--accent-dim": `color-mix(in srgb, ${t.accent} 15%, transparent)`,
    "--hex-hover-fill": t.hexHoverFill,
    "--hex-hover-stroke": t.hexHoverStroke,
    "--hex-filled-white-base": t.hexFilledWhiteFill,
    "--hex-filled-white-ring": t.hexFilledWhiteStroke,
    "--hex-filled-black-base": t.hexFilledBlackFill,
    "--hex-filled-black-ring": t.hexFilledBlackStroke,
    "--ouroboros-cell-fill": t.ouroborosCellFill,
    "--ouroboros-cell-line": t.ouroborosCellLine,
    "--ouroboros-cell-hover-fill": t.ouroborosCellHoverFill,
    "--ouroboros-cell-hover-line": t.ouroborosCellHoverLine,
    "--ouroboros-square-coord": t.ouroborosSquareCoord,
    "--ouroboros-piece-white-fill": t.ouroborosPieceWhiteFill,
    "--ouroboros-piece-white-stroke": t.ouroborosPieceWhiteStroke,
    "--ouroboros-piece-black-fill": t.ouroborosPieceBlackFill,
    "--ouroboros-piece-black-stroke": t.ouroborosPieceBlackStroke,
    "--ouroboros-snake-mark-on-white": t.ouroborosSnakeMarkOnWhite,
    "--ouroboros-snake-mark-on-black": t.ouroborosSnakeMarkOnBlack,
    "--ouroboros-hoopsnake-win-highlight-fill": t.ouroborosHoopsnakeWinHighlightFill,
    "--ouroboros-hoopsnake-win-highlight-inset": OUROBOROS_HOOPSNAKE_WIN_HIGHLIGHT_INSET,
    "--ouroboros-hoopsnake-win-highlight-radius": OUROBOROS_HOOPSNAKE_WIN_HIGHLIGHT_RADIUS,
    "--sumo-visual-accent": sumoAccent,
    "--sumo-visual-accent-soft": `color-mix(in srgb, ${sumoAccent} 22%, transparent)`,
    "--sumo-visual-accent-ring": `color-mix(in srgb, ${sumoAccent} 45%, transparent)`,
    "--sumo-score-ahead-marker": ahead,
    "--sumo-score-ahead-glow": `color-mix(in srgb, ${ahead} 50%, transparent)`,
    "--last-placed-stroke": sumoAccent,
    "--last-placed-glow": `color-mix(in srgb, ${sumoAccent} 40%, transparent)`,

    "--admirals-ship-white-fill": t.admiralsShipWhiteFill,
    "--admirals-ship-white-stroke": t.admiralsShipWhiteStroke,
    "--admirals-ship-black-fill": t.admiralsShipBlackFill,
    "--admirals-ship-black-stroke": t.admiralsShipBlackStroke,
    "--admirals-disc-white-fill": t.admiralsDiscWhiteFill,
    "--admirals-disc-white-stroke": t.admiralsDiscWhiteStroke,
    "--admirals-disc-black-fill": t.admiralsDiscBlackFill,
    "--admirals-disc-black-stroke": t.admiralsDiscBlackStroke,
    "--admirals-disc-black-3d-hi": t.admiralsDiscBlack3dHi,
    "--admirals-disc-black-3d-mid": t.admiralsDiscBlack3dMid,
    "--admirals-disc-black-3d-lo": t.admiralsDiscBlack3dLo,
    "--admirals-disc-black-3d-deep": t.admiralsDiscBlack3dDeep,
    "--admirals-glyph-anchor-on-light": t.admiralsGlyphAnchorOnLight,
    "--admirals-glyph-anchor-on-dark": t.admiralsGlyphAnchorOnDark,
    "--admirals-glyph-dead-on-light": t.admiralsGlyphDeadOnLight,
    "--admirals-glyph-dead-on-dark": t.admiralsGlyphDeadOnDark,
    "--admirals-select-ring-stroke": t.admiralsSelectRingStroke,
    "--admirals-selected-disc-stroke": t.admiralsSelectedDiscStroke,
    "--admirals-hud-safe-fill": t.admiralsHudSafeFill,
    "--admirals-hud-safe-stroke": t.admiralsHudSafeStroke,
    "--admirals-hud-fatal-fill": t.admiralsHudFatalFill,
    "--admirals-hud-fatal-stroke": t.admiralsHudFatalStroke,
    "--mimo-cell-fill": t.mimoCellFill,
    "--mimo-cell-line": t.mimoCellLine,
    "--mimo-cell-edge-fill": t.mimoCellEdgeFill,
    "--mimo-cell-hint-fill": t.mimoCellHintFill,
    "--mimo-cell-edge-hint-fill": t.mimoCellEdgeHintFill,
    "--mimo-cell-spawner-hint-fill": t.mimoCellSpawnerHintFill,
    "--mimo-cell-edge-spawner-hint-fill": t.mimoCellEdgeSpawnerHintFill,
    "--mimo-cell-target-fill": t.mimoCellTargetFill,
    "--mimo-cell-edge-target-fill": t.mimoCellEdgeTargetFill,
    "--mimo-selected-ring": t.mimoSelectedRing,
    "--mimo-igo-highlight-fill": t.mimoIgoHighlightFill,
    "--mimo-coord-interior": t.mimoCoordInterior,
    "--mimo-coord-edge": t.mimoCoordEdge,
    "--mimo-coord-target": t.mimoCoordTarget,
    "--mimo-piece-white-hi": t.mimoPieceWhiteHi,
    "--mimo-piece-white-mid": t.mimoPieceWhiteMid,
    "--mimo-piece-white-lo": t.mimoPieceWhiteLo,
    "--mimo-piece-white-deep": t.mimoPieceWhiteDeep,
    "--mimo-piece-white-stroke": t.mimoPieceWhiteStroke,
    "--mimo-piece-black-hi": t.mimoPieceBlackHi,
    "--mimo-piece-black-mid": t.mimoPieceBlackMid,
    "--mimo-piece-black-lo": t.mimoPieceBlackLo,
    "--mimo-piece-black-deep": t.mimoPieceBlackDeep,
    "--mimo-piece-black-stroke": t.mimoPieceBlackStroke,
    "--mimo-piece-shadow-strong": t.mimoPieceShadowStrong,
    "--mimo-piece-shadow-soft": t.mimoPieceShadowSoft,
    "--mimo-yugo-dot-fill": t.mimoYugoDotFill,
    "--mimo-yugo-dot-ring": t.mimoYugoDotRing,
    "--mimo-spawner-mark-dark": t.mimoSpawnerMarkDark,
    "--mimo-spawner-mark-light": t.mimoSpawnerMarkLight,
  };
}

/** @returns {Partial<Theme> | null} parsed JSON or null if missing / invalid */
export function loadStoredTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return null;
    return /** @type {Partial<Theme>} */ (parsed);
  } catch {
    return null;
  }
}

/** @param {Theme} theme */
export function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* ignore */
  }
}

/**
 * Shallow-merge saved patch onto defaults. Migrates legacy keys when renames happen:
 * `lastPlacedStroke` → `sumoVisualAccent`; `ouroborosHoopsnakeRingStroke` →
 * `ouroborosHoopsnakeWinHighlightFill`.
 */
export function mergeTheme(patch) {
  const p =
    patch && typeof patch === "object" ? { /** @type Record<string, unknown> */ ...patch } : {};
  if (p.sumoVisualAccent == null && typeof p.lastPlacedStroke === "string") {
    p.sumoVisualAccent = p.lastPlacedStroke;
  }
  if (
    p.ouroborosHoopsnakeWinHighlightFill == null &&
    typeof p.ouroborosHoopsnakeRingStroke === "string"
  ) {
    p.ouroborosHoopsnakeWinHighlightFill = p.ouroborosHoopsnakeRingStroke;
  }
  delete p.ouroborosHoopsnakeRingStroke;
  return { ...DEFAULT_THEME, ...p };
}
