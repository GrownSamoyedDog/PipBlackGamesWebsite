/**
 * Hex board view: SVG grid (flat-top or pointy-top), stones, motion, push arrows, visual aids.
 *
 * Layout is driven by `cells` (from hexBoard.js) and `hexOrientation`. Axial (q,r) and ids
 * stay consistent with sumo.js; only pixel mapping and polygon shape change for pointy-top.
 *
 * SVG paint order (bottom → top):
 * 1. `hex-layer-tiles` — hex faces.
 * 2. `hex-last-placed-ring-layer` — last-move ring above all tiles.
 * 3. `hex-layer-stones` — discs + coord labels.
 * 4. Push arrows, then motion overlay.
 */
import { useMemo } from "react";
import {
  buildCellList,
  axialToPixelFlatTop,
  axialToPixelPointyTop,
  flatTopHexCorners,
  pointyTopHexCorners,
  cornersToSvgPoints,
  flatTopApothem,
  axialPushStepCount,
  computeHexPixelLayout,
  DEFAULT_HEX_PIXEL_R,
} from "../shared/hexBoard.js";

/** Default Sumo board when `cells` is omitted (storybook / tests). */
const DEFAULT_CELLS = buildCellList();

const HEX_R = DEFAULT_HEX_PIXEL_R;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Normalized motion `t` is driven by App RAF over `MOVE_ANIM_MS`; push-offs split the
 * interval into slide (position) vs fade (opacity + scale).
 */
const PUSH_OFF_SLIDE_FRACTION = 0.62;
/** Extra scale-down at end of push-off fade (multiplier on disc, 0 = none). */
const PUSH_OFF_FADE_SHRINK = 0.14;

function isPushOffMove(m) {
  return m.toId == null && m.offBoardAxial != null;
}

/**
 * @param {number} t global progress [0, 1]
 * @param {boolean} pushOff
 * @returns {{ positionT: number, opacity: number, discScale: number }}
 */
function pushMotionInterpolants(t, pushOff) {
  if (!pushOff) {
    return { positionT: t, opacity: 1, discScale: 1 };
  }
  const s = PUSH_OFF_SLIDE_FRACTION;
  if (t <= s) {
    return { positionT: t / s, opacity: 1, discScale: 1 };
  }
  const fade = (t - s) / (1 - s);
  return {
    positionT: 1,
    opacity: 1 - fade,
    discScale: 1 - fade * PUSH_OFF_FADE_SHRINK,
  };
}

/**
 * End-state `pins` omit removed cells; flying push-offs use counts from before placement.
 */
function pinForMotionStone(m, pins, pinsBeforePlacement) {
  if (m.toId != null) return pins[m.toId] ?? 0;
  return pinsBeforePlacement[m.fromId] ?? 0;
}

/** SVG defs: shared gradients and drop shadow for stone circles. */
function StoneDefs() {
  return (
    <defs>
      <radialGradient
        id="sumo-stone-light"
        cx="32%"
        cy="28%"
        r="78%"
        gradientUnits="objectBoundingBox"
      >
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="42%" stopColor="#eef1f5" />
        <stop offset="72%" stopColor="#cfd6df" />
        <stop offset="100%" stopColor="#9ca6b5" />
      </radialGradient>
      <radialGradient
        id="sumo-stone-dark"
        cx="32%"
        cy="28%"
        r="78%"
        gradientUnits="objectBoundingBox"
      >
        <stop offset="0%" stopColor="#8892a0" />
        <stop offset="38%" stopColor="#5c6573" />
        <stop offset="70%" stopColor="#3a404c" />
        <stop offset="100%" stopColor="#24282f" />
      </radialGradient>
      <filter
        id="sumo-stone-drop"
        x="-40%"
        y="-40%"
        width="180%"
        height="180%"
      >
        <feDropShadow
          dx="0"
          dy="3.5"
          stdDeviation="2.8"
          floodOpacity="0.38"
        />
      </filter>
    </defs>
  );
}

function stoneFillUrl(color) {
  return color === "white" ? "url(#sumo-stone-light)" : "url(#sumo-stone-dark)";
}

function stoneStrokeRing(color) {
  return color === "white"
    ? "rgba(15,23,42,0.14)"
    : "rgba(255,255,255,0.16)";
}

/**
 * Stone drawing — optional `pinChangeVisualAid` tints the **pin numeral** with
 * `sumoVisualAccent` when that cell’s displayed pin count changed on the last move
 * (player aid only). Pin SVG text uses CSS `user-select: none`.
 * @param {{ x: number, y: number, color: 'white'|'black', stoneR: number, scale?: number, opacity?: number, pin?: number, pinFontSize: number, pinChangeVisualAid?: boolean }} p
 */
function StoneDisc({
  x,
  y,
  color,
  stoneR,
  scale = 1,
  opacity = 1,
  pin = 0,
  pinFontSize,
  pinChangeVisualAid = false,
}) {
  const g = (
    <g
      opacity={opacity}
      transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}
    >
      <circle
        cx={x}
        cy={y}
        r={stoneR}
        fill={stoneFillUrl(color)}
        stroke={stoneStrokeRing(color)}
        strokeWidth={1.1}
        filter="url(#sumo-stone-drop)"
      />
      {pin > 0 ? (
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          className={[
            "hex-pin-numeral",
            `hex-pin-numeral--${color}`,
            pinChangeVisualAid ? "hex-pin-numeral--visual-aid" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ fontSize: pinFontSize * scale }}
        >
          {pin}
        </text>
      ) : null}
    </g>
  );
  return g;
}

/**
 * Small triangular arrowhead; (nx, ny) is unit direction in SVG space for current layout.
 */
function PushArrowHead({ cx, cy, nx, ny, size = 9 }) {
  const px = -ny;
  const py = nx;
  const tipX = cx + nx * size * 0.95;
  const tipY = cy + ny * size * 0.95;
  const b = size * 0.42;
  const bx = cx - nx * size * 0.28;
  const by = cy - ny * size * 0.28;
  const lx = bx + px * b;
  const ly = by + py * b;
  const rx = bx - px * b;
  const ry = by - py * b;
  const d = `M ${tipX} ${tipY} L ${lx} ${ly} L ${rx} ${ry} Z`;
  return (
    <path
      d={d}
      className="hex-push-arrow"
      strokeLinejoin="round"
    />
  );
}

/**
 * Push-distance strip: `d` arrows along the lead enemy stone’s path (the piece
 * touching the pusher), not one strip per stone in the line — so e.g. 3 vs 3
 * with distance 1 shows 1 arrow, not 3 parallel strips.
 * Second pass dedupes cells so two axes never draw two heads on the same hex.
 * @param {null | Array<{ fromId: string, toId: string | null, color?: 'white'|'black', distance?: number, dir?: [number, number], offBoardAxial?: { q: number, r: number } }>} marks
 * @param {Record<string, { q: number, r: number, x: number, y: number, id: string }>} cellPx
 * @param {Record<string, string>} cellIdByQr axial key → cell id
 * @param {(q: number, r: number, R: number) => { x: number, y: number }} toPixel
 */
function PushOriginArrows({ marks, cellPx, cellIdByQr, toPixel }) {
  const items = useMemo(() => {
    if (!marks?.length) return [];
    /** @type Map<string, { nx: number, ny: number }> */
    const byCell = new Map();
    /** One strip per rigid push: same axial dir + distance (sumo lists lead enemy first). */
    const seenPushStrip = new Set();
    marks.forEach((m) => {
      const from = cellPx[m.fromId];
      if (!from) return;
      const to = m.toId ? cellPx[m.toId] : null;
      let uq;
      let ur;
      let steps;
      if (
        typeof m.distance === "number" &&
        m.distance >= 1 &&
        Array.isArray(m.dir) &&
        m.dir.length === 2
      ) {
        uq = m.dir[0];
        ur = m.dir[1];
        steps = m.distance;
      } else {
        if (!to) return;
        const meta = axialPushStepCount(from, to);
        if (!meta || meta.steps < 1) return;
        ({ uq, ur, steps } = meta);
      }
      const stripKey = `${uq},${ur},${steps}`;
      if (seenPushStrip.has(stripKey)) return;
      seenPushStrip.add(stripKey);
      const base = toPixel(0, 0, HEX_R);
      const tip = toPixel(uq, ur, HEX_R);
      let nx = tip.x - base.x;
      let ny = tip.y - base.y;
      const nlen = Math.hypot(nx, ny) || 1;
      nx /= nlen;
      ny /= nlen;
      for (let i = 0; i < steps; i++) {
        const q = from.q + i * uq;
        const r = from.r + i * ur;
        const id = cellIdByQr[`${q},${r}`];
        if (!id) continue;
        byCell.set(id, { nx, ny });
      }
    });
    const out = [];
    for (const [id, { nx, ny }] of byCell) {
      const cell = cellPx[id];
      if (!cell) continue;
      out.push(
        <PushArrowHead key={id} cx={cell.x} cy={cell.y} nx={nx} ny={ny} />
      );
    }
    return out;
  }, [marks, cellPx, cellIdByQr, toPixel]);

  if (items.length === 0) return null;
  return (
    <g className="hex-push-origin-layer" pointerEvents="none" aria-hidden="true">
      {items}
    </g>
  );
}

/**
 * @param board occupied cells id → 'white' | 'black'
 * @param pins pin count per id from computePins
 * @param motion when set and t in <0,1>, flying stones + pop-in for new placement; board already reflects end state.
 *        May include `pinsBeforePlacement` for push-off pin numerals during the tween.
 * @param pushMarks last turn’s pushed segment list (see PushOriginArrows)
 * @param blackPiecesRemoved enemy black stones pushed off (credited in pushPoints.white)
 * @param whitePiecesRemoved enemy white stones pushed off (credited in pushPoints.black)
 * @param pushOffHudAccentBlackPanel highlight top “black removed” HUD (last move had black push-offs)
 * @param pushOffHudAccentWhitePanel highlight bottom HUD (last move had white push-offs)
 * @param pinChangeVisualAidIds cells whose pin numeral is tinted until the next move
 * @param boardCaption line below the SVG (per-game stub / board size)
 * @param cells cell list from `hexBoard.js` (id + q, r); defaults to Sumo board
 * @param {'flat-top'|'pointy-top'} [hexOrientation] tile orientation in pixel space
 */
export function SumoHexBoard({
  board,
  pins,
  onCellClick,
  winner,
  motion,
  lastPlacedId,
  pushMarks = null,
  blackPiecesRemoved = 0,
  whitePiecesRemoved = 0,
  pushOffHudAccentBlackPanel = false,
  pushOffHudAccentWhitePanel = false,
  pinChangeVisualAidIds = [],
  boardCaption = "Small Board: 6x6x5",
  cells: cellsProp = DEFAULT_CELLS,
  hexOrientation = "flat-top",
}) {
  const cells = cellsProp;

  const layout = useMemo(
    () => computeHexPixelLayout(cells, hexOrientation, HEX_R),
    [cells, hexOrientation]
  );

  const { cellPx, cellIdByQr, B, apo, stoneR, toPixel, hexCornersFn } = layout;

  const pinChangeSet = useMemo(
    () => new Set(pinChangeVisualAidIds),
    [pinChangeVisualAidIds]
  );

  const svg = useMemo(
    () => ({
      vb: `0 0 ${B.w} ${B.h}`,
    }),
    [B.w, B.h]
  );

  const done = winner != null;
  const pinFontSize = stoneR * 0.92;
  const animating = motion != null && motion.t < 1;
  const moveList = motion?.moves ?? [];
  const movingToIds =
    animating && moveList.length > 0
      ? new Set(
          moveList.map((m) => m.toId).filter((id) => id != null && id !== "")
        )
      : new Set();
  const movingFromIds =
    animating && moveList.length > 0
      ? new Set(moveList.map((m) => m.fromId))
      : new Set();

  return (
    <div className="hex-board-stage" role="application" aria-label="Hex board">
      <p className="visually-hidden" aria-live="polite">
        Black pieces pushed off the board: {blackPiecesRemoved}. White pieces
        pushed off the board: {whitePiecesRemoved}.
      </p>
      <div className="hex-board-visual-wrap">
        <div
          className={
            "hex-board-removed-hud hex-board-removed-hud--top" +
            (pushOffHudAccentBlackPanel
              ? " hex-board-removed-hud--push-off-accent"
              : "")
          }
          aria-hidden="true"
        >
          <span className="hex-board-removed-label">Pieces Removed:</span>
          <span className="hex-board-removed-pip player-game-piece player-game-piece--black" />
          <span className="hex-board-removed-count mono">
            ×{blackPiecesRemoved}
          </span>
        </div>
        <div
          className={
            "hex-board-removed-hud hex-board-removed-hud--bottom" +
            (pushOffHudAccentWhitePanel
              ? " hex-board-removed-hud--push-off-accent"
              : "")
          }
          aria-hidden="true"
        >
          <span className="hex-board-removed-label">Pieces Removed:</span>
          <span className="hex-board-removed-pip player-game-piece player-game-piece--white" />
          <span className="hex-board-removed-count mono">
            ×{whitePiecesRemoved}
          </span>
        </div>
        <svg
          className="hex-svg"
          viewBox={svg.vb}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="false"
        >
        <StoneDefs />
        <g
          transform={`translate(${-B.ox} ${-B.oy})`}
          className="hex-layer"
        >
          {/* ── Layer 1: tile faces only (hex neighbor draw order can bury per-cell overlays). ── */}
          <g className="hex-layer-tiles">
            {cells.map((c) => {
              const { x, y } = toPixel(c.q, c.r, HEX_R);
              const color = board[c.id];
              const pin = pins[c.id] ?? 0;
              const corners = hexCornersFn(x, y, HEX_R);
              const points = cornersToSvgPoints(corners);
              const playable = !done && !color;
              const aria = color
                ? `Cell ${c.id}, ${color}${pin ? `, ${pin} pin(s)` : ""}`
                : `Cell ${c.id}, empty`;
              return (
                <g key={`hex-tile-${c.id}`} className="hex-cell-group">
                  <polygon
                    points={points}
                    className={[
                      "hex-shape",
                      playable ? "hex-playable" : "",
                      color ? `hex-filled hex-${color}` : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    tabIndex={playable ? 0 : -1}
                    role="button"
                    aria-label={aria}
                    onMouseDown={(e) => {
                      if (playable) e.preventDefault();
                    }}
                    onClick={() => playable && onCellClick(c.id)}
                    onKeyDown={(e) => {
                      if (
                        playable &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        onCellClick(c.id);
                      }
                    }}
                  />
                </g>
              );
            })}
          </g>

          {/* ── Layer 2: last-move ring after all tiles so it is never half-hidden by neighbors. ── */}
          {lastPlacedId && cellPx[lastPlacedId] ? (
            <g
              className="hex-last-placed-ring-layer"
              pointerEvents="none"
              aria-hidden="true"
            >
              <polygon
                points={cornersToSvgPoints(
                  hexCornersFn(
                    cellPx[lastPlacedId].x,
                    cellPx[lastPlacedId].y,
                    HEX_R
                  )
                )}
                className="hex-last-placed-ring"
              />
            </g>
          ) : null}

          {/* ── Layer 3: stones and empty-cell labels (always above ring). ── */}
          <g className="hex-layer-stones">
            {cells.map((c) => {
              const { x, y } = toPixel(c.q, c.r, HEX_R);
              const color = board[c.id];
              const pin = pins[c.id] ?? 0;

              /* During motion, hide base-layer stones that are drawn in the motion overlay (lerp). */
              const hideStaticStone =
                animating &&
                color &&
                ((motion.placedId === c.id && motion.placeColor === color) ||
                  movingToIds.has(c.id) ||
                  movingFromIds.has(c.id));

              return (
                <g key={`hex-stone-${c.id}`} className="hex-cell-group">
                  {color && !hideStaticStone ? (
                    <StoneDisc
                      x={x}
                      y={y}
                      color={color}
                      stoneR={stoneR}
                      pin={pin}
                      pinFontSize={pinFontSize}
                      pinChangeVisualAid={pinChangeSet.has(c.id)}
                    />
                  ) : null}
                  {!color ? (
                    <text
                      x={x}
                      y={y + apo * 0.72}
                      textAnchor="middle"
                      className="hex-coord"
                      pointerEvents="none"
                    >
                      {c.id}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>

          <PushOriginArrows
            marks={pushMarks}
            cellPx={cellPx}
            cellIdByQr={cellIdByQr}
            toPixel={toPixel}
          />

          {animating && motion ? (
            <g className="hex-motion-layer" pointerEvents="none">
              {moveList.map((m, i) => {
                const from = cellPx[m.fromId];
                if (!from || !m.color) return null;
                const pushOff = isPushOffMove(m);
                const toCell = !pushOff && m.toId ? cellPx[m.toId] : null;
                const targetPx = pushOff
                  ? toPixel(m.offBoardAxial.q, m.offBoardAxial.r, HEX_R)
                  : toCell;
                if (!targetPx) return null;
                const { positionT, opacity, discScale } = pushMotionInterpolants(
                  motion.t,
                  pushOff
                );
                const mx = lerp(from.x, targetPx.x, positionT);
                const my = lerp(from.y, targetPx.y, positionT);
                const pinSnap = motion.pinsBeforePlacement ?? {};
                const p = pinForMotionStone(m, pins, pinSnap);
                const pinAidId = pushOff ? m.fromId : m.toId;
                return (
                  <StoneDisc
                    key={`fly-${m.fromId}-${m.toId ?? "off"}-${i}`}
                    x={mx}
                    y={my}
                    color={m.color}
                    stoneR={stoneR}
                    scale={discScale}
                    opacity={opacity}
                    pin={p}
                    pinFontSize={pinFontSize}
                    pinChangeVisualAid={pinChangeSet.has(pinAidId)}
                  />
                );
              })}
              {motion.placedId && cellPx[motion.placedId] ? (
                <g key="place-pop">
                  {(() => {
                    const c = cellPx[motion.placedId];
                    const s = lerp(0.1, 1, motion.t);
                    const p = pins[motion.placedId] ?? 0;
                    return (
                      <StoneDisc
                        x={c.x}
                        y={c.y}
                        color={motion.placeColor}
                        stoneR={stoneR}
                        scale={s}
                        pin={p}
                        pinFontSize={pinFontSize}
                        pinChangeVisualAid={pinChangeSet.has(motion.placedId)}
                      />
                    );
                  })()}
                </g>
              ) : null}
            </g>
          ) : null}
        </g>
        </svg>
      </div>
      <p className="hex-legend mono">{boardCaption}</p>
    </div>
  );
}
