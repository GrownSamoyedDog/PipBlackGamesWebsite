/**
 * Admirals **presentational** SVG hex board (pointy-top, shared layout math from `hexBoard.js`).
 *
 * Paint order: tiles → ships (white under black) → coord labels → selection rings → admiral discs
 * (white under black) → interaction HUD (placement dots / move targets). Theme via CSS variables
 * on `app-root` (`themeToCssVars`).
 */
import { useMemo } from "react";
import {
  computeHexPixelLayout,
  DEFAULT_HEX_PIXEL_R,
  cornersToSvgPoints,
} from "../shared/hexBoard.js";
import { emptyAdmiralsCell } from "./admirals.js";

const HEX_R = DEFAULT_HEX_PIXEL_R;

/** Text presentation (\uFE0E) so ⚓ follows CSS fill instead of color emoji. */
const GLYPH_ANCHOR = "\u2693\uFE0E";
/** Bold “X” for dead admirals and fatal-move HUD. */
const GLYPH_DEAD_X = "X";

/** Disc radius ≈ 75% of hex apothem → leaves lower half visible for ships. */
function admiralDiscRadius(apo) {
  return apo * 0.68;
}

/**
 * Sumo-like 3D discs: white uses the same light radial as Sumo stones; black uses a tight
 * near-black radial (theme `--admirals-disc-black-3d-*`) + identical drop shadow filter.
 */
function AdmiralDiscGradientDefs() {
  return (
    <>
      <radialGradient
        id="admirals-disc-grad-light"
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
        id="admirals-disc-grad-dark"
        cx="32%"
        cy="28%"
        r="78%"
        gradientUnits="objectBoundingBox"
      >
        <stop
          offset="0%"
          stopColor="var(--admirals-disc-black-3d-hi)"
        />
        <stop
          offset="38%"
          stopColor="var(--admirals-disc-black-3d-mid)"
        />
        <stop
          offset="70%"
          stopColor="var(--admirals-disc-black-3d-lo)"
        />
        <stop
          offset="100%"
          stopColor="var(--admirals-disc-black-3d-deep)"
        />
      </radialGradient>
      <filter
        id="admirals-disc-drop"
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
    </>
  );
}

/**
 * @param {object} props
 * @param {Record<string, import('./admirals.js').AdmiralsCell>} props.board
 * @param {{ id: string, q: number, r: number }[]} props.cells
 * @param {'pointy-top'} props.hexOrientation
 * @param {string} props.boardCaption
 * @param {'select'|'place'|'move'} [props.phase]
 * @param {'white'|'black'} [props.turn]
 * @param {string | null} [props.selectedAdmiralCellId]
 * @param {Set<string>} [props.validShipCells]
 * @param {Set<string>} [props.validMoveSurvive]
 * @param {Set<string>} [props.validMoveDeath]
 * @param {(cellId: string) => void} [props.onSelectAdmiral]
 * @param {(cellId: string) => void} [props.onPlaceShip]
 * @param {(cellId: string) => void} [props.onMoveAdmiral]
 * @param {boolean} [props.interactive] when false, no clicks (e.g. game over)
 */
export function AdmiralsHexBoard({
  board,
  cells,
  hexOrientation,
  boardCaption,
  phase = "select",
  turn = "white",
  selectedAdmiralCellId = null,
  validShipCells = new Set(),
  validMoveSurvive = new Set(),
  validMoveDeath = new Set(),
  onSelectAdmiral,
  onPlaceShip,
  onMoveAdmiral,
  interactive = true,
}) {
  const layout = useMemo(
    () => computeHexPixelLayout(cells, hexOrientation, HEX_R),
    [cells, hexOrientation]
  );
  const { cellPx, B, toPixel, hexCornersFn, apo } = layout;
  const admiralR = admiralDiscRadius(apo);

  const svg = useMemo(
    () => ({ vb: `0 0 ${B.w} ${B.h}` }),
    [B.w, B.h]
  );

  const hitR = apo * 0.95;
  const dotR = Math.max(4, apo * 0.145);
  /** Fatal X and dead-admiral X: ~same visual size as HUD dot diameter */
  const markFontPx = dotR * 2;
  /** Selection ring hugs admiral disc (center = hex center, r ≈ disc + thin margin). */
  const selectRingR = admiralR + 1.1;

  return (
    <div className="hex-board-stage" role="application" aria-label="Admirals board">
      <div className="hex-board-visual-wrap">
        <svg
          className="hex-svg admirals-hex-svg"
          viewBox={svg.vb}
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="false"
        >
          <defs>
            <AdmiralDiscGradientDefs />
            {cells.map((c) => {
              const p = cellPx[c.id];
              if (!p) return null;
              const { x, y } = p;
              return (
                <g key={`clips-${c.id}`}>
                  <clipPath id={`adm-ship-w-${c.id}`} clipPathUnits="userSpaceOnUse">
                    <rect x={x - 800} y={y} width={1600} height={900} />
                  </clipPath>
                  <clipPath id={`adm-ship-b-${c.id}`} clipPathUnits="userSpaceOnUse">
                    <rect x={x - 800} y={y - 900} width={1600} height={900} />
                  </clipPath>
                </g>
              );
            })}
          </defs>
          <g
            transform={`translate(${-B.ox} ${-B.oy})`}
            className="hex-layer admirals-hex-layer"
          >
            <g className="hex-layer-tiles">
              {cells.map((c) => {
                const { x, y } = toPixel(c.q, c.r, HEX_R);
                const points = cornersToSvgPoints(hexCornersFn(x, y, HEX_R));
                return (
                  <polygon
                    key={`tile-${c.id}`}
                    points={points}
                    className="hex-shape admirals-hex-tile"
                    role="presentation"
                  />
                );
              })}
            </g>

            <g
              className="admirals-ships-layer admirals-ships-layer--white"
              pointerEvents="none"
              aria-hidden="true"
            >
              {cells.map((c) => {
                const { x, y } = toPixel(c.q, c.r, HEX_R);
                const points = cornersToSvgPoints(hexCornersFn(x, y, HEX_R));
                const cell = board[c.id] ?? emptyAdmiralsCell();
                if (!cell.whiteShip) return null;
                return (
                  <polygon
                    key={`ship-w-${c.id}`}
                    points={points}
                    className="admirals-ship admirals-ship--white"
                    clipPath={`url(#adm-ship-w-${c.id})`}
                  />
                );
              })}
            </g>
            <g
              className="admirals-ships-layer admirals-ships-layer--black"
              pointerEvents="none"
              aria-hidden="true"
            >
              {cells.map((c) => {
                const { x, y } = toPixel(c.q, c.r, HEX_R);
                const points = cornersToSvgPoints(hexCornersFn(x, y, HEX_R));
                const cell = board[c.id] ?? emptyAdmiralsCell();
                if (!cell.blackShip) return null;
                return (
                  <polygon
                    key={`ship-b-${c.id}`}
                    points={points}
                    className="admirals-ship admirals-ship--black"
                    clipPath={`url(#adm-ship-b-${c.id})`}
                  />
                );
              })}
            </g>

            <g className="hex-coord-layer" pointerEvents="none" aria-hidden="true">
              {cells.map((c) => {
                const { x, y } = toPixel(c.q, c.r, HEX_R);
                return (
                  <text
                    key={`lab-${c.id}`}
                    x={x}
                    y={y + apo * 0.72}
                    textAnchor="middle"
                    className="hex-coord"
                  >
                    {c.id}
                  </text>
                );
              })}
            </g>

            {interactive &&
            (phase === "select" ||
              ((phase === "place" || phase === "move") && selectedAdmiralCellId)) ? (
              <g
                className="admirals-select-rings-layer"
                pointerEvents="none"
                aria-hidden="true"
              >
                {cells.map((c) => {
                  const { x, y } = toPixel(c.q, c.r, HEX_R);
                  const cell = board[c.id] ?? emptyAdmiralsCell();
                  const cy = y;
                  const aliveWhite =
                    cell.whiteAdmiral && !cell.whiteAdmiral.dead;
                  const aliveBlack =
                    cell.blackAdmiral && !cell.blackAdmiral.dead;
                  let ring = false;
                  if (phase === "select") {
                    ring =
                      (turn === "white" && aliveWhite) ||
                      (turn === "black" && aliveBlack);
                  } else if (
                    (phase === "place" || phase === "move") &&
                    selectedAdmiralCellId === c.id
                  ) {
                    ring =
                      (turn === "white" && aliveWhite) ||
                      (turn === "black" && aliveBlack);
                  }
                  if (!ring) return null;
                  return (
                    <circle
                      key={`sel-ring-${c.id}`}
                      cx={x}
                      cy={cy}
                      r={selectRingR}
                      className="admirals-select-ring"
                    />
                  );
                })}
              </g>
            ) : null}

            <g className="admirals-disc-layer admirals-disc-layer--white">
              {cells.map((c) => {
                const { x, y } = toPixel(c.q, c.r, HEX_R);
                const cell = board[c.id] ?? emptyAdmiralsCell();
                if (!cell.whiteAdmiral) return null;
                const cy = y;
                const alive = !cell.whiteAdmiral.dead;
                const selectedHere = selectedAdmiralCellId === c.id;
                const selectableSelect =
                  interactive && phase === "select" && turn === "white" && alive;
                const clickableSelected =
                  interactive &&
                  (phase === "place" || phase === "move") &&
                  turn === "white" &&
                  alive &&
                  selectedHere;
                const selectable = selectableSelect || clickableSelected;
                return (
                  <g
                    key={`admiral-w-${c.id}`}
                    className={
                      "admirals-admiral admirals-admiral--white" +
                      (selectedHere ? " admirals-admiral--selected" : "")
                    }
                    style={{
                      cursor: selectable
                        ? "pointer"
                        : alive
                          ? "default"
                          : "not-allowed",
                      pointerEvents:
                        interactive && alive && (selectableSelect || clickableSelected)
                          ? "auto"
                          : "none",
                    }}
                    onClick={
                      selectable && onSelectAdmiral
                        ? () => onSelectAdmiral(c.id)
                        : undefined
                    }
                  >
                    <circle
                      cx={x}
                      cy={cy}
                      r={admiralR}
                      className="admirals-admiral-disc"
                      fill="url(#admirals-disc-grad-light)"
                      filter="url(#admirals-disc-drop)"
                    />
                    <text
                      x={x}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontWeight={cell.whiteAdmiral.dead ? 900 : undefined}
                      className={
                        cell.whiteAdmiral.dead
                          ? "admirals-admiral-glyph admirals-admiral-glyph--dead-white"
                          : "admirals-admiral-glyph admirals-admiral-glyph--anchor-on-white"
                      }
                      style={
                        cell.whiteAdmiral.dead
                          ? { fontSize: markFontPx }
                          : undefined
                      }
                    >
                      {cell.whiteAdmiral.dead ? GLYPH_DEAD_X : GLYPH_ANCHOR}
                    </text>
                  </g>
                );
              })}
            </g>

            <g className="admirals-disc-layer admirals-disc-layer--black">
              {cells.map((c) => {
                const { x, y } = toPixel(c.q, c.r, HEX_R);
                const cell = board[c.id] ?? emptyAdmiralsCell();
                if (!cell.blackAdmiral) return null;
                const cy = y;
                const alive = !cell.blackAdmiral.dead;
                const selectedHere = selectedAdmiralCellId === c.id;
                const selectableSelect =
                  interactive && phase === "select" && turn === "black" && alive;
                const clickableSelected =
                  interactive &&
                  (phase === "place" || phase === "move") &&
                  turn === "black" &&
                  alive &&
                  selectedHere;
                const selectable = selectableSelect || clickableSelected;
                return (
                  <g
                    key={`admiral-b-${c.id}`}
                    className={
                      "admirals-admiral admirals-admiral--black" +
                      (selectedHere ? " admirals-admiral--selected" : "")
                    }
                    style={{
                      cursor: selectable
                        ? "pointer"
                        : alive
                          ? "default"
                          : "not-allowed",
                      pointerEvents:
                        interactive && alive && (selectableSelect || clickableSelected)
                          ? "auto"
                          : "none",
                    }}
                    onClick={
                      selectable && onSelectAdmiral
                        ? () => onSelectAdmiral(c.id)
                        : undefined
                    }
                  >
                    <circle
                      cx={x}
                      cy={cy}
                      r={admiralR}
                      className="admirals-admiral-disc"
                      fill="url(#admirals-disc-grad-dark)"
                      filter="url(#admirals-disc-drop)"
                    />
                    <text
                      x={x}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontWeight={cell.blackAdmiral.dead ? 900 : undefined}
                      className={
                        cell.blackAdmiral.dead
                          ? "admirals-admiral-glyph admirals-admiral-glyph--dead-black"
                          : "admirals-admiral-glyph admirals-admiral-glyph--anchor-on-black"
                      }
                      style={
                        cell.blackAdmiral.dead
                          ? { fontSize: markFontPx }
                          : undefined
                      }
                    >
                      {cell.blackAdmiral.dead ? GLYPH_DEAD_X : GLYPH_ANCHOR}
                    </text>
                  </g>
                );
              })}
            </g>

            {interactive &&
            (phase === "place" || phase === "move") &&
            (validShipCells.size > 0 ||
              validMoveSurvive.size > 0 ||
              validMoveDeath.size > 0) ? (
              <g className="admirals-hud-layer" pointerEvents="auto">
                {phase === "place"
                  ? cells.map((c) => {
                      if (!validShipCells.has(c.id)) return null;
                      const { x, y } = toPixel(c.q, c.r, HEX_R);
                      const my = y;
                      return (
                        <g
                          key={`hud-place-${c.id}`}
                          className="admirals-hud-target"
                          style={{ cursor: "pointer" }}
                          onClick={
                            onPlaceShip ? () => onPlaceShip(c.id) : undefined
                          }
                        >
                          <circle
                            cx={x}
                            cy={my}
                            r={hitR}
                            className="admirals-hud-hit"
                          />
                          <circle
                            cx={x}
                            cy={my}
                            r={dotR}
                            className="admirals-hud-dot admirals-hud-dot--safe"
                          />
                        </g>
                      );
                    })
                  : null}
                {phase === "move"
                  ? cells.flatMap((c) => {
                      const { x, y } = toPixel(c.q, c.r, HEX_R);
                      const my = y;
                      const out = [];
                      if (validMoveSurvive.has(c.id)) {
                        out.push(
                          <g
                            key={`hud-mv-ok-${c.id}`}
                            className="admirals-hud-target"
                            style={{ cursor: "pointer" }}
                            onClick={
                              onMoveAdmiral
                                ? () => onMoveAdmiral(c.id)
                                : undefined
                            }
                          >
                            <circle
                              cx={x}
                              cy={my}
                              r={hitR}
                              className="admirals-hud-hit"
                            />
                            <circle
                              cx={x}
                              cy={my}
                              r={dotR}
                              className="admirals-hud-dot admirals-hud-dot--safe"
                            />
                          </g>
                        );
                      }
                      if (validMoveDeath.has(c.id)) {
                        out.push(
                          <g
                            key={`hud-mv-die-${c.id}`}
                            className="admirals-hud-target"
                            style={{ cursor: "pointer" }}
                            onClick={
                              onMoveAdmiral
                                ? () => onMoveAdmiral(c.id)
                                : undefined
                            }
                          >
                            <circle
                              cx={x}
                              cy={my}
                              r={hitR}
                              className="admirals-hud-hit"
                            />
                            <text
                              x={x}
                              y={my}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontWeight={900}
                              className="admirals-hud-fatal-x"
                              style={{ fontSize: markFontPx }}
                            >
                              {GLYPH_DEAD_X}
                            </text>
                          </g>
                        );
                      }
                      return out;
                    })
                  : null}
              </g>
            ) : null}
          </g>
        </svg>
      </div>
      <p className="hex-legend mono">{boardCaption}</p>
    </div>
  );
}
