/**
 * Sumo match shell: layout, local state, theming, `SumoHexBoard`.
 *
 * **Styles:** `SumoGameShell.css` (Sumo-only hex accents, pins, score aids); shared chrome in `index.css`.
 *
 * **Side actions (left column):** **Request Undo** steps back through completed placements and can
 * remove an **Agree draw** or **Resign** outcome. **Request Draw** and **Resign** stay disabled until
 * a practice game has started (Practice → Confirm); then they work from an empty board too, matching
 * Admirals and Ouroboros.
 *
 * **Practice session** (same pattern as Admirals / Ouroboros): **Practice** opens
 * `GameSettingsModal`; choices are draft-only until **Confirm**, which applies board size and
 * **Pin Type** (`multi` | `single` | `none`), calls `newGame`, and enables the board. Until then,
 * during gamelog review, or after a result, the center
 * column uses `board-wrap--inactive` +
 * `board-wrap-inactive-shade` in `index.css` (no on-board input). **Game over** copy from
 * `gameOverCopy.js`; on the GAME END review step, closing the modal exits review.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { SITE_GAMES } from "../shared/gameRegistry.js";
import { SumoHexBoard } from "./SumoHexBoard.jsx";
import { ThemeSettingsModal } from "../shared/ThemeSettingsModal.jsx";
import { GameSettingsModal } from "../shared/GameSettingsModal.jsx";
import { ChallengeAiModal } from "../shared/ChallengeAiModal.jsx";
import { SiteTopNav } from "../shared/SiteTopNav.jsx";
import { SiteHomepageLink } from "../shared/SiteHomepageLink.jsx";
import { buildCellList } from "../shared/hexBoard.js";
import {
  mergeTheme,
  loadStoredTheme,
  themeToCssVars,
} from "../shared/theme.js";
import {
  applySumoPlacement,
  checkWinAtTurnStart,
  computePins,
  computeTotals,
  SUMO_DEFAULT_PIN_TYPE,
  SUMO_PIN_TYPE_MULTI,
  SUMO_PIN_TYPE_NONE,
  SUMO_PIN_TYPE_SINGLE,
} from "./sumo.js";
import {
  movesToGamelogRounds,
  serializeGamelog,
  parseGamelogJson,
  replayGameForImport,
  replaySumoStateAtPlies,
} from "./sumoGamelog.js";
import { cellIdsWithPinCountChange } from "./sumoVisualAids.js";
import { useSyncGameViewportHeight } from "../shared/useSyncGameViewportHeight.js";
import "./SumoGameShell.css";
import { GamelogReviewNav } from "../shared/GamelogReviewNav.jsx";
import {
  gamelogReviewDisplayFraction,
  gamelogReviewHasTerminalStep,
} from "../shared/gamelogReviewNav.js";
import { gameOverModalKicker } from "../shared/gameOverCopy.js";

/** Placeholder clock — no time limit yet (does not count down). */
const CLOCK_INFINITE_DISPLAY = "99:99";

/**
 * One motion cycle on HexBoard: on-board slides, place pop-in, and push-off slide+fade.
 * Push-offs use a larger fraction of this budget for the visible path; see HexBoard.
 */
const MOVE_ANIM_MS = 130;
const SUMO_BOARD_SIZE_OPTIONS = [
  { value: "6x6x5", label: "6x6x5" },
  { value: "8x8x7", label: "8x8x7" },
];
const SUMO_BOARD_SIZE_CONFIG = {
  "6x6x5": { sideLength: 6, caption: "Small Board: 6x6x5" },
  "8x8x7": { sideLength: 8, caption: "Large Board: 8x8x7" },
};
/** Labels match UI; values are persisted in gamelog JSON (`settings.pinType`). */
const SUMO_PIN_TYPE_OPTIONS = [
  { value: SUMO_PIN_TYPE_MULTI, label: "Multi" },
  { value: SUMO_PIN_TYPE_SINGLE, label: "Single" },
  { value: SUMO_PIN_TYPE_NONE, label: "None" },
];
/** Bot catalog for this game; empty until AI engines are added. */
const SUMO_BOT_OPTIONS = [];

function SumoPinTypeSettingsField({
  id,
  pinType,
  onPinTypeChange,
  disabled = false,
}) {
  return (
    <div className="game-settings-field">
      <label className="game-settings-field-label" htmlFor={id}>
        Pin Type
      </label>
      <select
        className="game-settings-field-select"
        id={id}
        value={pinType}
        onChange={(e) => onPinTypeChange(e.target.value)}
        disabled={disabled}
      >
        {SUMO_PIN_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
/** @typedef {{ board: Record<string, 'white'|'black'>, pushPoints: { white: number, black: number }, turn: 'white'|'black', moveHistory: string[], lastPlacedId: string | null, resignedWinner: 'white'|'black'|null, termination: null | 'resign' | 'agreed_draw', lastPushMoves: null | Array<{ fromId: string, toId: string, color?: 'white'|'black' }> }} UndoSnapshot */

/** @typedef {{ plies: number, includeTermination: boolean }} GamelogReviewPointer Matches `shared/gamelogReviewNav.js`. */

/** @param {{ config: import("../shared/gameRegistry.js").SiteGameConfig }} props */
export function SumoGameShell({ config }) {
  useSyncGameViewportHeight();
  const [boardSize, setBoardSize] = useState("6x6x5");
  /**
   * How sandwich-axes map to displayed pin counts and scoring (see `sumo.js` file header).
   * Exported/imported with gamelogs as `settings.pinType`.
   */
  const [pinType, setPinType] = useState(SUMO_DEFAULT_PIN_TYPE);
  const boardSizeConfig =
    SUMO_BOARD_SIZE_CONFIG[boardSize] ?? SUMO_BOARD_SIZE_CONFIG["6x6x5"];
  const cells = useMemo(
    () => buildCellList(boardSizeConfig.sideLength),
    [boardSizeConfig.sideLength]
  );
  const hexOrientation = "flat-top";

  const [board, setBoard] = useState({});
  const [pushPoints, setPushPoints] = useState({ white: 0, black: 0 });
  const [turn, setTurn] = useState("white");
  const [motion, setMotion] = useState(null);
  const [lastPlacedId, setLastPlacedId] = useState(null);
  const animRafRef = useRef(0);
  const [theme, setTheme] = useState(() => mergeTheme(loadStoredTheme()));
  /** Drives `ThemeSettingsModal` (header **Settings**). */
  const [themeOpen, setThemeOpen] = useState(false);

  /** Practice flow: false until Game Settings → Confirm; false again when the match has ended. */
  const [practiceSessionActive, setPracticeSessionActive] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [challengeAiOpen, setChallengeAiOpen] = useState(false);
  const [selectedAiBotId, setSelectedAiBotId] = useState("");
  /** Values bound to `GameSettingsModal`; copied from committed settings when the modal opens. */
  const [draftBoardSize, setDraftBoardSize] = useState("6x6x5");
  const [draftPinType, setDraftPinType] = useState(SUMO_DEFAULT_PIN_TYPE);
  const gameSettingsWasOpenRef = useRef(false);
  useEffect(() => {
    if (gameSettingsOpen && !gameSettingsWasOpenRef.current) {
      setDraftBoardSize(boardSize);
      setDraftPinType(pinType);
    }
    gameSettingsWasOpenRef.current = gameSettingsOpen;
  }, [gameSettingsOpen, boardSize, pinType]);
  const themeCss = useMemo(() => themeToCssVars(theme), [theme]);
  /**
   * Placements in order: white, black, white, black, …
   * Each entry is one **ply** for gamelog review (`moveHistory.length` === ply count).
   */
  const [moveHistory, setMoveHistory] = useState([]);
  const [notepad, setNotepad] = useState("");
  const gamelogEndRef = useRef(null);
  const gamelogFileInputRef = useRef(null);
  const [undoStack, setUndoStack] = useState(
    /** @type {UndoSnapshot[]} */ ([])
  );
  /** Opponent wins when current player resigns (single-player). */
  const [resignedWinner, setResignedWinner] = useState(
    /** @type {'white'|'black'|null} */ (null)
  );
  /** Recorded game end for log / export (resign or mutual draw). */
  const [termination, setTermination] = useState(
    /** @type {null | 'resign' | 'agreed_draw'} */ (null)
  );
  /** Pushes from the latest placement (for on-board arrows). */
  const [lastPushMoves, setLastPushMoves] = useState(
    /** @type {null | Array<{ fromId: string, toId: string, color?: 'white'|'black' }>} */ (
      null
    )
  );

  /**
   * Sumo visual aids (see sumoVisualAids.js) — cleared on undo / new game / import.
   *
   * - `pushOffHudAccent`: which “Pieces Removed” panel matches the **last** move’s push-off
   *   (persists through the opponent’s turn until someone plays again, like push arrows).
   * - `pinChangeVisualAidIds`: cells whose pin **numeral** is accented (last move’s Δ).
   * - `scoreTotalVisualAid`: which sidebar total **numeric** changed on the last placement
   *   (pins the big number with theme `sumoScoreAheadMarker`, same orange as “!”).
   */
  const [pushOffHudAccent, setPushOffHudAccent] = useState(
    /** @type {null | 'black' | 'white'} */ (null)
  );
  const [pinChangeVisualAidIds, setPinChangeVisualAidIds] = useState(
    /** @type {string[]} */ ([])
  );
  const [scoreTotalVisualAid, setScoreTotalVisualAid] = useState({
    white: false,
    black: false,
  });
  /**
   * When `false`, the game-over modal is eligible to show (if `winner != null`). When `true`, it
   * stays hidden until the user reopens it (finish-flag) or review revisits the GAME END step.
   * Outside review: dismiss only hides the modal. On the GAME END review step: dismiss also exits
   * review (`dismissGameOverModal`).
   */
  const [gameOverModalDismissed, setGameOverModalDismissed] = useState(false);

  /**
   * Gamelog review (`shared/gamelogReviewNav.js`): `null` = live play; non-null = scrub pointer
   * `{ plies, includeTermination }`. Ended games add a **GAME END** row → extra scrub step with
   * `includeTermination: true` (same board as after all plies, result metadata active for UI).
   */
  const [gamelogReview, setGamelogReview] = useState(
    /** @type {GamelogReviewPointer | null} */ (null)
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

  /** True when the scrubber is on the **GAME END** row (last ply + `includeTermination`). */
  const atGameEndReview =
    inGamelogReview &&
    gamelogReview != null &&
    reviewPliesClamped === moveHistory.length &&
    gamelogReview.includeTermination;

  const dismissGameOverModal = useCallback(() => {
    setGameOverModalDismissed(true);
    if (atGameEndReview) exitGamelogReview();
  }, [atGameEndReview, exitGamelogReview]);

  /** Outcome from rules only, after the full move list (used when `termination` is still null). */
  const naturalOutcomeAtEndOfMoves = useMemo(() => {
    if (moveHistory.length === 0) return null;
    const end = replaySumoStateAtPlies(
      moveHistory,
      cells,
      moveHistory.length
    );
    return checkWinAtTurnStart(
      end.turn,
      end.board,
      end.pushPoints,
      cells,
      pinType
    );
  }, [moveHistory, cells, pinType]);

  /** Sidebar shows **GAME END** and the scrubber gains one post-last-ply step when this is true. */
  const hasGamelogTerminalStep = useMemo(
    () =>
      gamelogReviewHasTerminalStep(termination, naturalOutcomeAtEndOfMoves),
    [termination, naturalOutcomeAtEndOfMoves]
  );

  const replayAtReview = useMemo(() => {
    if (!gamelogReview) return null;
    return replaySumoStateAtPlies(moveHistory, cells, reviewPliesClamped);
  }, [gamelogReview, moveHistory, cells, reviewPliesClamped]);

  const gamelogReviewFraction = useMemo(() => {
    if (!gamelogReview) return null;
    return gamelogReviewDisplayFraction(
      gamelogReview,
      moveHistory.length,
      hasGamelogTerminalStep
    );
  }, [gamelogReview, moveHistory.length, hasGamelogTerminalStep]);

  const displayBoard = replayAtReview ? replayAtReview.board : board;
  const displayPushPoints = replayAtReview
    ? replayAtReview.pushPoints
    : pushPoints;
  const displayTurn = replayAtReview ? replayAtReview.turn : turn;
  const displayLastPlacedId = replayAtReview
    ? replayAtReview.lastPlacedId
    : lastPlacedId;

  const pins = useMemo(
    () => computePins(displayBoard, cells, pinType),
    [displayBoard, cells, pinType]
  );
  const totals = useMemo(
    () => computeTotals(displayBoard, displayPushPoints, cells, pinType),
    [displayBoard, displayPushPoints, cells, pinType]
  );
  /* Win by rules (board full or ahead at start of turn); null while game continues. */
  const naturalWinner = useMemo(
    () =>
      checkWinAtTurnStart(
        displayTurn,
        displayBoard,
        displayPushPoints,
        cells,
        pinType
      ),
    [displayTurn, displayBoard, displayPushPoints, cells, pinType]
  );
  /* Resign / agreed draw override natural outcome; agreed draw maps to "draw". */
  const winner = useMemo(() => {
    if (inGamelogReview && gamelogReview) {
      const atTerminal =
        reviewPliesClamped === moveHistory.length &&
        gamelogReview.includeTermination;
      if (atTerminal && termination === "agreed_draw") return "draw";
      if (atTerminal && termination === "resign" && resignedWinner) {
        return resignedWinner;
      }
      return naturalWinner;
    }
    if (termination === "agreed_draw") return "draw";
    return resignedWinner ?? naturalWinner;
  }, [
    inGamelogReview,
    gamelogReview,
    reviewPliesClamped,
    moveHistory.length,
    termination,
    resignedWinner,
    naturalWinner,
  ]);

  /** True when the center column should not accept moves (overlay + `board-wrap--inactive`). */
  const isBoardInactive =
    !practiceSessionActive || inGamelogReview || winner != null;

  /** Practice is only available when not in review and not mid-match. */
  const practiceDisabled =
    inGamelogReview || (practiceSessionActive && winner == null);
  const canConfirmAiChallenge = SUMO_BOT_OPTIONS.some(
    (bot) => bot.value === selectedAiBotId
  );

  /**
   * Request Draw / Resign: only after Practice → Confirm (`practiceSessionActive`), and never in
   * review or after a result. Kept next to `practiceDisabled` / `isBoardInactive` as the same
   * “session lifecycle” rules.
   */
  const canRequestDrawOrResign =
    practiceSessionActive && winner == null && !inGamelogReview;

  const gamelogRounds = useMemo(
    () => movesToGamelogRounds(moveHistory),
    [moveHistory]
  );

  useEffect(() => {
    const sentinel = gamelogEndRef.current;
    const scroller = sentinel?.closest(".gamelog-scroll");
    if (!scroller) return;
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  }, [moveHistory.length, termination, naturalOutcomeAtEndOfMoves]);

  /* Unmount hygiene: cancel in-flight move animation RAF. */
  useEffect(
    () => () => {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = 0;
    },
    []
  );

  /* New match: show the result modal again the next time someone wins. */
  useEffect(() => {
    if (winner == null) setGameOverModalDismissed(false);
  }, [winner]);

  /* Entering the GAME END review step reopens the result modal so it pairs with that row. */
  useEffect(() => {
    if (atGameEndReview) setGameOverModalDismissed(false);
  }, [atGameEndReview]);

  /* In review, hide the modal except on the GAME END step (where it explains the final outcome). */
  const showGameOverModal =
    winner != null &&
    !gameOverModalDismissed &&
    (!inGamelogReview || atGameEndReview);
  const canOpenGameResultPanel =
    winner != null && gameOverModalDismissed && !inGamelogReview;

  /* Defensive guards (veil also blocks pointer events); winner handled below. */
  const onCellClick = useCallback(
    (id) => {
      if (!practiceSessionActive || inGamelogReview) return;
      if (winner != null || board[id]) return;
      const pinsBefore = computePins(board, cells, pinType);
      const totalsBefore = computeTotals(board, pushPoints, cells, pinType);

      setUndoStack((s) => [
        ...s,
        {
          board: { ...board },
          pushPoints: { ...pushPoints },
          turn,
          moveHistory: [...moveHistory],
          lastPlacedId,
          resignedWinner,
          termination,
          lastPushMoves,
        },
      ]);
      const res = applySumoPlacement(board, pushPoints, cells, id, turn);
      cancelAnimationFrame(animRafRef.current);

      const totalsAfter = computeTotals(res.board, res.pushPoints, cells, pinType);
      setScoreTotalVisualAid({
        white: totalsAfter.white !== totalsBefore.white,
        black: totalsAfter.black !== totalsBefore.black,
      });

      const pinsAfter = computePins(res.board, cells, pinType);
      setPinChangeVisualAidIds(
        cellIdsWithPinCountChange(pinsBefore, pinsAfter, cells)
      );

      /* Pieces Removed HUD accent tracks last placement only (same as push arrows). */
      if (res.pushOffThisTurn > 0) {
        setPushOffHudAccent(turn === "white" ? "black" : "white");
      } else {
        setPushOffHudAccent(null);
      }

      /*
       * Motion overlay: end-state is in `res` already; HexBoard tweens pieces. Push-offs need
       * pin counts from before this click (cells are empty in `res` for removed stones).
       */
      const payload = {
        moves: res.pushedMoves ?? [],
        placedId: res.placedId,
        placeColor: turn,
        pinsBeforePlacement: pinsBefore,
      };
      const start = performance.now();

      function tick(now) {
        const t = Math.min(1, (now - start) / MOVE_ANIM_MS);
        setMotion({ t, ...payload });
        if (t < 1) animRafRef.current = requestAnimationFrame(tick);
        else {
          animRafRef.current = 0;
          setMotion(null);
        }
      }

      setMotion({ t: 0, ...payload });
      animRafRef.current = requestAnimationFrame(tick);
      setBoard(res.board);
      setPushPoints(res.pushPoints);
      setTurn((t) => (t === "white" ? "black" : "white"));
      if (res.placedId) {
        setLastPlacedId(res.placedId);
        setMoveHistory((h) => [...h, res.placedId]);
      }
      const pushed = res.pushedMoves ?? [];
      setLastPushMoves(pushed.length > 0 ? pushed : null);
    },
    [
      board,
      pushPoints,
      turn,
      winner,
      moveHistory,
      lastPlacedId,
      resignedWinner,
      termination,
      lastPushMoves,
      cells,
      inGamelogReview,
      practiceSessionActive,
      pinType,
    ]
  );

  const requestUndo = useCallback(() => {
    setPushOffHudAccent(null);
    setPinChangeVisualAidIds([]);
    setScoreTotalVisualAid({ white: false, black: false });
    cancelAnimationFrame(animRafRef.current);
    animRafRef.current = 0;
    setMotion(null);
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setBoard(prev.board);
      setPushPoints(prev.pushPoints);
      setTurn(prev.turn);
      setMoveHistory(prev.moveHistory);
      setLastPlacedId(prev.lastPlacedId);
      setResignedWinner(prev.resignedWinner);
      setTermination(prev.termination ?? null);
      setLastPushMoves(prev.lastPushMoves ?? null);
      return s.slice(0, -1);
    });
  }, []);

  const resign = useCallback(() => {
    if (!practiceSessionActive) return;
    if (winner != null) return;
    setUndoStack((s) => [
      ...s,
      {
        board: { ...board },
        pushPoints: { ...pushPoints },
        turn,
        moveHistory: [...moveHistory],
        lastPlacedId,
        resignedWinner,
        termination,
        lastPushMoves,
      },
    ]);
    setResignedWinner(turn === "white" ? "black" : "white");
    setTermination("resign");
  }, [
    winner,
    board,
    pushPoints,
    turn,
    moveHistory,
    lastPlacedId,
    resignedWinner,
    termination,
    lastPushMoves,
    practiceSessionActive,
  ]);

  /** Same undo snapshot shape as {@link resign}; sets draw termination without a declared winner. */
  const agreedDraw = useCallback(() => {
    if (!practiceSessionActive) return;
    if (winner != null) return;
    setUndoStack((s) => [
      ...s,
      {
        board: { ...board },
        pushPoints: { ...pushPoints },
        turn,
        moveHistory: [...moveHistory],
        lastPlacedId,
        resignedWinner,
        termination,
        lastPushMoves,
      },
    ]);
    setTermination("agreed_draw");
  }, [
    winner,
    board,
    pushPoints,
    turn,
    moveHistory,
    lastPlacedId,
    resignedWinner,
    termination,
    lastPushMoves,
    practiceSessionActive,
  ]);

  const downloadGamelog = useCallback(() => {
    const json = serializeGamelog(moveHistory, termination, {
      boardSize,
      pinType,
    });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.gamelogFilePrefix}-gamelog-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [moveHistory, termination, config.gamelogFilePrefix, boardSize, pinType]);

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
          const text =
            typeof reader.result === "string" ? reader.result : "";
          const {
            moves,
            termination: importedTermination,
            boardSize: importedBoardSize,
            pinType: importedPinType,
          } = parseGamelogJson(text);
          const importedBoardConfig =
            SUMO_BOARD_SIZE_CONFIG[importedBoardSize] ?? null;
          if (!importedBoardConfig) {
            throw new Error(`Unsupported Sumo board size in gamelog: ${importedBoardSize}.`);
          }
          const importedCells = buildCellList(importedBoardConfig.sideLength);
          const valid = new Set(importedCells.map((c) => c.id));
          for (let i = 0; i < moves.length; i++) {
            if (!valid.has(moves[i])) {
              throw new Error(`Unknown cell id: ${moves[i]} (move ${i + 1}).`);
            }
          }
          cancelAnimationFrame(animRafRef.current);
          animRafRef.current = 0;
          setMotion(null);
          const {
            board: nextBoard,
            pushPoints: nextPush,
            turn: nextTurn,
            lastPlacedId: nextLast,
            moveHistory: nextHistory,
            undoStack: nextUndo,
          } = replayGameForImport(moves, importedCells, importedTermination);
          setBoardSize(importedBoardSize);
          setPinType(importedPinType);
          setBoard(nextBoard);
          setPushPoints(nextPush);
          setTurn(nextTurn);
          setMoveHistory(nextHistory);
          setLastPlacedId(nextLast);
          setUndoStack(nextUndo);
          setResignedWinner(null);
          setTermination(null);
          setLastPushMoves(null);
          setPushOffHudAccent(null);
          setPinChangeVisualAidIds([]);
          setScoreTotalVisualAid({ white: false, black: false });
          setGameOverModalDismissed(false);
          setGamelogReview(null);
          setPracticeSessionActive(true);
          /* After replay, nextTurn is who would move next; resigning player is therefore opposite. */
          if (importedTermination === "resign") {
            setResignedWinner(nextTurn === "white" ? "black" : "white");
            setTermination("resign");
          } else if (importedTermination === "agreed_draw") {
            setTermination("agreed_draw");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not import gamelog.";
          window.alert(msg);
        }
      };
      reader.readAsText(file);
    },
    []
  );

  const newGame = useCallback(() => {
    setPushOffHudAccent(null);
    setPinChangeVisualAidIds([]);
    setScoreTotalVisualAid({ white: false, black: false });
    cancelAnimationFrame(animRafRef.current);
    animRafRef.current = 0;
    setBoard({});
    setPushPoints({ white: 0, black: 0 });
    setTurn("white");
    setMotion(null);
    setLastPlacedId(null);
    setMoveHistory([]);
    setUndoStack([]);
    setResignedWinner(null);
    setTermination(null);
    setLastPushMoves(null);
    setGamelogReview(null);
  }, []);

  const whiteAhead = totals.white > totals.black;
  const blackAhead = totals.black > totals.white;

  /** Game Settings → Confirm: apply draft settings, reset to opening position, allow play. */
  const confirmPracticeSettings = useCallback(() => {
    setBoardSize(draftBoardSize);
    setPinType(draftPinType);
    newGame();
    setPracticeSessionActive(true);
    setGameSettingsOpen(false);
  }, [newGame, draftBoardSize, draftPinType]);
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
      {/*
        Full-bleed header: brand + `SITE_GAMES` picker + Homepage link + `SiteTopNav` (includes Settings).
        NavLink `end`: highlight only on exact route (e.g. /sumo), not subpaths.
      */}
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
                        <span
                          className="brand-game-picker-emoji"
                          aria-hidden="true"
                        >
                          {g.listIconEmoji}
                        </span>
                      ) : (
                        <span
                          className="brand-game-picker-dot"
                          aria-hidden="true"
                        />
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
        <aside className="side-panel side-panel--left panel" aria-label="Move log and actions">
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
                    : "Undo last placement, or clear Agree draw / Resign (single-player)"
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
                        /* `i + 1` = full turn (white + black), not a single ply. */
                        const turnNum = i + 1;
                        const pliesAfterWhite = 2 * i + 1;
                        const pliesAfterBlack =
                          r.black != null ? 2 * i + 2 : null;
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
                            <span className="gamelog-turn-num">{turnNum}. </span>
                            <button
                              type="button"
                              className={
                                "gamelog-ply-btn" +
                                (hiWhite ? " gamelog-ply-btn--active" : "")
                              }
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
          `board-wrap--inactive` + `.board-wrap-inactive-shade`: non-interactive veil (see index.css).
          Applied when practice not started, gamelog review, or match over.
        */}
        <section
          className={
            "board-wrap board-wrap--center board-wrap--stacked" +
            (inGamelogReview ? " board-wrap--gamelog-review" : "") +
            (isBoardInactive ? " board-wrap--inactive" : "")
          }
          aria-label="Game board"
        >
          <div
            className={
              "player-game-bar player-game-bar--white" +
              (displayTurn === "white" && winner == null
                ? " player-game-bar--active"
                : "")
            }
            role="group"
            aria-label={
              "White — score " +
              totals.white +
              (whiteAhead ? ", ahead on total" : "") +
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
              <span
                className={
                  "player-game-score-line mono" +
                  (!inGamelogReview && scoreTotalVisualAid.white
                    ? " player-game-score-line--visual-aid"
                    : "")
                }
              >
                Score:{" "}
                {totals.white}
                {whiteAhead ? (
                  <>
                    <span
                      className="player-game-exclaim"
                      title="Ahead on total"
                      aria-hidden="true"
                    >
                      {" "}
                      !
                    </span>
                    <span className="visually-hidden"> (ahead on total)</span>
                  </>
                ) : null}
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
            <div
              className="board-corner-actions"
              role="toolbar"
              aria-label="Board tools"
            >
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
            <SumoHexBoard
              board={displayBoard}
              pins={pins}
              onCellClick={onCellClick}
              winner={inGamelogReview ? null : winner}
              motion={inGamelogReview ? null : motion}
              lastPlacedId={displayLastPlacedId}
              pushMarks={inGamelogReview ? null : lastPushMoves}
              blackPiecesRemoved={displayPushPoints.white}
              whitePiecesRemoved={displayPushPoints.black}
              pushOffHudAccentBlackPanel={
                inGamelogReview ? false : pushOffHudAccent === "black"
              }
              pushOffHudAccentWhitePanel={
                inGamelogReview ? false : pushOffHudAccent === "white"
              }
              pinChangeVisualAidIds={
                inGamelogReview ? [] : pinChangeVisualAidIds
              }
              boardCaption={boardSizeConfig.caption}
              cells={cells}
              hexOrientation={hexOrientation}
            />
          </div>

          <div
            className={
              "player-game-bar player-game-bar--black" +
              (displayTurn === "black" && winner == null
                ? " player-game-bar--active"
                : "")
            }
            role="group"
            aria-label={
              "Black — score " +
              totals.black +
              (blackAhead ? ", ahead on total" : "") +
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
              <span
                className={
                  "player-game-score-line mono" +
                  (!inGamelogReview && scoreTotalVisualAid.black
                    ? " player-game-score-line--visual-aid"
                    : "")
                }
              >
                Score:{" "}
                {totals.black}
                {blackAhead ? (
                  <>
                    <span
                      className="player-game-exclaim"
                      title="Ahead on total"
                      aria-hidden="true"
                    >
                      {" "}
                      !
                    </span>
                    <span className="visually-hidden"> (ahead on total)</span>
                  </>
                ) : null}
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
            aria-labelledby="game-over-modal-title"
            aria-describedby="game-over-modal-kicker"
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
            <p id="game-over-modal-kicker" className="game-over-modal-kicker">
              {gameOverModalKicker(termination)}
            </p>
            <p id="game-over-modal-title" className="game-over-modal-title">
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
        titleId="sumo-game-settings-title"
        boardSizeOptions={SUMO_BOARD_SIZE_OPTIONS}
        boardSizeValue={draftBoardSize}
        onBoardSizeChange={setDraftBoardSize}
      >
        <SumoPinTypeSettingsField
          id="sumo-game-settings-pin-type"
          pinType={draftPinType}
          onPinTypeChange={setDraftPinType}
        />
      </GameSettingsModal>

      <ChallengeAiModal
        open={challengeAiOpen}
        onClose={() => setChallengeAiOpen(false)}
        onConfirm={confirmAiChallenge}
        botOptions={SUMO_BOT_OPTIONS}
        botValue={selectedAiBotId}
        onBotChange={setSelectedAiBotId}
        canConfirm={canConfirmAiChallenge}
        boardSizeOptions={SUMO_BOARD_SIZE_OPTIONS}
        boardSizeValue={SUMO_BOARD_SIZE_OPTIONS[0]?.value ?? ""}
        titleId="sumo-challenge-ai-title"
      >
        <SumoPinTypeSettingsField
          id="sumo-challenge-ai-pin-type"
          pinType={SUMO_DEFAULT_PIN_TYPE}
          onPinTypeChange={() => {}}
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
