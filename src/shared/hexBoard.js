/**
 * Hex grid geometry: axial (q, r) with cube s = −q − r.
 * - Flat-top pixel map for Sumo; pointy-top for Admirals (same lattice, rotated layout).
 * - Reference: https://www.redblobgames.com/grids/hexagons/#hex-to-pixel-axial
 */

/** Three independent axis directions; used for pin detection (pairs of opposite neighbors). */
export const HEX_DIRS = [
  [1, 0],
  [0, 1],
  [1, -1],
];

/** All six axial neighbor steps (for pushes / adjacency). */
export const HEX_NEIGHBOR_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

/**
 * If `to` is `steps` steps from `from` along one neighbor direction, return unit axial step and count.
 * @param {{ q: number, r: number }} from
 * @param {{ q: number, r: number }} to
 * @returns {{ uq: number, ur: number, steps: number } | null}
 */
export function axialPushStepCount(from, to) {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  if (dq === 0 && dr === 0) return null;
  for (const [uq, ur] of HEX_NEIGHBOR_DIRS) {
    if (uq === 0) {
      // Pure r steps: must have dq === 0; k > 0 enforces consistent sign with ur.
      if (dq !== 0) continue;
      if (ur === 0 || dr % ur !== 0) continue;
      const k = dr / ur;
      if (k > 0 && Number.isInteger(k)) return { uq, ur, steps: k };
    } else {
      // Steps along (uq, ur): k = dq/uq and dr must match k * ur (collinearity in axial).
      if (dq % uq !== 0) continue;
      const k = dq / uq;
      if (k <= 0 || !Number.isInteger(k)) continue;
      if (k * ur !== dr) continue;
      return { uq, ur, steps: k };
    }
  }
  return null;
}

/** Default side length for full regular hex boards (`6x6x6` => radius 5). */
export const DEFAULT_HEX_SIDE_LENGTH = 6;
export const DEFAULT_HEX_RADIUS = DEFAULT_HEX_SIDE_LENGTH - 1;

/** Top cap of the symmetric hex (Sumo board): removes former a6…f1 diagonal + g1…k1. */
export function isTopCapRemoved(q, r, R) {
  return (q + r === -R && q <= 0) || (r === -R && q > 0);
}

/**
 * Full symmetric hexagon of cube-radius `R` (all axial cells with max(|q|,|r|,|s|) ≤ R).
 * Side length = R + 1 hexes per edge (e.g. R=5 → “6×6×6” / 91 cells).
 */
function fullHexCoords(R) {
  /** @type {{ q: number, r: number }[]} */
  const raw = [];
  for (let q = -R; q <= R; q++) {
    const rLo = Math.max(-R, -q - R);
    const rHi = Math.min(R, -q + R);
    for (let r = rLo; r <= rHi; r++) {
      raw.push({ q, r });
    }
  }
  return raw;
}

/**
 * Same id scheme as Sumo: column letter from q, row numeral from inverted r band.
 * @param {{ q: number, r: number }[]} raw
 */
function labelCellsLikeSumo(raw) {
  if (raw.length === 0) return [];
  const qMin = Math.min(...raw.map((c) => c.q));
  const rMin = Math.min(...raw.map((c) => c.r));
  const rMax = Math.max(...raw.map((c) => c.r));
  const maxOldRow = rMax - rMin + 1;
  return raw.map((c) => {
    const oldRow = c.r - rMin + 1;
    const newRow = maxOldRow - oldRow + 1;
    const letter = String.fromCharCode("a".charCodeAt(0) + (c.q - qMin));
    return {
      q: c.q,
      r: c.r,
      id: `${letter}${newRow}`,
    };
  });
}

/**
 * Symmetric hex minus top cap; numeral labels use inverted rows (old 11→1, 10→2, …).
 */
export function buildCellList(sideLength = DEFAULT_HEX_SIDE_LENGTH) {
  const R = Math.max(1, Math.floor(sideLength) - 1);
  const raw = fullHexCoords(R).filter((c) => !isTopCapRemoved(c.q, c.r, R));
  return labelCellsLikeSumo(raw);
}

/** Admirals: complete regular hexagon, same labels as Sumo scheme. */
export function buildAdmiralsCellList(sideLength = DEFAULT_HEX_SIDE_LENGTH) {
  const R = Math.max(1, Math.floor(sideLength) - 1);
  return labelCellsLikeSumo(fullHexCoords(R));
}

/** Distance from center to midpoint of a flat edge (for bbox / text); same R for both orientations. */
export function flatTopApothem(circumradius) {
  return (Math.sqrt(3) / 2) * circumradius;
}

/**
 * Center of axial cell (q,r) for flat-top orientation, y increases downward (SVG).
 * Same q → column; +r moves down — vertical stacks sharing horizontal edges.
 */
export function axialToPixelFlatTop(q, r, circumradius) {
  const x = circumradius * (3 / 2) * q;
  const y = circumradius * (Math.sqrt(3) / 2) * (q + 2 * r);
  return { x, y };
}

/**
 * Pointy-top hex centers: point-up tiles, axes rotated 30° vs flat-top. Uses circumradius `L`
 * equal to flat-top’s so neighbor center distance stays `L√3` (same axial lattice).
 * @see https://www.redblobgames.com/grids/hexagons/#hex-to-pixel-axial
 */
export function axialToPixelPointyTop(q, r, circumradius) {
  const L = circumradius;
  const x = L * Math.sqrt(3) * (q + r / 2);
  const y = L * (3 / 2) * r;
  return { x, y };
}

/**
 * Pointy-top polygon: first vertex at top (−y in SVG), then clockwise.
 */
export function pointyTopHexCorners(cx, cy, circumradius) {
  const R = circumradius;
  /** @type [number, number][] */
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 3;
    corners.push([cx + R * Math.cos(ang), cy + R * Math.sin(ang)]);
  }
  return corners;
}

/**
 * Flat-top hex circumradius R: horizontal flats, vertical spacing √3·R between stacked centers.
 * Vertices listed clockwise from top-left (SVG, +y down).
 */
export function flatTopHexCorners(cx, cy, R) {
  const k = flatTopApothem(R);
  const h = R / 2;
  return [
    [cx - h, cy - k],
    [cx + h, cy - k],
    [cx + R, cy],
    [cx + h, cy + k],
    [cx - h, cy + k],
    [cx - R, cy],
  ];
}

/** Join corner coordinates into SVG polygon `points` attribute string. */
export function cornersToSvgPoints(corners) {
  return corners.map(([x, y]) => `${x},${y}`).join(" ");
}

/** Default hex circumradius in SVG user units (Sumo + Admirals boards). */
export const DEFAULT_HEX_PIXEL_R = 26;

/**
 * SVG viewBox from all hex corners, nominal “stone” radius, and coord label depth.
 */
export function boundsForHexLayout(
  cells,
  circumradius,
  toPixel,
  hexCornersFn,
  stoneR,
  apo
) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const { x, y } = toPixel(c.q, c.r, circumradius);
    const corners = hexCornersFn(x, y, circumradius);
    for (const [px, py] of corners) {
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
      minY = Math.min(minY, py);
    }
    minY = Math.min(minY, y - stoneR);
    maxY = Math.max(maxY, y + stoneR);
    const labelBot = y + apo * 0.72 + circumradius * 0.12;
    maxY = Math.max(maxY, labelBot);
  }
  const pad = 22;
  const ox = minX - pad;
  const oy = minY - pad;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  return { ox, oy, w, h };
}

/**
 * Pixel layout for a cell list + orientation (shared by HexBoard and AdmiralsHexBoard).
 */
export function computeHexPixelLayout(
  cells,
  hexOrientation,
  circumradius = DEFAULT_HEX_PIXEL_R
) {
  const toPixel =
    hexOrientation === "pointy-top"
      ? axialToPixelPointyTop
      : axialToPixelFlatTop;
  const hexCornersFn =
    hexOrientation === "pointy-top"
      ? pointyTopHexCorners
      : flatTopHexCorners;
  const apo = flatTopApothem(circumradius);
  const stoneR = apo * 0.9;
  const cellPx = Object.fromEntries(
    cells.map((c) => {
      const { x, y } = toPixel(c.q, c.r, circumradius);
      return [c.id, { ...c, x, y }];
    })
  );
  const cellIdByQr = Object.fromEntries(
    cells.map((c) => [`${c.q},${c.r}`, c.id])
  );
  const B = boundsForHexLayout(
    cells,
    circumradius,
    toPixel,
    hexCornersFn,
    stoneR,
    apo
  );
  return {
    cellPx,
    cellIdByQr,
    B,
    apo,
    stoneR,
    toPixel,
    hexCornersFn,
    circumradius,
  };
}

