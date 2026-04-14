/**
 * Ouroboros match UI — N×N square stacks (4 / 6 / 8), reserve HUD, Gather/Scatter, end-of-turn snake marker.
 *
 * **Turn actions:** Placing (empty cell), Gathering, Scattering — detailed rules live in the
 * comment above `placeOnEmptyCell` and in `ouroborosLogic.js`.
 *
 * **Draft Gather/Scatter:** piece moves apply to `draftStacks` only. **End Turn** (toolbar under
 * the white reserve HUD, below Cancel) merges into `stackByCoord` and advances the turn. **Cancel**
 * discards the draft with no change to committed pieces. Further gathers/scatters are done by
 * clicking valid cells on the board — no modal between steps. When no legal Gather/Scatter step
 * remains (full gathering stack, empty scatter source, or no in-range cells), the draft commits
 * automatically and the turn ends immediately (same outcome as **End Turn**).
 *
 * **Snake eye (`snake_head`):** when a turn ends, `applySnakeMarkerEndOfTurn` clears every prior
 * marker, then marks exactly one top piece — the stack where the player last placed or moved a
 * piece (Placing: that cell; Gather: source stack; Scatter: destination cell). Tracked during
 * multi-step actions with `pendingSnakeTopCoordRef`.
 *
 * **Gamelog:** one line per completed turn (`ouroborosGamelog.js`) — placement coord, `Gsrc-tgt-…`
 * gather / `Ssrc-tgt-…` scatter (hyphens between cells); drafts log only on **End Turn**.
 * **Gamelog review:** scrub plies like Sumo (`gamelogReviewNav.js`); sidebar **GAME END** when the
 * match is over. **Practice session** matches Sumo / Admirals: `GameSettingsModal` (draft settings
 * until **Confirm**), then `board-wrap--inactive` veil from `index.css` when idle, reviewing, or
 * finished. On the GAME END
 * step, closing the result modal exits review.
 *
 * **Undo:** `undoStack` holds snapshots before each completed turn (place or Gather/Scatter **End
 * Turn**) and before **Agree draw** or **Resign** — same idea as Sumo / Admirals. **Import Game**
 * rebuilds the stack via `replayOuroborosGameForImport`. **Cancel** on a draft does not push an
 * undo point.
 *
 * **Agree draw / Resign:** enabled only after Practice → Confirm; work from an empty board or
 * mid–Gather/Scatter (either clears an active draft, same as **Resign**). Left column wording matches
 * Sumo / Admirals.
 *
 * **Game over:** `gameOverCopy.js` supplies the kicker (resignation, agreed draw, natural endings,
 * or generic “Game over”). Modal visibility matches Sumo / Admirals: hidden during review except on
 * the GAME END row; finish-flag reopens when dismissed in live play.
 *
 * **Stack score:** player bars show **Stack Score** — count of stacks whose **top** piece is that
 * color on the **committed** board (`stackByCoord`), so it updates when each turn ends (not during
 * a Gather/Scatter draft). Black’s total adds **komi** (`OUROBOROS_STACK_SCORE_KOMI`), a Go-style
 * handicap for the second player (see `ouroborosLogic.js`).
 *
 * **Road:** when **Immediate objective** is Road, a win is an orthogonally connected set of stacks
 * you own (top color) spanning left–right and/or top–bottom; ties on the same turn follow the same
 * actor rule as hoopsnake (`ouroborosLogic.js`).
 *
 * **Amass:** when the **Amass Reserves** HUD counter reaches 0 for a color, they can win immediately
 * with exactly one orthogonal group of owned stacks (see `ouroborosLogic.js`). HUD stacks that row
 * under white’s reserve and above black’s reserve, matching `hex-board-removed-hud` styling.
 *
 * **Layout:** shared site header + triple column (log | board | notepad), same chrome as Sumo /
 * Admirals (`SiteTopNav` includes **Settings** → `ThemeSettingsModal`).
 */
import {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
} from "react";
import { NavLink } from "react-router-dom";
import { SITE_GAMES } from "../shared/gameRegistry.js";
import { SiteTopNav } from "../shared/SiteTopNav.jsx";
import { SiteHomepageLink } from "../shared/SiteHomepageLink.jsx";
import { ThemeSettingsModal } from "../shared/ThemeSettingsModal.jsx";
import { GameSettingsModal } from "../shared/GameSettingsModal.jsx";
import { ChallengeAiModal } from "../shared/ChallengeAiModal.jsx";
import {
  mergeTheme,
  loadStoredTheme,
  themeToCssVars,
} from "../shared/theme.js";
import { useSyncGameViewportHeight } from "../shared/useSyncGameViewportHeight.js";
import { GamelogReviewNav } from "../shared/GamelogReviewNav.jsx";
import {
  gamelogReviewDisplayFraction,
  gamelogReviewHasTerminalStep,
} from "../shared/gamelogReviewNav.js";
import { gameOverModalKicker } from "../shared/gameOverCopy.js";
import {
  OUROBOROS_MAX_STACK,
  OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP,
  OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP,
  OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP,
  OUROBOROS_IMMEDIATE_OBJECTIVE_ROAD,
  OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS,
  OUROBOROS_TERMINATION_ROAD_WIN,
  OUROBOROS_TERMINATION_AMASS_WIN,
  OUROBOROS_INITIAL_RESERVE_PER_COLOR,
  OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_4,
  OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6,
  OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_8,
  amassReservesNeededRemaining,
  applySnakeMarkerEndOfTurn,
  countOwnedStacks,
  gatherEnabledForMenu,
  scatterEnabledForMenu,
  gatherHasValidTarget,
  scatterHasValidTarget,
  isGatherTarget,
  isScatterTarget,
  playerControlsStack,
  evaluateOuroborosNaturalEndOfTurn,
  coordsInAnyHoopsnakeRing,
  coordsInAnyWinningRoad,
  coordsInWinningAmassShape,
} from "./ouroborosLogic.js";
import {
  ouroborosMovesToGamelogRounds,
  serializeOuroborosGamelog,
  parseOuroborosGamelogJson,
  replayOuroborosGameForImport,
} from "./ouroborosGamelog.js";
import "./OuroborosGameShell.css";

const STACK_MARGIN_PCT = 8;
const STACK_PIECE_SIZE_PCT = 44;
const OUROBOROS_BOARD_SIZE_OPTIONS = [
  { value: "4x4", label: "4x4" },
  { value: "6x6", label: "6x6" },
  { value: "8x8", label: "8x8" },
];
const OUROBOROS_BOARD_SIZE_CONFIG = {
  "4x4": { size: 4, caption: "Micro Board: 4x4" },
  "6x6": { size: 6, caption: "Small Board: 6x6" },
  "8x8": { size: 8, caption: "Large Board: 8x8" },
};
const OUROBOROS_IMMEDIATE_OBJECTIVE_OPTIONS = [
  {
    value: OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP,
    label: "Micro Hoopsnake",
  },
  {
    value: OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP,
    label: "Small Hoopsnake",
  },
  {
    value: OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP,
    label: "Large Hoopsnake",
  },
  { value: OUROBOROS_IMMEDIATE_OBJECTIVE_ROAD, label: "Road" },
  { value: OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS, label: "Amass" },
];
/** Bot catalog for this game; empty until AI engines are added. */
const OUROBOROS_BOT_OPTIONS = [];
/**
 * New-match presets keyed by `boardSize` UI value (`4x4` / `6x6` / `8x8`). Amass threshold uses the same
 * numbers as `OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_*` in `ouroborosLogic.js` (and gamelog import).
 */
const OUROBOROS_SETTINGS_DEFAULTS_BY_BOARD = {
  "4x4": {
    reserves: 10,
    blackKomi: 0.5,
    maxStackHeight: 3,
    immediateObjectiveType: OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP,
    reservesNeededToAmassWin: OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_4,
  },
  "6x6": {
    reserves: OUROBOROS_INITIAL_RESERVE_PER_COLOR,
    blackKomi: 0.5,
    maxStackHeight: OUROBOROS_MAX_STACK,
    immediateObjectiveType: OUROBOROS_IMMEDIATE_OBJECTIVE_SMALL_HOOP,
    reservesNeededToAmassWin: OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_6,
  },
  "8x8": {
    reserves: 42,
    blackKomi: 1.5,
    maxStackHeight: 7,
    immediateObjectiveType: OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP,
    reservesNeededToAmassWin: OUROBOROS_DEFAULT_RESERVES_TO_AMASS_WIN_8,
  },
};

function ouroborosSettingsDefaultsForBoard(boardSize) {
  return (
    OUROBOROS_SETTINGS_DEFAULTS_BY_BOARD[boardSize] ??
    OUROBOROS_SETTINGS_DEFAULTS_BY_BOARD["6x6"]
  );
}

function ouroborosBoardKeyFromSize(boardSize) {
  return `${boardSize}x${boardSize}`;
}

function OuroborosSettingsFields({
  idPrefix,
  immediateObjectiveType,
  onImmediateObjectiveTypeChange,
  reservesNeededToAmassWin,
  onReservesNeededToAmassWinChange,
  initialReservePerColor,
  onInitialReservePerColorChange,
  blackKomi,
  onBlackKomiChange,
  maxStackHeight,
  onMaxStackHeightChange,
  disabled = false,
}) {
  return (
    <>
      <div className="game-settings-field">
        <label
          className="game-settings-field-label"
          htmlFor={`${idPrefix}-objective-type`}
        >
          Immediate Objective Type
        </label>
        <select
          className="game-settings-field-select"
          id={`${idPrefix}-objective-type`}
          value={immediateObjectiveType}
          onChange={(e) => onImmediateObjectiveTypeChange(e.target.value)}
          disabled={disabled}
        >
          {OUROBOROS_IMMEDIATE_OBJECTIVE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS ? (
        <div className="game-settings-field">
          <label
            className="game-settings-field-label"
            htmlFor={`${idPrefix}-amass-reserves-needed`}
          >
            Reserves Until Amass Win Possible
          </label>
          <input
            id={`${idPrefix}-amass-reserves-needed`}
            className="game-settings-field-input"
            type="number"
            min={1}
            step={1}
            value={reservesNeededToAmassWin}
            onChange={(e) => onReservesNeededToAmassWinChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      ) : null}
      <div className="game-settings-field">
        <label className="game-settings-field-label" htmlFor={`${idPrefix}-reserves`}>
          Reserves
        </label>
        <input
          id={`${idPrefix}-reserves`}
          className="game-settings-field-input"
          type="number"
          min={1}
          step={1}
          value={initialReservePerColor}
          onChange={(e) => onInitialReservePerColorChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="game-settings-field">
        <label className="game-settings-field-label" htmlFor={`${idPrefix}-black-komi`}>
          Black Komi
        </label>
        <input
          id={`${idPrefix}-black-komi`}
          className="game-settings-field-input"
          type="number"
          min={0}
          step={0.5}
          value={blackKomi}
          onChange={(e) => onBlackKomiChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="game-settings-field">
        <label
          className="game-settings-field-label"
          htmlFor={`${idPrefix}-max-stack`}
        >
          Max stack height
        </label>
        <input
          id={`${idPrefix}-max-stack`}
          className="game-settings-field-input"
          type="number"
          min={2}
          step={1}
          value={maxStackHeight}
          onChange={(e) => onMaxStackHeightChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </>
  );
}

/** @typedef {'white'|'black'} OuroborosPiece */
/** Piece sides: blank side and snake head side (snake eye). */
/** @typedef {'blank'|'snake_head'} OuroborosPieceFace */
/**
 * @typedef {{
 *   color: OuroborosPiece,
 *   face: OuroborosPieceFace,
 * }} OuroborosCellPiece
 */

/**
 * @typedef {{
 *   kind: 'menu',
 *   coord: string,
 * } | {
 *   kind: 'gather_pick',
 *   source: string,
 *   range: number,
 * } | {
 *   kind: 'scatter_pick',
 *   source: string,
 *   range: number,
 * }} OuroborosInteraction
 */

/**
 * Coords appended during a Gather/Scatter draft for the gamelog line (`draftNotationRef`).
 * @typedef {{ kind: 'gather'|'scatter'|null, source: string, targets: string[] }} OuroborosDraftNotation
 */

/**
 * One entry on `undoStack`: enough to restore the match after **Request Undo** (live play or
 * import). Snapshots for a **completed** turn are always between-turns: `interaction: null`, no
 * draft (Gather/Scatter commits included — same as import replay).
 *
 * @typedef {{
 *   stackByCoord: Record<string, OuroborosCellPiece[]>,
 *   piece_reserve: { white: number, black: number },
 *   turn: 'white'|'black',
 *   moveHistory: string[],
 *   interaction: OuroborosInteraction | null,
 *   draftStacks: Record<string, OuroborosCellPiece[]> | null,
 *   draftNotation: OuroborosDraftNotation,
 *   pendingSnakeTopCoord: string | null,
 *   termination: null | 'resign' | 'agreed_draw' | 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win',
 *   resignedWinner: 'white'|'black'|null,
 *   naturalOutcome: 'white'|'black'|'draw'|null,
 * }} OuroborosUndoSnapshot
 */

/** @param {OuroborosInteraction | null} interaction */
function cloneOuroborosInteraction(interaction) {
  if (interaction == null) return null;
  if (interaction.kind === "menu") {
    return { kind: /** @type {const} */ ("menu"), coord: interaction.coord };
  }
  if (interaction.kind === "gather_pick") {
    return {
      kind: /** @type {const} */ ("gather_pick"),
      source: interaction.source,
      range: interaction.range,
    };
  }
  return {
    kind: /** @type {const} */ ("scatter_pick"),
    source: interaction.source,
    range: interaction.range,
  };
}

/**
 * @param {Record<string, OuroborosCellPiece[]>} stacks
 */
function cloneStacksRecord(stacks) {
  /** @type {Record<string, OuroborosCellPiece[]>} */
  const out = {};
  for (const key of Object.keys(stacks)) {
    out[key] = (stacks[key] ?? []).map((p) => ({ ...p }));
  }
  return out;
}

/**
 * @param {OuroborosUndoSnapshot['stackByCoord']} stackByCoord
 * @param {{ white: number, black: number }} piece_reserve
 * @param {'white'|'black'} turn
 * @param {string[]} moveHistory
 * @param {OuroborosInteraction | null} interaction
 * @param {Record<string, OuroborosCellPiece[]> | null} draftStacks
 * @param {OuroborosDraftNotation} draftNotation
 * @param {string | null} pendingSnakeTopCoord
 * @param {OuroborosUndoSnapshot['termination']} termination
 * @param {'white'|'black'|null} resignedWinner
 * @param {'white'|'black'|'draw'|null} naturalOutcome
 * @returns {OuroborosUndoSnapshot}
 */
function captureOuroborosUndoSnapshot(
  stackByCoord,
  piece_reserve,
  turn,
  moveHistory,
  interaction,
  draftStacks,
  draftNotation,
  pendingSnakeTopCoord,
  termination,
  resignedWinner,
  naturalOutcome
) {
  return {
    stackByCoord: cloneStacksRecord(stackByCoord),
    piece_reserve: { ...piece_reserve },
    turn,
    moveHistory: [...moveHistory],
    interaction: cloneOuroborosInteraction(interaction),
    draftStacks: draftStacks ? cloneStacksRecord(draftStacks) : null,
    draftNotation: {
      kind: draftNotation.kind,
      source: draftNotation.source,
      targets: [...draftNotation.targets],
    },
    pendingSnakeTopCoord,
    termination,
    resignedWinner,
    naturalOutcome,
  };
}

/**
 * Legacy string entries default to blank face.
 *
 * @param {OuroborosPiece | OuroborosCellPiece} raw
 * @returns {OuroborosCellPiece}
 */
function normalizePiece(raw) {
  if (typeof raw === "string") return { color: raw, face: "blank" };
  return {
    color: raw.color,
    face: raw.face ?? "blank",
  };
}

/**
 * Bottom offsets (percent) for stack layers. Index 0 is the **bottom** piece (anchored low); each
 * higher index sits one step toward the top. Step size comes from `maxStackHeight` so a full
 * stack uses the whole vertical band — same idea as the original fixed 5-high layout.
 *
 * @param {number} stackSize
 * @param {number} maxStackHeight integer >= 2
 * @returns {number[]}
 */
function computeLayerBottomOffsets(stackSize, maxStackHeight) {
  const maxN = Math.max(2, Math.floor(maxStackHeight));
  const count = Math.max(1, Math.min(maxN, Math.floor(stackSize)));
  const minBottom = STACK_MARGIN_PCT;
  const maxBottom = 100 - STACK_MARGIN_PCT - STACK_PIECE_SIZE_PCT;
  const span = maxBottom - minBottom;
  const step = maxN <= 1 ? 0 : span / (maxN - 1);
  return Array.from({ length: count }, (_, i) => minBottom + i * step);
}

/** e.g. ` (+0.5)` from `OUROBOROS_STACK_SCORE_KOMI` so the handicap is visible on Black’s bar. */
function ouroborosKomiScoreSuffix(komi) {
  const n =
    typeof komi === "number" && Number.isInteger(komi)
      ? String(komi)
      : Number(komi).toFixed(1);
  return ` (+${n})`;
}

/** Advance to the next player and clear any menu / modal interaction state. */
function advanceTurn(setTurn, setInteraction) {
  setTurn((prev) => (prev === "white" ? "black" : "white"));
  setInteraction(null);
}

/** @param {{ config: import("../shared/gameRegistry.js").SiteGameConfig }} props */
export function OuroborosGameShell({ config }) {
  const CLOCK_INFINITE_DISPLAY = "99:99";
  useSyncGameViewportHeight();
  const [theme, setTheme] = useState(() => mergeTheme(loadStoredTheme()));
  /** Drives `ThemeSettingsModal` (header **Settings**). */
  const [themeOpen, setThemeOpen] = useState(false);

  /** Practice flow: false until Game Settings → Confirm; false again when the match has ended. */
  const [practiceSessionActive, setPracticeSessionActive] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [challengeAiOpen, setChallengeAiOpen] = useState(false);
  const [selectedAiBotId, setSelectedAiBotId] = useState("");
  const aiDefaults = useMemo(
    () => ouroborosSettingsDefaultsForBoard("6x6"),
    []
  );
  const [boardSize, setBoardSize] = useState("6x6");
  const boardSizeConfig =
    OUROBOROS_BOARD_SIZE_CONFIG[boardSize] ??
    OUROBOROS_BOARD_SIZE_CONFIG["6x6"];
  const boardSizeN = boardSizeConfig.size;

  // --- Committed match settings (Game Settings → Confirm; also set by gamelog import) ---
  const [immediateObjectiveType, setImmediateObjectiveType] = useState(
    ouroborosSettingsDefaultsForBoard("6x6").immediateObjectiveType
  );
  const [initialReservePerColor, setInitialReservePerColor] = useState(
    ouroborosSettingsDefaultsForBoard("6x6").reserves
  );
  const [blackKomi, setBlackKomi] = useState(
    ouroborosSettingsDefaultsForBoard("6x6").blackKomi
  );
  const [maxStackHeight, setMaxStackHeight] = useState(
    ouroborosSettingsDefaultsForBoard("6x6").maxStackHeight
  );
  /**
   * Amass threshold: placements from pool before the **Amass Reserves** HUD reaches 0 (Amass objective only).
   * State key matches gamelog `settings.reservesNeededToAmassWin` and `ouroborosLogic` identifiers; the Game
   * Settings label for this value is **Reserves Until Amass Win Possible** (see logic file JSDoc on defaults).
   */
  const [reservesNeededToAmassWin, setReservesNeededToAmassWin] = useState(
    ouroborosSettingsDefaultsForBoard("6x6").reservesNeededToAmassWin
  );

  /**
   * Mirror of committed match settings for `GameSettingsModal` only. Synced from live state each
   * time the modal opens so edits stay draft until **Confirm**.
   */
  const [draftBoardSize, setDraftBoardSize] = useState("6x6");
  const [draftImmediateObjectiveType, setDraftImmediateObjectiveType] =
    useState(ouroborosSettingsDefaultsForBoard("6x6").immediateObjectiveType);
  const [draftInitialReservePerColor, setDraftInitialReservePerColor] =
    useState(ouroborosSettingsDefaultsForBoard("6x6").reserves);
  const [draftBlackKomi, setDraftBlackKomi] = useState(
    ouroborosSettingsDefaultsForBoard("6x6").blackKomi
  );
  const [draftMaxStackHeight, setDraftMaxStackHeight] = useState(
    ouroborosSettingsDefaultsForBoard("6x6").maxStackHeight
  );
  const [draftReservesNeededToAmassWin, setDraftReservesNeededToAmassWin] =
    useState(ouroborosSettingsDefaultsForBoard("6x6").reservesNeededToAmassWin);
  const gameSettingsWasOpenRef = useRef(false);
  useEffect(() => {
    if (gameSettingsOpen && !gameSettingsWasOpenRef.current) {
      setDraftBoardSize(boardSize);
      setDraftImmediateObjectiveType(immediateObjectiveType);
      setDraftInitialReservePerColor(initialReservePerColor);
      setDraftBlackKomi(blackKomi);
      setDraftMaxStackHeight(maxStackHeight);
      setDraftReservesNeededToAmassWin(reservesNeededToAmassWin);
    }
    gameSettingsWasOpenRef.current = gameSettingsOpen;
  }, [
    gameSettingsOpen,
    boardSize,
    immediateObjectiveType,
    initialReservePerColor,
    blackKomi,
    maxStackHeight,
    reservesNeededToAmassWin,
  ]);

  const [notepad, setNotepad] = useState("");
  const [piece_reserve, setPieceReserve] = useState({
    white: ouroborosSettingsDefaultsForBoard("6x6").reserves,
    black: ouroborosSettingsDefaultsForBoard("6x6").reserves,
  });
  const [stackByCoord, setStackByCoord] = useState(
    /** @type {Record<string, OuroborosCellPiece[]>} */ ({})
  );
  const [turn, setTurn] = useState(
    /** @type {'white'|'black'} */ ("white")
  );
  const [interaction, setInteraction] = useState(
    /** @type {OuroborosInteraction | null} */ (null)
  );
  /**
   * While Gather / Scatter is in progress, moves apply here only. **End Turn** commits to
   * `stackByCoord`; Cancel discards this draft entirely.
   */
  const [draftStacks, setDraftStacks] = useState(
    /** @type {Record<string, OuroborosCellPiece[]> | null} */ (null)
  );
  const draftStacksRef = useRef(
    /** @type {Record<string, OuroborosCellPiece[]> | null} */ (null)
  );
  draftStacksRef.current = draftStacks;

  // --- End-of-turn snake marker (see `applySnakeMarkerEndOfTurn` in ouroborosLogic.js) ---

  /**
   * During Gather/Scatter, each successful lift/placement updates this to the coord whose **top**
   * is the player’s last-moved piece: Gather → `source`; Scatter → target cell. Read on
   * **End Turn** and passed to `applySnakeMarkerEndOfTurn`. Cleared on Cancel / when starting a
   * new Gather or Scatter.
   */
  const pendingSnakeTopCoordRef = useRef(/** @type {string | null} */ (null));

  /** Gathers `targets` for `Gsource-…` / `Ssource-…`; cleared on Cancel or after End Turn commits a line. */
  const draftNotationRef = useRef(
    /** @type {OuroborosDraftNotation} */ ({
      kind: null,
      source: "",
      targets: [],
    })
  );

  /**
   * One completed turn per string; `moveHistory.length` is the ply count for review.
   */
  const [moveHistory, setMoveHistory] = useState(/** @type {string[]} */ ([]));
  const [termination, setTermination] = useState(
    /** @type {null | 'resign' | 'agreed_draw' | 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win'} */ (
      null
    )
  );
  const [resignedWinner, setResignedWinner] = useState(
    /** @type {'white' | 'black' | null} */ (null)
  );
  /** Winner for natural endings (hoopsnake / road / amass / stack score); `termination` records which rule. */
  const [naturalOutcome, setNaturalOutcome] = useState(
    /** @type {'white' | 'black' | 'draw' | null} */ (null)
  );

  /**
   * When `false`, the game-over modal may show if `winner != null`. When `true`, hidden until the
   * finish-flag or the GAME END review step. On that step, `dismissGameOverModal` also exits review.
   */
  const [gameOverModalDismissed, setGameOverModalDismissed] = useState(false);

  /**
   * Gamelog review (`shared/gamelogReviewNav.js`): `null` = live play; non-null = scrub pointer
   * `{ plies, includeTermination }`. Ended games add **GAME END** → extra step with
   * `includeTermination: true`.
   */
  const [gamelogReview, setGamelogReview] = useState(
    /** @type {{ plies: number, includeTermination: boolean } | null} */ (null)
  );

  const gamelogEndRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const gamelogFileInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  /** Prevents double auto-commit when React Strict Mode runs layout effects twice on the same paint. */
  const autoCommitGatherScatterLockRef = useRef(false);

  /**
   * Snapshots before each completed turn and before resign / agreed draw (Sumo / Admirals pattern).
   * Rebuilt on **Import Game** by `replayOuroborosGameForImport`.
   */
  const [undoStack, setUndoStack] = useState(
    /** @type {OuroborosUndoSnapshot[]} */ ([])
  );

  const exitGamelogReview = useCallback(() => setGamelogReview(null), []);
  const inGamelogReview = gamelogReview != null;

  const reviewPliesClamped = useMemo(() => {
    if (!gamelogReview) return 0;
    return Math.min(
      Math.max(0, gamelogReview.plies),
      moveHistory.length
    );
  }, [gamelogReview, moveHistory.length]);

  /** Scrubber is on the **GAME END** row (last ply + `includeTermination`). */
  const atGameEndReview =
    inGamelogReview &&
    gamelogReview != null &&
    reviewPliesClamped === moveHistory.length &&
    gamelogReview.includeTermination;

  const dismissGameOverModal = useCallback(() => {
    setGameOverModalDismissed(true);
    if (atGameEndReview) exitGamelogReview();
  }, [atGameEndReview, exitGamelogReview]);

  /** All Ouroboros endings set `termination`; second arg is unused (kept for API parity with Sumo). */
  const hasGamelogTerminalStep = useMemo(
    () => gamelogReviewHasTerminalStep(termination, null),
    [termination]
  );

  const ouroReplayAtReview = useMemo(() => {
    if (!gamelogReview) return null;
    return replayOuroborosGameForImport(
      moveHistory.slice(0, reviewPliesClamped),
      null,
      boardSizeN,
      initialReservePerColor,
      maxStackHeight
    );
  }, [
    gamelogReview,
    moveHistory,
    reviewPliesClamped,
    boardSizeN,
    initialReservePerColor,
    maxStackHeight,
  ]);

  const gamelogReviewFraction = useMemo(() => {
    if (!gamelogReview) return null;
    return gamelogReviewDisplayFraction(
      gamelogReview,
      moveHistory.length,
      hasGamelogTerminalStep
    );
  }, [gamelogReview, moveHistory.length, hasGamelogTerminalStep]);

  const displayStackByCoord = ouroReplayAtReview
    ? ouroReplayAtReview.stackByCoord
    : stackByCoord;
  const displayPieceReserve = ouroReplayAtReview
    ? ouroReplayAtReview.piece_reserve
    : piece_reserve;
  const displayTurn = ouroReplayAtReview ? ouroReplayAtReview.turn : turn;

  const boardForUi = inGamelogReview
    ? displayStackByCoord
    : draftStacks ?? stackByCoord;

  const themeCss = useMemo(() => themeToCssVars(theme), [theme]);

  const winner = useMemo(() => {
    const naturalTerm =
      termination === "hoopsnake_win" ||
      termination === OUROBOROS_TERMINATION_ROAD_WIN ||
      termination === OUROBOROS_TERMINATION_AMASS_WIN ||
      termination === "stack_score_win";
    if (
      inGamelogReview &&
      gamelogReview &&
      reviewPliesClamped === moveHistory.length &&
      gamelogReview.includeTermination
    ) {
      if (termination === "agreed_draw") return /** @type {const} */ ("draw");
      if (termination === "resign" && resignedWinner) return resignedWinner;
      if (naturalTerm && naturalOutcome != null) return naturalOutcome;
    }
    if (!inGamelogReview) {
      if (termination === "agreed_draw") return /** @type {const} */ ("draw");
      if (termination === "resign" && resignedWinner) return resignedWinner;
      if (naturalTerm && naturalOutcome != null) return naturalOutcome;
    }
    return null;
  }, [
    inGamelogReview,
    gamelogReview,
    reviewPliesClamped,
    moveHistory.length,
    termination,
    resignedWinner,
    naturalOutcome,
  ]);

  /** Center column: no board input while idle, reviewing, or finished. */
  const isBoardInactive =
    !practiceSessionActive || inGamelogReview || winner != null;

  /** Practice only when not in review and not mid-match. */
  const practiceDisabled =
    inGamelogReview || (practiceSessionActive && winner == null);
  const canConfirmAiChallenge = OUROBOROS_BOT_OPTIONS.some(
    (bot) => bot.value === selectedAiBotId
  );

  /**
   * Request Draw / Resign: only after Practice → Confirm, not in review, not after a result.
   * Grouped with `practiceDisabled` / `isBoardInactive` as shared session rules.
   */
  const canRequestDrawOrResign =
    practiceSessionActive && winner == null && !inGamelogReview;

  /**
   * Hoopsnake win highlight: only for matches that ended with `hoopsnake_win`, when the board is
   * final (live win, review on last ply, or GAME END). Not shown for stack-score or road endings.
   */
  const hoopsnakeHighlightCoords = useMemo(() => {
    const atFinalBoardOfFinishedMatch =
      inGamelogReview &&
      hasGamelogTerminalStep &&
      reviewPliesClamped === moveHistory.length;
    const matchIsOverForUi =
      winner != null || atFinalBoardOfFinishedMatch;
    if (
      !matchIsOverForUi ||
      draftStacks != null ||
      termination !== "hoopsnake_win"
    ) {
      return new Set();
    }
    const stacks = inGamelogReview ? displayStackByCoord : stackByCoord;
    const hoopVariant =
      immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_MICRO_HOOP
        ? "micro"
        : immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_BIG_HOOP
          ? "big"
          : "small";
    return coordsInAnyHoopsnakeRing(stacks, boardSizeN, hoopVariant);
  }, [
    winner,
    inGamelogReview,
    hasGamelogTerminalStep,
    reviewPliesClamped,
    moveHistory.length,
    draftStacks,
    displayStackByCoord,
    stackByCoord,
    boardSizeN,
    immediateObjectiveType,
    termination,
  ]);

  /**
   * Road win highlight: cells in any winning orthogonal road (either color), only when the match
   * ended with `road_win`.
   */
  const roadWinHighlightCoords = useMemo(() => {
    const atFinalBoardOfFinishedMatch =
      inGamelogReview &&
      hasGamelogTerminalStep &&
      reviewPliesClamped === moveHistory.length;
    const matchIsOverForUi =
      winner != null || atFinalBoardOfFinishedMatch;
    if (
      !matchIsOverForUi ||
      draftStacks != null ||
      termination !== OUROBOROS_TERMINATION_ROAD_WIN
    ) {
      return new Set();
    }
    const stacks = inGamelogReview ? displayStackByCoord : stackByCoord;
    return coordsInAnyWinningRoad(stacks, boardSizeN);
  }, [
    winner,
    inGamelogReview,
    hasGamelogTerminalStep,
    reviewPliesClamped,
    moveHistory.length,
    draftStacks,
    displayStackByCoord,
    stackByCoord,
    boardSizeN,
    termination,
  ]);

  /**
   * Amass win highlight: winning color’s single orthogonal group after `amass_win`. Uses committed
   * `initialReservePerColor` + `reservesNeededToAmassWin` so replay matches live evaluation.
   */
  const amassWinHighlightCoords = useMemo(() => {
    const atFinalBoardOfFinishedMatch =
      inGamelogReview &&
      hasGamelogTerminalStep &&
      reviewPliesClamped === moveHistory.length;
    const matchIsOverForUi =
      winner != null || atFinalBoardOfFinishedMatch;
    if (
      !matchIsOverForUi ||
      draftStacks != null ||
      termination !== OUROBOROS_TERMINATION_AMASS_WIN
    ) {
      return new Set();
    }
    const stacks = inGamelogReview ? displayStackByCoord : stackByCoord;
    return coordsInWinningAmassShape(
      stacks,
      boardSizeN,
      displayPieceReserve,
      initialReservePerColor,
      reservesNeededToAmassWin
    );
  }, [
    winner,
    inGamelogReview,
    hasGamelogTerminalStep,
    reviewPliesClamped,
    moveHistory.length,
    draftStacks,
    displayStackByCoord,
    stackByCoord,
    boardSizeN,
    termination,
    displayPieceReserve,
    initialReservePerColor,
    reservesNeededToAmassWin,
  ]);

  const gamelogRounds = useMemo(
    () => ouroborosMovesToGamelogRounds(moveHistory),
    [moveHistory]
  );

  const { whiteStackScore, blackStackScore } = useMemo(() => {
    const { white, black } = countOwnedStacks(displayStackByCoord);
    return {
      whiteStackScore: white,
      blackStackScore: black + blackKomi,
    };
  }, [displayStackByCoord, blackKomi]);

  /**
   * Amass objective: remaining count for **Amass Reserves** in the HUD (floors at 0).
   * Shown in a second `hex-board-removed-hud` row under white’s reserve / above black’s.
   */
  const amassHudRemaining = useMemo(() => {
    if (immediateObjectiveType !== OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS) {
      return { white: null, black: null };
    }
    return {
      white: amassReservesNeededRemaining(
        initialReservePerColor,
        displayPieceReserve.white,
        reservesNeededToAmassWin
      ),
      black: amassReservesNeededRemaining(
        initialReservePerColor,
        displayPieceReserve.black,
        reservesNeededToAmassWin
      ),
    };
  }, [
    immediateObjectiveType,
    initialReservePerColor,
    displayPieceReserve.white,
    displayPieceReserve.black,
    reservesNeededToAmassWin,
  ]);

  /** Draft only: changing board in the modal resets other draft fields to that board’s defaults. */
  const onDraftBoardSizeChange = useCallback((nextBoardSize) => {
    const defaults = ouroborosSettingsDefaultsForBoard(nextBoardSize);
    setDraftBoardSize(nextBoardSize);
    setDraftInitialReservePerColor(defaults.reserves);
    setDraftBlackKomi(defaults.blackKomi);
    setDraftMaxStackHeight(defaults.maxStackHeight);
    setDraftImmediateObjectiveType(defaults.immediateObjectiveType);
    setDraftReservesNeededToAmassWin(defaults.reservesNeededToAmassWin);
  }, []);
  const onDraftReservesChange = useCallback((value) => {
    const n = Number.parseInt(value, 10);
    setDraftInitialReservePerColor(Number.isFinite(n) ? Math.max(1, n) : 1);
  }, []);
  const onDraftBlackKomiChange = useCallback((value) => {
    const n = Number.parseFloat(value);
    setDraftBlackKomi(Number.isFinite(n) ? Math.max(0, n) : 0);
  }, []);
  const onDraftMaxStackHeightChange = useCallback((value) => {
    const n = Number.parseInt(value, 10);
    setDraftMaxStackHeight(Number.isFinite(n) ? Math.max(2, n) : 2);
  }, []);
  /** Game Settings: **Reserves Until Amass Win Possible** numeric field (Amass objective only). */
  const onDraftReservesNeededToAmassWinChange = useCallback((value) => {
    const n = Number.parseInt(value, 10);
    setDraftReservesNeededToAmassWin(
      Number.isFinite(n) ? Math.max(1, n) : 1
    );
  }, []);

  /* New match: allow the result modal to auto-open the next time someone wins. */
  useEffect(() => {
    if (winner == null) setGameOverModalDismissed(false);
  }, [winner]);

  /* GAME END review step: show the result modal together with that row. */
  useEffect(() => {
    if (atGameEndReview) setGameOverModalDismissed(false);
  }, [atGameEndReview]);

  /* During review, hide the modal except on the GAME END step. */
  const showGameOverModal =
    winner != null &&
    !gameOverModalDismissed &&
    (!inGamelogReview || atGameEndReview);
  const canOpenGameResultPanel =
    winner != null && gameOverModalDismissed && !inGamelogReview;

  useEffect(() => {
    const sentinel = gamelogEndRef.current;
    const scroller = sentinel?.closest(".gamelog-scroll");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [moveHistory, termination, gamelogRounds.length, hasGamelogTerminalStep]);

  const squareCells = useMemo(
    () =>
      Array.from({ length: boardSizeN * boardSizeN }, (_, index) => {
        const row = Math.floor(index / boardSizeN) + 1;
        const col = (index % boardSizeN) + 1;
        const file = String.fromCharCode(96 + col);
        const rank = boardSizeN + 1 - row;
        const coord = `${file}${rank}`;
        return {
          id: `r${row}c${col}`,
          label: coord,
        };
      }),
    [boardSizeN]
  );

  /**
   * Turn actions (three abilities). Implemented:
   *
   * 1. **Placing** — empty cell: add a `blank` piece in the current player’s color, −1 reserve,
   *    then end turn (snake marker runs on the placed cell’s top — see `applySnakeMarkerEndOfTurn`).
   *
   * 2. **Gathering** — stack you control (`blank` top, your color). Range = source height when
   *    Gather starts. Move tops from other stacks in range onto yours (no snake-eye stacks as
   *    sources, gathering stack capped at the match **max stack height**). When the stack is full
 *    or no legal target remains,
   *    the draft commits and the turn ends automatically (or use **End Turn** / **Cancel**).
   *
   * 3. **Scattering** — same control/range idea; move your stack’s top onto cells in range (not
   *    full, no snake-eye in target). When the source is empty or no legal target remains, the
   *    draft commits and the turn ends automatically (or **End Turn** / **Cancel**).
   *
   * **End-of-turn marker:** after the board state for the turn is final, every `snake_head` flips
   * to `blank`, then the top piece on the cell of the last place/move becomes `snake_head`
   * (`pendingSnakeTopCoordRef` for Gather/Scatter chains).
   */
  const placeOnEmptyCell = useCallback(
    (coord) => {
      if (winner != null) return;
      if (interaction != null || draftStacks != null) return;
      const currentStack = stackByCoord[coord] ?? [];
      if (currentStack.length > 0) return;
      if (piece_reserve[turn] <= 0) return;

      const actor = turn;
      const withPiece = {
        ...stackByCoord,
        [coord]: [...(stackByCoord[coord] ?? []), normalizePiece(turn)].slice(
          0,
          maxStackHeight
        ),
      };
      const markedStacks = applySnakeMarkerEndOfTurn(withPiece, coord);
      const nextReserve = {
        ...piece_reserve,
        [turn]: Math.max(0, piece_reserve[turn] - 1),
      };
      const nextHistory = [...moveHistory, coord];
      const naturalEnd = evaluateOuroborosNaturalEndOfTurn(
        markedStacks,
        nextReserve,
        actor,
        boardSizeN,
        blackKomi,
        immediateObjectiveType,
        initialReservePerColor,
        reservesNeededToAmassWin
      );

      setUndoStack((s) => [
        ...s,
        captureOuroborosUndoSnapshot(
          stackByCoord,
          piece_reserve,
          turn,
          moveHistory,
          interaction,
          draftStacks,
          draftNotationRef.current,
          pendingSnakeTopCoordRef.current,
          termination,
          resignedWinner,
          naturalOutcome
        ),
      ]);

      setStackByCoord(markedStacks);
      setPieceReserve(nextReserve);
      setMoveHistory(nextHistory);
      if (naturalEnd) {
        setTermination(naturalEnd.termination);
        setNaturalOutcome(naturalEnd.outcome);
        setInteraction(null);
      } else {
        advanceTurn(setTurn, setInteraction);
      }
    },
    [
      winner,
      interaction,
      draftStacks,
      stackByCoord,
      piece_reserve,
      turn,
      moveHistory,
      termination,
      resignedWinner,
      naturalOutcome,
      boardSizeN,
      blackKomi,
      immediateObjectiveType,
      initialReservePerColor,
      reservesNeededToAmassWin,
      maxStackHeight,
    ]
  );

  const openStackMenu = useCallback(
    (coord) => {
      if (winner != null) return;
      if (interaction != null || draftStacks != null) return;
      if (!playerControlsStack(stackByCoord[coord], turn)) return;
      setInteraction({ kind: "menu", coord });
    },
    [interaction, draftStacks, stackByCoord, turn]
  );

  const cancelInteraction = useCallback(() => {
    setInteraction(null);
  }, []);

  /** Aborts Gather/Scatter entirely; committed `stackByCoord` unchanged. */
  const cancelFullGatherScatter = useCallback(() => {
    pendingSnakeTopCoordRef.current = null;
    draftNotationRef.current = { kind: null, source: "", targets: [] };
    draftStacksRef.current = null;
    setDraftStacks(null);
    setInteraction(null);
  }, []);

  const commitDraftAndEndTurn = useCallback(() => {
    /*
     * Undo must restore the committed board **before** this Gather/Scatter (like **Placing**).
     * Do not snapshot the live `draftStacks` / `interaction`: after a completed turn,
     * `boardForUi` prefers the draft, so restoring both would show the post-turn draft on top of
     * pre-turn `stackByCoord` — broken undo. Gamelog + import already use between-turns snapshots.
     */
    setUndoStack((s) => [
      ...s,
      captureOuroborosUndoSnapshot(
        stackByCoord,
        piece_reserve,
        turn,
        moveHistory,
        null,
        null,
        { kind: null, source: "", targets: [] },
        null,
        termination,
        resignedWinner,
        naturalOutcome
      ),
    ]);

    const d = draftStacksRef.current;
    const snakeCoord = pendingSnakeTopCoordRef.current;
    pendingSnakeTopCoordRef.current = null;

    const note = draftNotationRef.current;
    let logLine = "";
    if (note.kind === "gather" && note.source) {
      logLine =
        "G" +
        note.source +
        (note.targets.length > 0 ? "-" + note.targets.join("-") : "");
    } else if (note.kind === "scatter" && note.source) {
      logLine =
        "S" +
        note.source +
        (note.targets.length > 0 ? "-" + note.targets.join("-") : "");
    }
    draftNotationRef.current = { kind: null, source: "", targets: [] };

    const actor = turn;
    /** @type {null | { termination: 'hoopsnake_win' | 'road_win' | 'amass_win' | 'stack_score_win', outcome: 'white' | 'black' | 'draw' }} */
    let naturalEnd = null;

    if (d) {
      const next = { ...stackByCoord };
      for (const k of Object.keys(d)) {
        next[k] = d[k];
      }
      const merged =
        snakeCoord != null && snakeCoord !== ""
          ? applySnakeMarkerEndOfTurn(next, snakeCoord)
          : next;
      naturalEnd = evaluateOuroborosNaturalEndOfTurn(
        merged,
        piece_reserve,
        actor,
        boardSizeN,
        blackKomi,
        immediateObjectiveType,
        initialReservePerColor,
        reservesNeededToAmassWin
      );
      setStackByCoord(merged);
    }
    draftStacksRef.current = null;
    setDraftStacks(null);
    setInteraction(null);
    if (logLine) {
      setMoveHistory((h) => [...h, logLine]);
    }
    if (naturalEnd) {
      setTermination(naturalEnd.termination);
      setNaturalOutcome(naturalEnd.outcome);
    } else {
      setTurn((prev) => (prev === "white" ? "black" : "white"));
    }
  }, [
    stackByCoord,
    piece_reserve,
    turn,
    moveHistory,
    termination,
    resignedWinner,
    naturalOutcome,
    boardSizeN,
    blackKomi,
    immediateObjectiveType,
    initialReservePerColor,
    reservesNeededToAmassWin,
  ]);

  const requestUndo = useCallback(() => {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setStackByCoord(cloneStacksRecord(prev.stackByCoord));
      setPieceReserve({ ...prev.piece_reserve });
      setTurn(prev.turn);
      setMoveHistory([...prev.moveHistory]);
      setInteraction(cloneOuroborosInteraction(prev.interaction));
      const nextDraft = prev.draftStacks
        ? cloneStacksRecord(prev.draftStacks)
        : null;
      draftStacksRef.current = nextDraft;
      setDraftStacks(nextDraft);
      draftNotationRef.current = {
        kind: prev.draftNotation.kind,
        source: prev.draftNotation.source,
        targets: [...prev.draftNotation.targets],
      };
      pendingSnakeTopCoordRef.current = prev.pendingSnakeTopCoord;
      setTermination(prev.termination ?? null);
      setResignedWinner(prev.resignedWinner ?? null);
      setNaturalOutcome(prev.naturalOutcome ?? null);
      return s.slice(0, -1);
    });
  }, []);

  const startGather = useCallback(() => {
    if (interaction?.kind !== "menu") return;
    const coord = interaction.coord;
    if (!gatherEnabledForMenu(coord, stackByCoord, boardSizeN, maxStackHeight))
      return;
    pendingSnakeTopCoordRef.current = null;
    draftNotationRef.current = { kind: "gather", source: coord, targets: [] };
    const range = (stackByCoord[coord] ?? []).length;
    const draft = cloneStacksRecord(stackByCoord);
    setDraftStacks(draft);
    setInteraction({ kind: "gather_pick", source: coord, range });
  }, [interaction, stackByCoord, boardSizeN, maxStackHeight]);

  const startScatter = useCallback(() => {
    if (interaction?.kind !== "menu") return;
    const coord = interaction.coord;
    if (!scatterEnabledForMenu(coord, stackByCoord, boardSizeN, maxStackHeight))
      return;
    pendingSnakeTopCoordRef.current = null;
    draftNotationRef.current = { kind: "scatter", source: coord, targets: [] };
    const range = (stackByCoord[coord] ?? []).length;
    const draft = cloneStacksRecord(stackByCoord);
    setDraftStacks(draft);
    setInteraction({ kind: "scatter_pick", source: coord, range });
  }, [interaction, stackByCoord, boardSizeN, maxStackHeight]);

  const applyGatherMove = useCallback(
    (targetCoord) => {
      if (interaction?.kind !== "gather_pick" || draftStacks == null) return;
      const { source, range } = interaction;
      if (
        !isGatherTarget(
          targetCoord,
          source,
          draftStacks,
          range,
          boardSizeN,
          maxStackHeight
        )
      )
        return;

      pendingSnakeTopCoordRef.current = source;
      draftNotationRef.current.targets.push(targetCoord);

      setDraftStacks((prev) => {
        if (!prev) return prev;
        const src = [...(prev[source] ?? [])];
        if (src.length >= maxStackHeight) return prev;
        const tgt = [...(prev[targetCoord] ?? [])];
        if (tgt.length === 0) return prev;
        const lifted = tgt.pop();
        if (!lifted) return prev;
        src.push(lifted);
        return { ...prev, [source]: src, [targetCoord]: tgt };
      });
      setInteraction({ kind: "gather_pick", source, range });
    },
    [interaction, draftStacks, boardSizeN, maxStackHeight]
  );

  const applyScatterMove = useCallback(
    (targetCoord) => {
      if (interaction?.kind !== "scatter_pick" || draftStacks == null) return;
      const { source, range } = interaction;
      if (
        !isScatterTarget(
          targetCoord,
          source,
          draftStacks,
          range,
          boardSizeN,
          maxStackHeight
        )
      )
        return;

      pendingSnakeTopCoordRef.current = targetCoord;
      draftNotationRef.current.targets.push(targetCoord);

      setDraftStacks((prev) => {
        if (!prev) return prev;
        const src = [...(prev[source] ?? [])];
        if (src.length === 0) return prev;
        const tgt = [...(prev[targetCoord] ?? [])];
        const lifted = src.pop();
        if (!lifted) return prev;
        tgt.push(lifted);
        return { ...prev, [source]: src, [targetCoord]: tgt };
      });
      setInteraction({ kind: "scatter_pick", source, range });
    },
    [interaction, draftStacks, boardSizeN, maxStackHeight]
  );

  const resign = useCallback(() => {
    if (!practiceSessionActive) return;
    if (winner != null) return;
    setUndoStack((s) => [
      ...s,
      captureOuroborosUndoSnapshot(
        stackByCoord,
        piece_reserve,
        turn,
        moveHistory,
        interaction,
        draftStacks,
        draftNotationRef.current,
        pendingSnakeTopCoordRef.current,
        termination,
        resignedWinner,
        naturalOutcome
      ),
    ]);
    pendingSnakeTopCoordRef.current = null;
    draftNotationRef.current = { kind: null, source: "", targets: [] };
    draftStacksRef.current = null;
    setDraftStacks(null);
    setInteraction(null);
    setNaturalOutcome(null);
    setResignedWinner(turn === "white" ? "black" : "white");
    setTermination("resign");
  }, [
    winner,
    stackByCoord,
    piece_reserve,
    turn,
    moveHistory,
    interaction,
    draftStacks,
    termination,
    resignedWinner,
    naturalOutcome,
    practiceSessionActive,
  ]);

  const agreedDraw = useCallback(() => {
    if (!practiceSessionActive) return;
    if (winner != null) return;
    setUndoStack((s) => [
      ...s,
      captureOuroborosUndoSnapshot(
        stackByCoord,
        piece_reserve,
        turn,
        moveHistory,
        interaction,
        draftStacks,
        draftNotationRef.current,
        pendingSnakeTopCoordRef.current,
        termination,
        resignedWinner,
        naturalOutcome
      ),
    ]);
    pendingSnakeTopCoordRef.current = null;
    draftNotationRef.current = { kind: null, source: "", targets: [] };
    draftStacksRef.current = null;
    setDraftStacks(null);
    setInteraction(null);
    setNaturalOutcome(null);
    setTermination("agreed_draw");
  }, [
    winner,
    stackByCoord,
    piece_reserve,
    turn,
    moveHistory,
    interaction,
    draftStacks,
    termination,
    resignedWinner,
    naturalOutcome,
    practiceSessionActive,
  ]);

  /**
   * Empty board and full reserves. Pass `initialReservePerColor` when applying Game Settings so
   * reserves match draft values before React has committed `setInitialReservePerColor`.
   * @param {{ initialReservePerColor?: number }} [opts]
   */
  const newGame = useCallback((opts) => {
    const reserve =
      opts?.initialReservePerColor ?? initialReservePerColor;
    pendingSnakeTopCoordRef.current = null;
    draftNotationRef.current = { kind: null, source: "", targets: [] };
    draftStacksRef.current = null;
    setStackByCoord({});
    setPieceReserve({
      white: reserve,
      black: reserve,
    });
    setTurn("white");
    setInteraction(null);
    setDraftStacks(null);
    setMoveHistory([]);
    setTermination(null);
    setResignedWinner(null);
    setNaturalOutcome(null);
    setUndoStack([]);
    setGameOverModalDismissed(false);
    setGamelogReview(null);
  }, [initialReservePerColor]);

  const downloadGamelog = useCallback(() => {
    /** @type {null | 'white' | 'black' | 'draw'} */
    let exportWinner = null;
    if (termination === "resign") exportWinner = resignedWinner;
    else if (
      termination === "hoopsnake_win" ||
      termination === OUROBOROS_TERMINATION_ROAD_WIN ||
      termination === OUROBOROS_TERMINATION_AMASS_WIN ||
      termination === "stack_score_win"
    ) {
      exportWinner = naturalOutcome;
    }
    const json = serializeOuroborosGamelog(
      moveHistory,
      termination,
      exportWinner,
      {
        boardSize: boardSizeN,
        immediateObjectiveType,
        initialReservePerColor,
        blackKomi,
        maxStackHeight,
        reservesNeededToAmassWin,
      }
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.gamelogFilePrefix}-gamelog-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    moveHistory,
    termination,
    resignedWinner,
    naturalOutcome,
    config.gamelogFilePrefix,
    boardSizeN,
    immediateObjectiveType,
    initialReservePerColor,
    blackKomi,
    maxStackHeight,
    reservesNeededToAmassWin,
  ]);

  const triggerGamelogImport = useCallback(() => {
    gamelogFileInputRef.current?.click();
  }, []);

  const onGamelogFilePicked = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = typeof reader.result === "string" ? reader.result : "";
          const {
            moves,
            termination: importedTermination,
            winner: importedWinner,
            boardSize: importedBoardSize,
            immediateObjectiveType: importedImmediateObjectiveType,
            initialReservePerColor: importedInitialReservePerColor,
            blackKomi: importedBlackKomi,
            maxStackHeight: importedMaxStackHeight,
            reservesNeededToAmassWin: importedReservesNeededToAmassWin,
          } = parseOuroborosGamelogJson(text);
          const importedBoardKey = ouroborosBoardKeyFromSize(importedBoardSize);
          if (!OUROBOROS_BOARD_SIZE_CONFIG[importedBoardKey]) {
            throw new Error(
              `Unsupported Ouroboros board size in gamelog: ${importedBoardSize}x${importedBoardSize}.`
            );
          }
          setBoardSize(importedBoardKey);
          setImmediateObjectiveType(importedImmediateObjectiveType);
          setInitialReservePerColor(importedInitialReservePerColor);
          setBlackKomi(importedBlackKomi);
          setMaxStackHeight(importedMaxStackHeight);
          setReservesNeededToAmassWin(importedReservesNeededToAmassWin);
          const replayed = replayOuroborosGameForImport(
            moves,
            importedTermination,
            importedBoardSize,
            importedInitialReservePerColor,
            importedMaxStackHeight
          );
          pendingSnakeTopCoordRef.current = null;
          draftNotationRef.current = { kind: null, source: "", targets: [] };
          draftStacksRef.current = null;
          setStackByCoord(replayed.stackByCoord);
          setPieceReserve(replayed.piece_reserve);
          setTurn(replayed.turn);
          setMoveHistory(replayed.moveHistory);
          setUndoStack(replayed.undoStack);
          setInteraction(null);
          setDraftStacks(null);
          setResignedWinner(null);
          setNaturalOutcome(null);
          setTermination(null);
          setGameOverModalDismissed(false);
          setGamelogReview(null);
          setPracticeSessionActive(true);
          if (importedTermination === "resign") {
            setResignedWinner(
              importedWinner === "white" || importedWinner === "black"
                ? importedWinner
                : replayed.turn === "white"
                  ? "black"
                  : "white"
            );
            setTermination("resign");
          } else if (importedTermination === "agreed_draw") {
            setTermination("agreed_draw");
          } else if (
            importedTermination === "hoopsnake_win" ||
            importedTermination === OUROBOROS_TERMINATION_ROAD_WIN ||
            importedTermination === OUROBOROS_TERMINATION_AMASS_WIN ||
            importedTermination === "stack_score_win"
          ) {
            setTermination(importedTermination);
            if (
              importedWinner === "white" ||
              importedWinner === "black" ||
              importedWinner === "draw"
            ) {
              setNaturalOutcome(importedWinner);
            }
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Could not import gamelog.";
          window.alert(msg);
        }
      };
      reader.readAsText(file);
    },
    []
  );

  const menuCoord = interaction?.kind === "menu" ? interaction.coord : null;
  const gatherOk =
    menuCoord != null &&
    gatherEnabledForMenu(menuCoord, stackByCoord, boardSizeN, maxStackHeight);
  const scatterOk =
    menuCoord != null &&
    scatterEnabledForMenu(menuCoord, stackByCoord, boardSizeN, maxStackHeight);

  /**
   * When Gather/Scatter has no legal next step, commit the draft and end the turn (same as **End
   * Turn**). Runs in `useLayoutEffect` so the board never paints an intermediate “stuck” state.
   */
  /* Auto-commit stuck Gather/Scatter drafts; skip when not in an active practice session. */
  useLayoutEffect(() => {
    if (
      gamelogReview != null ||
      draftStacks == null ||
      winner != null ||
      !practiceSessionActive
    ) {
      autoCommitGatherScatterLockRef.current = false;
      return;
    }
    const stuckGather =
      interaction?.kind === "gather_pick" &&
      !gatherHasValidTarget(
        interaction.source,
        boardForUi,
        interaction.range,
        boardSizeN,
        maxStackHeight
      );
    const stuckScatter =
      interaction?.kind === "scatter_pick" &&
      !scatterHasValidTarget(
        interaction.source,
        boardForUi,
        interaction.range,
        boardSizeN,
        maxStackHeight
      );
    if (!stuckGather && !stuckScatter) {
      autoCommitGatherScatterLockRef.current = false;
      return;
    }
    if (autoCommitGatherScatterLockRef.current) return;
    autoCommitGatherScatterLockRef.current = true;
    commitDraftAndEndTurn();
  }, [
    draftStacks,
    interaction,
    boardForUi,
    winner,
    commitDraftAndEndTurn,
    gamelogReview,
    practiceSessionActive,
    boardSizeN,
    maxStackHeight,
  ]);

  function cellHighlightClass(label) {
    if (interaction?.kind === "gather_pick") {
      return isGatherTarget(
        label,
        interaction.source,
        boardForUi,
        interaction.range,
        boardSizeN,
        maxStackHeight
      )
        ? " ouroboros-square-cell--target"
        : "";
    }
    if (interaction?.kind === "scatter_pick") {
      return isScatterTarget(
        label,
        interaction.source,
        boardForUi,
        interaction.range,
        boardSizeN,
        maxStackHeight
      )
        ? " ouroboros-square-cell--target"
        : "";
    }
    return "";
  }

  function onCellClick(label) {
    if (gamelogReview != null) return;
    if (!practiceSessionActive) return;
    if (winner != null) return;
    if (interaction == null) {
      const st = stackByCoord[label] ?? [];
      if (st.length === 0) placeOnEmptyCell(label);
      else openStackMenu(label);
      return;
    }
    if (interaction.kind === "menu") return;
    if (interaction.kind === "gather_pick") {
      applyGatherMove(label);
      return;
    }
    if (interaction.kind === "scatter_pick") {
      applyScatterMove(label);
      return;
    }
  }

  /** Game Settings → Confirm: apply draft settings, empty board, full reserves, allow play. */
  const confirmPracticeSettings = useCallback(() => {
    setBoardSize(draftBoardSize);
    setImmediateObjectiveType(draftImmediateObjectiveType);
    setInitialReservePerColor(draftInitialReservePerColor);
    setBlackKomi(draftBlackKomi);
    setMaxStackHeight(draftMaxStackHeight);
    setReservesNeededToAmassWin(draftReservesNeededToAmassWin);
    newGame({ initialReservePerColor: draftInitialReservePerColor });
    setPracticeSessionActive(true);
    setGameSettingsOpen(false);
  }, [
    newGame,
    draftBoardSize,
    draftImmediateObjectiveType,
    draftInitialReservePerColor,
    draftBlackKomi,
    draftMaxStackHeight,
    draftReservesNeededToAmassWin,
  ]);
  const confirmAiChallenge = useCallback(() => {
    if (!canConfirmAiChallenge) return;
    setChallengeAiOpen(false);
  }, [canConfirmAiChallenge]);

  return (
    <div
      className={
        "app-root app-root--game-viewport-lock" +
        (winner != null && !inGamelogReview ? " app-root--game-over" : "")
      }
      style={themeCss}
    >
      <header className="site site--full-bleed">
        <div className="site-header-start">
          <div className="brand-mega">
            <NavLink
              to={config.path}
              end
              className={({ isActive }) =>
                "brand-logo" + (isActive ? " brand-logo--active" : "")
              }
              aria-label={config.ariaLabel}
            >
              {config.brandMarkType === "emoji" ? (
                <span className="logo-emoji" aria-hidden="true">
                  {config.brandEmoji}
                </span>
              ) : (
                <span className="logo-mark" aria-hidden="true" />
              )}
              <span className="logo-wordmark">{config.wordmark}</span>
            </NavLink>
            <div
              className="brand-game-picker-wrap"
              role="group"
              aria-label="Games on this site"
            >
              <ul className="brand-game-picker">
                {SITE_GAMES.map((g) => (
                  <li key={g.id}>
                    <NavLink
                      to={g.path}
                      end
                      className={({ isActive }) =>
                        "brand-game-picker-link" +
                        (isActive ? " brand-game-picker-link--active" : "")
                      }
                    >
                      {g.listIconType === "emoji" ? (
                        <span className="brand-game-picker-emoji" aria-hidden="true">
                          {g.listIconEmoji}
                        </span>
                      ) : (
                        <span className="brand-game-picker-dot" aria-hidden="true" />
                      )}
                      <span className="brand-game-picker-name">{g.listName}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <SiteHomepageLink />
        </div>
        <SiteTopNav onOpenSettings={() => setThemeOpen(true)} />
      </header>

      <div className="game-play-area">
        <div className="layout layout--triple layout--dock">
          <aside
            className="side-panel side-panel--left panel"
            aria-label="Move log and actions"
          >
            <div className="side-action-buttons" role="group" aria-label="Game actions">
              <button
                type="button"
                className="btn-side"
                onClick={requestUndo}
                disabled={undoStack.length === 0 || inGamelogReview}
                title={
                  inGamelogReview
                    ? "Exit gamelog review to undo"
                    : undoStack.length === 0
                      ? "Nothing to undo yet"
                      : "Undo last completed turn, or clear Agree draw / Resign"
                }
              >
                Request Undo
              </button>
              <button
                type="button"
                className="btn-side"
                onClick={agreedDraw}
                disabled={!canRequestDrawOrResign}
                title={
                  inGamelogReview
                    ? "Exit gamelog review first"
                    : !practiceSessionActive
                      ? "Start a practice game first (Practice → Confirm)"
                      : winner != null
                        ? "Game already over"
                        : "Declare a draw by agreement — allowed before the first move"
                }
              >
                Request Draw
              </button>
              <button
                type="button"
                className="btn-side"
                onClick={resign}
                disabled={!canRequestDrawOrResign}
                title={
                  inGamelogReview
                    ? "Exit gamelog review first"
                    : !practiceSessionActive
                      ? "Start a practice game first (Practice → Confirm)"
                      : winner != null
                        ? "Game already over"
                        : "Resign — opponent wins — allowed before the first move"
                }
              >
                Resign
              </button>
            </div>

            <div className="gamelog-block panel-inset">
              <h3 className="side-panel-heading">Gamelog</h3>
              {inGamelogReview && gamelogReview && gamelogReviewFraction ? (
                <div className="gamelog-review-banner" role="status">
                  <div className="gamelog-review-banner-row">
                    <span>
                      Review Ply: {gamelogReviewFraction.num}/
                      {gamelogReviewFraction.den}
                    </span>
                    <button
                      type="button"
                      className="btn-side"
                      onClick={exitGamelogReview}
                    >
                      Exit review
                    </button>
                  </div>
                  <GamelogReviewNav
                    totalPlies={moveHistory.length}
                    hasTerminalStep={hasGamelogTerminalStep}
                    review={gamelogReview}
                    onSetReview={setGamelogReview}
                  />
                </div>
              ) : null}
              <div
                className="gamelog-scroll mono"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Move history"
              >
                {gamelogRounds.length === 0 && !hasGamelogTerminalStep ? (
                  <p className="gamelog-empty">No moves yet.</p>
                ) : (
                  <>
                    {gamelogRounds.length > 0 ? (
                      <ol className="gamelog-list gamelog-list--by-turn">
                        {gamelogRounds.map((r, i) => {
                          /* `i + 1` = full turn (white + black lines), not one ply. */
                          const turnNum = i + 1;
                          const pliesAfterWhite = 2 * i + 1;
                          const pliesAfterBlack =
                            r.black != null ? 2 * i + 2 : null;
                          const dis =
                            draftStacks != null || interaction != null;
                          const hiWhite =
                            inGamelogReview &&
                            reviewPliesClamped === pliesAfterWhite &&
                            !gamelogReview?.includeTermination;
                          const hiBlack =
                            pliesAfterBlack != null &&
                            inGamelogReview &&
                            reviewPliesClamped === pliesAfterBlack &&
                            !gamelogReview?.includeTermination;
                          return (
                            <li
                              key={i}
                              className="gamelog-line gamelog-line--with-ply"
                            >
                              <span className="gamelog-turn-num">
                                {turnNum}.{" "}
                              </span>
                              <button
                                type="button"
                                className={
                                  "gamelog-ply-btn" +
                                  (hiWhite ? " gamelog-ply-btn--active" : "")
                                }
                                disabled={dis}
                                onClick={() =>
                                  setGamelogReview({
                                    plies: pliesAfterWhite,
                                    includeTermination: false,
                                  })
                                }
                              >
                                {r.white}
                              </button>
                              {r.black != null ? (
                                <>
                                  <span
                                    className="gamelog-ply-comma"
                                    aria-hidden="true"
                                  >
                                    ,
                                  </span>{" "}
                                  <button
                                    type="button"
                                    className={
                                      "gamelog-ply-btn" +
                                      (hiBlack
                                        ? " gamelog-ply-btn--active"
                                        : "")
                                    }
                                    disabled={dis}
                                    onClick={() =>
                                      setGamelogReview({
                                        plies: pliesAfterBlack,
                                        includeTermination: false,
                                      })
                                    }
                                  >
                                    {r.black}
                                  </button>
                                </>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                    {hasGamelogTerminalStep ? (
                      <button
                        type="button"
                        className={
                          "gamelog-terminal gamelog-terminal--btn" +
                          (inGamelogReview &&
                          reviewPliesClamped === moveHistory.length &&
                          gamelogReview?.includeTermination
                            ? " gamelog-ply-btn--active"
                            : "")
                        }
                        disabled={
                          draftStacks != null || interaction != null
                        }
                        onClick={() =>
                          setGamelogReview({
                            plies: moveHistory.length,
                            includeTermination: true,
                          })
                        }
                      >
                        GAME END
                      </button>
                    ) : null}
                  </>
                )}
                <div ref={gamelogEndRef} aria-hidden="true" />
              </div>
              <div className="gamelog-io-buttons" role="group" aria-label="Game file">
                <button type="button" className="btn-side" onClick={downloadGamelog}>
                  Download Game
                </button>
                <button type="button" className="btn-side" onClick={triggerGamelogImport}>
                  Import Game
                </button>
                <input
                  ref={gamelogFileInputRef}
                  type="file"
                  className="visually-hidden"
                  accept="application/json,.json"
                  onChange={onGamelogFilePicked}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </div>
            </div>
          </aside>

          {/*
            `board-wrap--inactive` + shade: no board input until Practice, while reviewing, or after
            outcome (`index.css`).
          */}
          <section
            className={
              "board-wrap board-wrap--center board-wrap--stacked" +
              (inGamelogReview ? " board-wrap--gamelog-review" : "") +
              (isBoardInactive ? " board-wrap--inactive" : "")
            }
            aria-label="Ouroboros board"
          >
            <div
              className={
                "player-game-bar ouroboros-player-game-bar player-game-bar--white" +
                (displayTurn === "white" && winner == null
                  ? " player-game-bar--active"
                  : "")
              }
              role="group"
              aria-label={
                "White — stack score " +
                whiteStackScore +
                ". Time " +
                CLOCK_INFINITE_DISPLAY +
                " (no limit)."
              }
            >
              <div className="player-game-bar-identity">
                <span
                  className="player-game-piece player-game-piece--white"
                  aria-hidden="true"
                />
                <span className="player-game-name">White</span>
              </div>
              <div className="player-game-bar-stats">
                <span className="player-game-score-line mono">
                  Stack Score: {whiteStackScore}
                </span>
                <span
                  className="player-game-clock mono"
                  aria-label="Time remaining (unlimited placeholder)"
                >
                  {CLOCK_INFINITE_DISPLAY}
                </span>
              </div>
            </div>

            <div className="board-stage-inner">
              <div className="board-corner-actions" role="toolbar" aria-label="Board tools">
                <button
                  type="button"
                  className="board-floating-icon-btn board-game-result-btn"
                  disabled={!canOpenGameResultPanel}
                  onClick={() => setGameOverModalDismissed(false)}
                  aria-label="Show game result"
                  title={
                    canOpenGameResultPanel
                      ? "Show game result"
                      : winner != null
                        ? "Result panel is already open"
                        : "Available when the game has ended"
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" x2="4" y1="22" y2="15" />
                  </svg>
                </button>
              </div>

              <div
                className={
                  "ouroboros-board-stage" +
                  (immediateObjectiveType === OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS
                    ? " ouroboros-board-stage--amass-hud"
                    : "")
                }
              >
                {/* White reserve + optional Amass: stacked; same `hex-board-removed-hud` chrome as Sumo. */}
                <div className="ouroboros-reserve-stack ouroboros-reserve-stack--top">
                  <div
                    className="hex-board-removed-hud"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="hex-board-removed-label">Pieces in Reserve:</span>
                    <span
                      className="ouroboros-reserve-pip ouroboros-reserve-pip--white"
                      aria-hidden="true"
                    />
                    <span className="hex-board-removed-count mono">
                      ×{displayPieceReserve.white}
                    </span>
                  </div>
                  {amassHudRemaining.white != null ? (
                    <div
                      className="hex-board-removed-hud"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="hex-board-removed-label">
                        Amass Reserves:
                      </span>
                      <span
                        className="ouroboros-reserve-pip ouroboros-reserve-pip--white"
                        aria-hidden="true"
                      />
                      <span className="hex-board-removed-count mono">
                        ×{amassHudRemaining.white}
                      </span>
                    </div>
                  ) : null}
                </div>
                {draftStacks != null && gamelogReview == null ? (
                  <div
                    className="ouroboros-draft-toolbar"
                    role="toolbar"
                    aria-label="Gather or Scatter — cancel, end turn, or auto-ends when no moves remain"
                  >
                    <button
                      type="button"
                      className="btn-side ouroboros-draft-toolbar-btn"
                      onClick={cancelFullGatherScatter}
                      title="Discard Gather/Scatter and restore the board to before this action"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-side ouroboros-draft-toolbar-btn"
                      onClick={commitDraftAndEndTurn}
                      title="Commit this Gather/Scatter and pass the turn"
                    >
                      End Turn
                    </button>
                  </div>
                ) : null}
                <div className="ouroboros-square-grid-wrap">
                  <div
                    className="ouroboros-square-grid"
                    role="grid"
                    aria-label={`${boardSizeN} by ${boardSizeN} square grid`}
                    style={{ "--ouroboros-board-size": boardSizeN }}
                  >
                    {squareCells.map((cell) => (
                      <button
                        key={cell.id}
                        type="button"
                        className={
                          "ouroboros-square-cell" + cellHighlightClass(cell.label)
                        }
                        role="gridcell"
                        aria-label={`Square ${cell.label}`}
                        onClick={() => onCellClick(cell.label)}
                      >
                        {hoopsnakeHighlightCoords.has(cell.label) ||
                        roadWinHighlightCoords.has(cell.label) ||
                        amassWinHighlightCoords.has(cell.label) ? (
                          <span
                            className="ouroboros-hoopsnake-cell-highlight"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="ouroboros-stack-layer" aria-hidden="true">
                          {(boardForUi[cell.label] ?? []).map((piece, index, stack) => (
                            <span
                              key={`${cell.id}-${index}-${piece.color}-${piece.face}`}
                              className={`ouroboros-piece ouroboros-piece--${piece.color}`}
                              style={{
                                bottom: `${computeLayerBottomOffsets(stack.length, maxStackHeight)[index]}%`,
                              }}
                            >
                              {piece.face === "snake_head" ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  className={`ouroboros-piece-face-mark ouroboros-piece-face-mark--${piece.color}`}
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M2.8 12c2.1-3.2 5.5-5.2 9.2-5.2s7.1 2 9.2 5.2c-2.1 3.2-5.5 5.2-9.2 5.2S4.9 15.2 2.8 12Z"
                                    fill="none"
                                  />
                                  <path d="M12 8.2c1.3 0 2.2 1.6 2.2 3.8s-.9 3.8-2.2 3.8-2.2-1.6-2.2-3.8.9-3.8 2.2-3.8Z" />
                                </svg>
                              ) : null}
                            </span>
                          ))}
                        </span>
                        <span className="ouroboros-square-coord" aria-hidden="true">
                          {cell.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Black Amass above black reserve (column order); same HUD styling as white. */}
                <div className="ouroboros-reserve-stack ouroboros-reserve-stack--bottom">
                  {amassHudRemaining.black != null ? (
                    <div
                      className="hex-board-removed-hud"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="hex-board-removed-label">
                        Amass Reserves:
                      </span>
                      <span
                        className="ouroboros-reserve-pip ouroboros-reserve-pip--black"
                        aria-hidden="true"
                      />
                      <span className="hex-board-removed-count mono">
                        ×{amassHudRemaining.black}
                      </span>
                    </div>
                  ) : null}
                  <div
                    className="hex-board-removed-hud"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="hex-board-removed-label">Pieces in Reserve:</span>
                    <span
                      className="ouroboros-reserve-pip ouroboros-reserve-pip--black"
                      aria-hidden="true"
                    />
                    <span className="hex-board-removed-count mono">
                      ×{displayPieceReserve.black}
                    </span>
                  </div>
                </div>
                <p className="hex-legend">{boardSizeConfig.caption}</p>

                {interaction?.kind === "menu" ? (
                  <div
                    className="ouroboros-overlay"
                    role="presentation"
                    onClick={cancelInteraction}
                  >
                    <div
                      className="ouroboros-action-menu"
                      role="dialog"
                      aria-label="Gather or Scatter"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="ouroboros-action-btn"
                        disabled={!gatherOk}
                        title={
                          gatherOk
                            ? "Gather — pull a top piece from a stack in range"
                            : "No valid gather targets in range, or stack is full"
                        }
                        aria-label="Gather"
                        onClick={startGather}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M5 12h5" />
                          <path d="M10 12l-2-2M10 12l-2 2" />
                          <path d="M19 12h-5" />
                          <path d="M14 12l2-2M14 12l2 2" />
                        </svg>
                        <span className="ouroboros-action-btn-label">Gather</span>
                      </button>
                      <button
                        type="button"
                        className="ouroboros-action-btn"
                        disabled={!scatterOk}
                        title={
                          scatterOk
                            ? "Scatter — place your top piece on a cell in range"
                            : "No valid scatter targets in range, or nothing to scatter"
                        }
                        aria-label="Scatter"
                        onClick={startScatter}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 12H6" />
                          <path d="M6 12l2-2M6 12l2 2" />
                          <path d="M12 12h6" />
                          <path d="M18 12l-2-2M18 12l-2 2" />
                        </svg>
                        <span className="ouroboros-action-btn-label">Scatter</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={
                "player-game-bar ouroboros-player-game-bar player-game-bar--black" +
                (displayTurn === "black" && winner == null
                  ? " player-game-bar--active"
                  : "")
              }
              role="group"
              aria-label={
                "Black — stack score " +
                blackStackScore.toFixed(1) +
                ouroborosKomiScoreSuffix(blackKomi) +
                ". Time " +
                CLOCK_INFINITE_DISPLAY +
                " (no limit)."
              }
            >
              <div className="player-game-bar-identity">
                <span
                  className="player-game-piece player-game-piece--black"
                  aria-hidden="true"
                />
                <span className="player-game-name">Black</span>
              </div>
              <div className="player-game-bar-stats">
                <span className="player-game-score-line mono">
                  Stack Score: {blackStackScore.toFixed(1)}
                  {ouroborosKomiScoreSuffix(blackKomi)}
                </span>
                <span
                  className="player-game-clock mono"
                  aria-label="Time remaining (unlimited placeholder)"
                >
                  {CLOCK_INFINITE_DISPLAY}
                </span>
              </div>
            </div>
            {isBoardInactive ? (
              <div className="board-wrap-inactive-shade" aria-hidden="true" />
            ) : null}
          </section>

          <aside className="side-panel side-panel--right panel" aria-label="Game actions and notes">
            <div className="new-game-block panel-inset">
              <h3 className="side-panel-heading">Game</h3>
              <div className="game-mode-buttons">
                <button
                  type="button"
                  className="primary"
                  onClick={() => setGameSettingsOpen(true)}
                  disabled={practiceDisabled}
                  title={
                    practiceDisabled
                      ? inGamelogReview
                        ? "Exit gamelog review first"
                        : "Finish or end the current game first"
                      : "Open Game Settings"
                  }
                >
                  Practice
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setChallengeAiOpen(true)}
                  title="Configure a bot opponent"
                >
                  Challenge AI
                </button>
              </div>
            </div>
            <div className="notepad-block panel-inset">
              <label
                htmlFor={`notepad-${config.id}`}
                className="side-panel-heading notepad-label"
              >
                Notepad
              </label>
              <textarea
                id={`notepad-${config.id}`}
                className="notepad-input"
                value={notepad}
                onChange={(e) => setNotepad(e.target.value)}
                placeholder="Note ideas here temporarily."
                spellCheck="true"
                rows={10}
              />
            </div>
            <p className="meta meta--side">{config.rulesFooter}</p>
          </aside>
        </div>
      </div>

      {showGameOverModal ? (
        <div
          className="game-over-modal-backdrop"
          aria-hidden="false"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) dismissGameOverModal();
          }}
        >
          <div
            className="game-over-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ouroboros-game-over-modal-title"
            aria-describedby="ouroboros-game-over-modal-kicker"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="game-over-modal-close"
              onClick={dismissGameOverModal}
              aria-label="Close result panel"
              title="Close"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <p
              id="ouroboros-game-over-modal-kicker"
              className="game-over-modal-kicker"
            >
              {gameOverModalKicker(termination)}
            </p>
            <p
              id="ouroboros-game-over-modal-title"
              className="game-over-modal-title"
            >
              {winner === "draw"
                ? "Draw"
                : winner === "white"
                  ? "White wins"
                  : "Black wins"}
            </p>
          </div>
        </div>
      ) : null}

      <GameSettingsModal
        open={gameSettingsOpen}
        onClose={() => setGameSettingsOpen(false)}
        onConfirm={confirmPracticeSettings}
        titleId="ouroboros-game-settings-title"
        boardSizeOptions={OUROBOROS_BOARD_SIZE_OPTIONS}
        boardSizeValue={draftBoardSize}
        onBoardSizeChange={onDraftBoardSizeChange}
      >
        <OuroborosSettingsFields
          idPrefix="ouroboros-game-settings"
          immediateObjectiveType={draftImmediateObjectiveType}
          onImmediateObjectiveTypeChange={(v) => {
            setDraftImmediateObjectiveType(v);
            if (v === OUROBOROS_IMMEDIATE_OBJECTIVE_AMASS) {
              setDraftReservesNeededToAmassWin(
                ouroborosSettingsDefaultsForBoard(draftBoardSize)
                  .reservesNeededToAmassWin
              );
            }
          }}
          reservesNeededToAmassWin={draftReservesNeededToAmassWin}
          onReservesNeededToAmassWinChange={onDraftReservesNeededToAmassWinChange}
          initialReservePerColor={draftInitialReservePerColor}
          onInitialReservePerColorChange={onDraftReservesChange}
          blackKomi={draftBlackKomi}
          onBlackKomiChange={onDraftBlackKomiChange}
          maxStackHeight={draftMaxStackHeight}
          onMaxStackHeightChange={onDraftMaxStackHeightChange}
        />
      </GameSettingsModal>

      <ChallengeAiModal
        open={challengeAiOpen}
        onClose={() => setChallengeAiOpen(false)}
        onConfirm={confirmAiChallenge}
        botOptions={OUROBOROS_BOT_OPTIONS}
        botValue={selectedAiBotId}
        onBotChange={setSelectedAiBotId}
        canConfirm={canConfirmAiChallenge}
        boardSizeOptions={OUROBOROS_BOARD_SIZE_OPTIONS}
        boardSizeValue={OUROBOROS_BOARD_SIZE_OPTIONS[1]?.value ?? ""}
        titleId="ouroboros-challenge-ai-title"
      >
        <OuroborosSettingsFields
          idPrefix="ouroboros-challenge-ai"
          immediateObjectiveType={aiDefaults.immediateObjectiveType}
          onImmediateObjectiveTypeChange={() => {}}
          reservesNeededToAmassWin={aiDefaults.reservesNeededToAmassWin}
          onReservesNeededToAmassWinChange={() => {}}
          initialReservePerColor={aiDefaults.reserves}
          onInitialReservePerColorChange={() => {}}
          blackKomi={aiDefaults.blackKomi}
          onBlackKomiChange={() => {}}
          maxStackHeight={aiDefaults.maxStackHeight}
          onMaxStackHeightChange={() => {}}
          disabled
        />
      </ChallengeAiModal>

      <ThemeSettingsModal
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        theme={theme}
        setTheme={setTheme}
      />
    </div>
  );
}
