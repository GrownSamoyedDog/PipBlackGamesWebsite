/**
 * Admirals match UI — orchestrates board, turn phases, gamelog, undo, import/export, theme.
 *
 * **Turn flow:** `select` (pick admiral) → `place` (ship or skip) → `move` (hex or die in place);
 * completing move commits an `AdmiralsTurnRecord` (see `admiralsGamelog.js`).
 *
 * **Undo:** stack mirrors Sumo — snapshots before each completed turn and before **Agree draw** or
 * **Resign**; import rebuilds the same stack via `replayAdmiralsGame` in `admiralsGamelog.js`.
 *
 * **Agree draw / Resign:** enabled only after Practice → Confirm; both work from a fresh position
 * (no turns yet) within that session, same as Sumo / Ouroboros.
 *
 * **Layout:** shared site header + triple column (players/log | hex | notepad), same chrome as Sumo.
 *
 * **Practice session** (Sumo / Ouroboros parity): **Practice** opens `GameSettingsModal`; choices are
 * draft-only until **Confirm**, which applies board size, calls `resetMatch`, and enables the board.
 * Until then, during gamelog review, or after a result,
 * the center column is non-interactive (`board-wrap--inactive` + `board-wrap-inactive-shade` in
 * `index.css`).
 *
 * **Styles:** `AdmiralsGameShell.css` (board SVG, sidebar admiral pips, float controls, gamelog rows).
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { SITE_GAMES } from "../shared/gameRegistry.js";
import { AdmiralsHexBoard } from "./AdmiralsHexBoard.jsx";
import { ThemeSettingsModal } from "../shared/ThemeSettingsModal.jsx";
import { GameSettingsModal } from "../shared/GameSettingsModal.jsx";
import { ChallengeAiModal } from "../shared/ChallengeAiModal.jsx";
import { SiteTopNav } from "../shared/SiteTopNav.jsx";
import { SiteHomepageLink } from "../shared/SiteHomepageLink.jsx";
import { buildAdmiralsCellList } from "../shared/hexBoard.js";
import { mergeTheme, loadStoredTheme, themeToCssVars } from "../shared/theme.js";
import {
  createInitialAdmiralsBoard,
  cloneAdmiralsBoard,
} from "./admirals.js";
import {
  buildQrToCellId,
  computeValidShipPlacements,
  computeValidAdmiralMoves,
  findWinner,
  applyShipPlacementToCell,
  wouldAdmiralDieAfterMove,
} from "./admiralsLogic.js";
import { useSyncGameViewportHeight } from "../shared/useSyncGameViewportHeight.js";
import { GamelogReviewNav } from "../shared/GamelogReviewNav.jsx";
import {
  gamelogReviewDisplayFraction,
  gamelogReviewHasTerminalStep,
} from "../shared/gamelogReviewNav.js";
import { gameOverModalKicker } from "../shared/gameOverCopy.js";
import {
  admiralsTurnsToGamelogRounds,
  serializeAdmiralsGamelog,
  parseAdmiralsGamelogJson,
  replayAdmiralsGame,
} from "./admiralsGamelog.js";
import "./AdmiralsGameShell.css";

/** @typedef {'select'|'place'|'move'} AdmiralsPhase */

// --- Constants ---

const CLOCK_INFINITE_DISPLAY = "99:99";
/** Text-style anchor for sidebar (matches board glyph). */
const SIDEBAR_ANCHOR_GLYPH = "\u2693\uFE0E";
const ADMIRALS_BOARD_SIZE_OPTIONS = [
  { value: "6x6x6", label: "6x6x6" },
  { value: "9x9x9", label: "9x9x9" },
  { value: "12x12x12", label: "12x12x12" },
];
const ADMIRALS_BOARD_SIZE_CONFIG = {
  "6x6x6": { sideLength: 6, caption: "Small Board: 6x6x6" },
  "9x9x9": { sideLength: 9, caption: "Medium Board: 9x9x9" },
  "12x12x12": { sideLength: 12, caption: "Large Board: 12x12x12" },
};
/** Bot catalog for this game; empty until AI engines are added. */
const ADMIRALS_BOT_OPTIONS = [];

function emptyTurnDraft() {
  return {
    admiralFrom: /** @type {string | null} */ (null),
    shipSkip: false,
    shipCell: /** @type {string | null} */ (null),
    moveSuicide: false,
    moveCell: /** @type {string | null} */ (null),
    moveDied: false,
  };
}

function cloneTurnDraft(d) {
  return {
    admiralFrom: d.admiralFrom,
    shipSkip: d.shipSkip,
    shipCell: d.shipCell,
    moveSuicide: d.moveSuicide,
    moveCell: d.moveCell,
    moveDied: d.moveDied,
  };
}

/**
 * @typedef {{
 *   board: Record<string, import('./admirals.js').AdmiralsCell>,
 *   turn: 'white'|'black',
 *   phase: AdmiralsPhase,
 *   selectedAdmiralCellId: string | null,
 *   draft: ReturnType<typeof emptyTurnDraft>,
 *   admiralsTurns: import('./admiralsGamelog.js').AdmiralsTurnRecord[],
 *   termination: null|'resign'|'agreed_draw',
 *   resignedWinner: 'white'|'black'|null,
 *   boardAtTurnStart: Record<string, import('./admirals.js').AdmiralsCell> | null,
 * }} AdmiralsUndoSnapshot
 */

/** @param {{ config: import("../shared/gameRegistry.js").SiteGameConfig }} props */
export function AdmiralsGameShell({ config }) {
  useSyncGameViewportHeight();
  const [boardSize, setBoardSize] = useState("6x6x6");
  const boardSizeConfig =
    ADMIRALS_BOARD_SIZE_CONFIG[boardSize] ??
    ADMIRALS_BOARD_SIZE_CONFIG["6x6x6"];
  // --- Board geometry (fixed 91-hex Admirals layout) ---

  const cells = useMemo(
    () => buildAdmiralsCellList(boardSizeConfig.sideLength),
    [boardSizeConfig.sideLength]
  );
  const qrToId = useMemo(() => buildQrToCellId(cells), [cells]);
  const gamelogEndRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const gamelogFileInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const turnDraftRef = useRef(emptyTurnDraft());
  /** Board clone at the moment an admiral was selected (before place / move this turn). */
  const boardAtTurnStartRef = useRef(
    /** @type {Record<string, import('./admirals.js').AdmiralsCell> | null} */ (null)
  );

  const [board, setBoard] = useState(() =>
    createInitialAdmiralsBoard(
      buildAdmiralsCellList(boardSizeConfig.sideLength),
      boardSizeConfig.sideLength
    )
  );
  const [turn, setTurn] = useState(
    /** @type {'white'|'black'} */ ("white")
  );
  const [phase, setPhase] = useState(
    /** @type {AdmiralsPhase} */ ("select")
  );
  const [selectedAdmiralCellId, setSelectedAdmiralCellId] = useState(
    /** @type {string | null} */ (null)
  );
  /**
   * Completed turns in order; `admiralsTurns.length` is the ply count for review
   * (one ply = one full Admirals turn record).
   */
  const [admiralsTurns, setAdmiralsTurns] = useState(
    /** @type {import('./admiralsGamelog.js').AdmiralsTurnRecord[]} */ ([])
  );
  const [termination, setTermination] = useState(
    /** @type {null|'resign'|'agreed_draw'} */ (null)
  );
  const [resignedWinner, setResignedWinner] = useState(
    /** @type {'white'|'black'|null} */ (null)
  );
  const [undoStack, setUndoStack] = useState(
    /** @type {AdmiralsUndoSnapshot[]} */ ([])
  );

  const [theme, setTheme] = useState(() => mergeTheme(loadStoredTheme()));
  /** Drives `ThemeSettingsModal` (header **Settings**). */
  const [themeOpen, setThemeOpen] = useState(false);

  /** Practice flow: false until Game Settings → Confirm; false again when the match has ended. */
  const [practiceSessionActive, setPracticeSessionActive] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [challengeAiOpen, setChallengeAiOpen] = useState(false);
  const [selectedAiBotId, setSelectedAiBotId] = useState("");
  /** Values bound to `GameSettingsModal`; copied from `boardSize` when the modal opens. */
  const [draftBoardSize, setDraftBoardSize] = useState("6x6x6");
  const gameSettingsWasOpenRef = useRef(false);
  useEffect(() => {
    if (gameSettingsOpen && !gameSettingsWasOpenRef.current) {
      setDraftBoardSize(boardSize);
    }
    gameSettingsWasOpenRef.current = gameSettingsOpen;
  }, [gameSettingsOpen, boardSize]);
  const themeCss = useMemo(() => themeToCssVars(theme), [theme]);
  const [notepad, setNotepad] = useState("");
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

  const exitGamelogReview = useCallback(() => setGamelogReview(null), []);
  const inGamelogReview = gamelogReview != null;

  const reviewPliesClamped = useMemo(() => {
    if (!gamelogReview) return 0;
    return Math.min(
      Math.max(0, gamelogReview.plies),
      admiralsTurns.length
    );
  }, [gamelogReview, admiralsTurns.length]);

  /** Scrubber is on the **GAME END** row (last ply + `includeTermination`). */
  const atGameEndReview =
    inGamelogReview &&
    gamelogReview != null &&
    reviewPliesClamped === admiralsTurns.length &&
    gamelogReview.includeTermination;

  const dismissGameOverModal = useCallback(() => {
    setGameOverModalDismissed(true);
    if (atGameEndReview) exitGamelogReview();
  }, [atGameEndReview, exitGamelogReview]);

  /** Rules outcome after the full turn list when `termination` is still null. */
  const naturalOutcomeAtEndOfMoves = useMemo(() => {
    if (admiralsTurns.length === 0) return null;
    const { board } = replayAdmiralsGame(
      admiralsTurns,
      cells,
      null,
      boardSizeConfig.sideLength
    );
    return findWinner(board, cells);
  }, [admiralsTurns, cells, boardSizeConfig.sideLength]);

  /** Sidebar **GAME END** + one post-last-ply scrub step when true. */
  const hasGamelogTerminalStep = useMemo(
    () =>
      gamelogReviewHasTerminalStep(termination, naturalOutcomeAtEndOfMoves),
    [termination, naturalOutcomeAtEndOfMoves]
  );

  const admiralsReplayAtReview = useMemo(() => {
    if (!gamelogReview) return null;
    return replayAdmiralsGame(
      admiralsTurns.slice(0, reviewPliesClamped),
      cells,
      null,
      boardSizeConfig.sideLength
    );
  }, [
    gamelogReview,
    admiralsTurns,
    cells,
    reviewPliesClamped,
    boardSizeConfig.sideLength,
  ]);

  const gamelogReviewFraction = useMemo(() => {
    if (!gamelogReview) return null;
    return gamelogReviewDisplayFraction(
      gamelogReview,
      admiralsTurns.length,
      hasGamelogTerminalStep
    );
  }, [gamelogReview, admiralsTurns.length, hasGamelogTerminalStep]);

  const displayBoard = admiralsReplayAtReview?.board ?? board;
  const displayTurn = admiralsReplayAtReview?.turn ?? turn;

  // --- Outcome (natural win, resign, agreed draw) + gamelog rounds ---

  const naturalWinner = useMemo(
    () => findWinner(displayBoard, cells),
    [displayBoard, cells]
  );

  const winner = useMemo(() => {
    if (inGamelogReview && gamelogReview) {
      const atTerminal =
        reviewPliesClamped === admiralsTurns.length &&
        gamelogReview.includeTermination;
      if (atTerminal && termination === "agreed_draw") {
        return /** @type {const} */ ("draw");
      }
      if (atTerminal && termination === "resign" && resignedWinner) {
        return resignedWinner;
      }
      return naturalWinner;
    }
    if (termination === "agreed_draw") return /** @type {const} */ ("draw");
    if (termination === "resign" && resignedWinner) return resignedWinner;
    return naturalWinner;
  }, [
    inGamelogReview,
    gamelogReview,
    reviewPliesClamped,
    admiralsTurns.length,
    termination,
    resignedWinner,
    naturalWinner,
  ]);

  /** Center column: no board input while idle, reviewing, or finished. */
  const isBoardInactive =
    !practiceSessionActive || inGamelogReview || winner != null;

  /** Practice only when not in review and not mid-match. */
  const practiceDisabled =
    inGamelogReview || (practiceSessionActive && winner == null);
  const canConfirmAiChallenge = ADMIRALS_BOT_OPTIONS.some(
    (bot) => bot.value === selectedAiBotId
  );

  /**
   * Request Draw / Resign: only after Practice → Confirm, not in review, not after a result.
   * Grouped with `practiceDisabled` / `isBoardInactive` as shared session rules.
   */
  const canRequestDrawOrResign =
    practiceSessionActive && winner == null && !inGamelogReview;

  const gamelogRounds = useMemo(
    () => admiralsTurnsToGamelogRounds(admiralsTurns),
    [admiralsTurns]
  );

  useEffect(() => {
    const sentinel = gamelogEndRef.current;
    const scroller = sentinel?.closest(".gamelog-scroll");
    if (!scroller) return;
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  }, [admiralsTurns.length, termination, naturalOutcomeAtEndOfMoves]);

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

  // --- Valid move targets (no highlights during review, after outcome, or before Practice confirm)

  const validShipCells = useMemo(() => {
    if (
      inGamelogReview ||
      !practiceSessionActive ||
      phase !== "place" ||
      !selectedAdmiralCellId ||
      winner
    )
      return new Set();
    return computeValidShipPlacements(
      board,
      cells,
      qrToId,
      selectedAdmiralCellId,
      turn
    );
  }, [
    board,
    cells,
    qrToId,
    phase,
    selectedAdmiralCellId,
    turn,
    winner,
    inGamelogReview,
    practiceSessionActive,
  ]);

  const { validMoveSurvive, validMoveDeath } = useMemo(() => {
    if (
      inGamelogReview ||
      !practiceSessionActive ||
      phase !== "move" ||
      !selectedAdmiralCellId ||
      winner
    ) {
      return {
        validMoveSurvive: new Set(),
        validMoveDeath: new Set(),
      };
    }
    const { survive, death } = computeValidAdmiralMoves(
      board,
      cells,
      qrToId,
      selectedAdmiralCellId,
      turn
    );
    return { validMoveSurvive: survive, validMoveDeath: death };
  }, [
    board,
    cells,
    qrToId,
    phase,
    selectedAdmiralCellId,
    turn,
    winner,
    inGamelogReview,
    practiceSessionActive,
  ]);

  // --- Commit full turn + advance side; pushes undo snapshot (turn start board) ---

  const commitCurrentTurnRecord = useCallback(
    (/** @type {'white'|'black'} */ player) => {
      const d = turnDraftRef.current;
      const record = {
        color: player,
        admiralFrom: d.admiralFrom ?? "",
        shipSkip: d.shipSkip,
        shipCell: d.shipSkip ? null : d.shipCell,
        moveSuicide: d.moveSuicide,
        moveCell: d.moveSuicide ? null : d.moveCell,
        moveDied: d.moveSuicide ? false : d.moveDied,
      };
      setAdmiralsTurns((prev) => [...prev, record]);
      turnDraftRef.current = emptyTurnDraft();
    },
    []
  );

  const finishTurnAndAdvance = useCallback(
    (nextBoard) => {
      const startBoard = boardAtTurnStartRef.current;
      if (startBoard) {
        setUndoStack((s) => [
          ...s,
          {
            board: cloneAdmiralsBoard(startBoard),
            turn,
            phase: /** @type {const} */ ("select"),
            selectedAdmiralCellId: null,
            draft: emptyTurnDraft(),
            admiralsTurns: [...admiralsTurns],
            termination,
            resignedWinner,
            boardAtTurnStart: null,
          },
        ]);
      }
      boardAtTurnStartRef.current = null;
      commitCurrentTurnRecord(turn);
      setBoard(nextBoard);
      const w = findWinner(nextBoard, cells);
      if (w) {
        setPhase("select");
        setSelectedAdmiralCellId(null);
        return;
      }
      setTurn((t) => (t === "white" ? "black" : "white"));
      setPhase("select");
      setSelectedAdmiralCellId(null);
    },
    [
      cells,
      turn,
      commitCurrentTurnRecord,
      admiralsTurns,
      termination,
      resignedWinner,
    ]
  );

  /**
   * Fresh opening position. Pass `forcedBoardSizeKey` from Game Settings → Confirm so the initial
   * fleet uses the chosen size even before `boardSize` state has re-rendered.
   * @param {string} [forcedBoardSizeKey]
   */
  const resetMatch = useCallback((forcedBoardSizeKey) => {
    const key =
      forcedBoardSizeKey != null ? forcedBoardSizeKey : boardSize;
    const cfg =
      ADMIRALS_BOARD_SIZE_CONFIG[key] ?? ADMIRALS_BOARD_SIZE_CONFIG["6x6x6"];
    const sideLen = cfg.sideLength;
    const gameCells = buildAdmiralsCellList(sideLen);
    if (forcedBoardSizeKey != null) {
      setBoardSize(forcedBoardSizeKey);
    }
    setBoard(createInitialAdmiralsBoard(gameCells, sideLen));
    setTurn("white");
    setPhase("select");
    setSelectedAdmiralCellId(null);
    setAdmiralsTurns([]);
    setTermination(null);
    setResignedWinner(null);
    setUndoStack([]);
    boardAtTurnStartRef.current = null;
    turnDraftRef.current = emptyTurnDraft();
    setGamelogReview(null);
  }, [boardSize]);

  const requestUndo = useCallback(() => {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setBoard(cloneAdmiralsBoard(prev.board));
      setTurn(prev.turn);
      setPhase(prev.phase);
      setSelectedAdmiralCellId(prev.selectedAdmiralCellId);
      turnDraftRef.current = cloneTurnDraft(prev.draft);
      boardAtTurnStartRef.current = prev.boardAtTurnStart
        ? cloneAdmiralsBoard(prev.boardAtTurnStart)
        : null;
      setAdmiralsTurns(prev.admiralsTurns);
      setTermination(prev.termination);
      setResignedWinner(prev.resignedWinner);
      return s.slice(0, -1);
    });
  }, []);

  // --- Phase handlers: select → place → move / suicide ---

  const selectAdmiral = useCallback(
    (cellId) => {
      if (inGamelogReview) return;
      if (!practiceSessionActive) return;
      if (winner) return;
      const cell = board[cellId];
      if (!cell) return;
      if (phase !== "select") return;
      if (turn === "white") {
        if (!cell.whiteAdmiral || cell.whiteAdmiral.dead) return;
      } else {
        if (!cell.blackAdmiral || cell.blackAdmiral.dead) return;
      }
      boardAtTurnStartRef.current = cloneAdmiralsBoard(board);
      turnDraftRef.current = {
        admiralFrom: cellId,
        shipSkip: false,
        shipCell: null,
        moveSuicide: false,
        moveCell: null,
        moveDied: false,
      };
      setSelectedAdmiralCellId(cellId);
      setPhase("place");
    },
    [board, phase, turn, winner, inGamelogReview, practiceSessionActive]
  );

  const backToSelect = useCallback(() => {
    if (boardAtTurnStartRef.current) {
      setBoard(cloneAdmiralsBoard(boardAtTurnStartRef.current));
    }
    boardAtTurnStartRef.current = null;
    turnDraftRef.current = emptyTurnDraft();
    setPhase("select");
    setSelectedAdmiralCellId(null);
  }, []);

  const onAdmiralCellClick = useCallback(
    (cellId) => {
      if (inGamelogReview) return;
      if (winner) return;
      if (
        (phase === "place" || phase === "move") &&
        cellId === selectedAdmiralCellId
      ) {
        backToSelect();
        return;
      }
      selectAdmiral(cellId);
    },
    [
      winner,
      phase,
      selectedAdmiralCellId,
      backToSelect,
      selectAdmiral,
      inGamelogReview,
    ]
  );

  const placeShip = useCallback(
    (cellId) => {
      if (inGamelogReview) return;
      if (winner || phase !== "place" || !selectedAdmiralCellId) return;
      const valid = computeValidShipPlacements(
        board,
        cells,
        qrToId,
        selectedAdmiralCellId,
        turn
      );
      if (!valid.has(cellId)) return;
      turnDraftRef.current.shipSkip = false;
      turnDraftRef.current.shipCell = cellId;
      const next = cloneAdmiralsBoard(board);
      applyShipPlacementToCell(next[cellId], turn);
      setBoard(next);
      setPhase("move");
    },
    [
      board,
      cells,
      qrToId,
      phase,
      selectedAdmiralCellId,
      turn,
      winner,
      inGamelogReview,
    ]
  );

  const moveAdmiral = useCallback(
    (toId) => {
      if (inGamelogReview) return;
      if (winner || phase !== "move" || !selectedAdmiralCellId) return;
      const { survive, death } = computeValidAdmiralMoves(
        board,
        cells,
        qrToId,
        selectedAdmiralCellId,
        turn
      );
      if (!survive.has(toId) && !death.has(toId)) return;
      const dies = wouldAdmiralDieAfterMove(turn, board[toId]);
      turnDraftRef.current.moveSuicide = false;
      turnDraftRef.current.moveCell = toId;
      turnDraftRef.current.moveDied = dies;
      const next = cloneAdmiralsBoard(board);
      const from = selectedAdmiralCellId;
      if (turn === "white") {
        next[from].whiteAdmiral = null;
        next[toId].whiteAdmiral = { dead: dies };
      } else {
        next[from].blackAdmiral = null;
        next[toId].blackAdmiral = { dead: dies };
      }
      finishTurnAndAdvance(next);
    },
    [
      board,
      cells,
      qrToId,
      phase,
      selectedAdmiralCellId,
      turn,
      winner,
      finishTurnAndAdvance,
      inGamelogReview,
    ]
  );

  const backToPlace = useCallback(() => {
    const from = selectedAdmiralCellId;
    const start = boardAtTurnStartRef.current;
    if (!from || !start) return;
    setBoard(cloneAdmiralsBoard(start));
    turnDraftRef.current = {
      admiralFrom: from,
      shipSkip: false,
      shipCell: null,
      moveSuicide: false,
      moveCell: null,
      moveDied: false,
    };
    setPhase("place");
  }, [selectedAdmiralCellId]);

  const skipPlace = useCallback(() => {
    if (phase !== "place") return;
    turnDraftRef.current.shipSkip = true;
    turnDraftRef.current.shipCell = null;
    setPhase("move");
  }, [phase]);

  const suicideInPlace = useCallback(() => {
    if (inGamelogReview) return;
    if (winner || phase !== "move" || !selectedAdmiralCellId) return;
    turnDraftRef.current.moveSuicide = true;
    turnDraftRef.current.moveCell = null;
    turnDraftRef.current.moveDied = false;
    const next = cloneAdmiralsBoard(board);
    const cell = next[selectedAdmiralCellId];
    if (turn === "white" && cell.whiteAdmiral) cell.whiteAdmiral.dead = true;
    else if (turn === "black" && cell.blackAdmiral) cell.blackAdmiral.dead = true;
    finishTurnAndAdvance(next);
  }, [
    board,
    phase,
    selectedAdmiralCellId,
    turn,
    winner,
    finishTurnAndAdvance,
    inGamelogReview,
  ]);

  const resign = useCallback(() => {
    if (inGamelogReview) return;
    if (!practiceSessionActive) return;
    if (winner != null) return;
    setUndoStack((s) => [
      ...s,
      {
        board: cloneAdmiralsBoard(board),
        turn,
        phase,
        selectedAdmiralCellId,
        draft: cloneTurnDraft(turnDraftRef.current),
        admiralsTurns: [...admiralsTurns],
        termination,
        resignedWinner,
        boardAtTurnStart: boardAtTurnStartRef.current
          ? cloneAdmiralsBoard(boardAtTurnStartRef.current)
          : null,
      },
    ]);
    setResignedWinner(turn === "white" ? "black" : "white");
    setTermination("resign");
    setPhase("select");
    setSelectedAdmiralCellId(null);
    boardAtTurnStartRef.current = null;
    turnDraftRef.current = emptyTurnDraft();
  }, [
    winner,
    turn,
    board,
    phase,
    selectedAdmiralCellId,
    admiralsTurns,
    termination,
    resignedWinner,
    inGamelogReview,
    practiceSessionActive,
  ]);

  /**
   * Same snapshot + mid-turn cleanup as {@link resign}; records `agreed_draw` without setting
   * `resignedWinner`.
   */
  const agreedDraw = useCallback(() => {
    if (inGamelogReview) return;
    if (!practiceSessionActive) return;
    if (winner != null) return;
    setUndoStack((s) => [
      ...s,
      {
        board: cloneAdmiralsBoard(board),
        turn,
        phase,
        selectedAdmiralCellId,
        draft: cloneTurnDraft(turnDraftRef.current),
        admiralsTurns: [...admiralsTurns],
        termination,
        resignedWinner,
        boardAtTurnStart: boardAtTurnStartRef.current
          ? cloneAdmiralsBoard(boardAtTurnStartRef.current)
          : null,
      },
    ]);
    setTermination("agreed_draw");
    setPhase("select");
    setSelectedAdmiralCellId(null);
    boardAtTurnStartRef.current = null;
    turnDraftRef.current = emptyTurnDraft();
  }, [
    winner,
    turn,
    board,
    phase,
    selectedAdmiralCellId,
    admiralsTurns,
    termination,
    resignedWinner,
    inGamelogReview,
    practiceSessionActive,
  ]);

  // --- Gamelog file I/O (`serializeAdmiralsGamelog`); import restores `undoStack` from replay ---

  const downloadGamelog = useCallback(() => {
    const json = serializeAdmiralsGamelog(admiralsTurns, termination, {
      boardSize,
    });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.gamelogFilePrefix}-gamelog-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [admiralsTurns, termination, config.gamelogFilePrefix, boardSize]);

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
            turns,
            termination: importedTermination,
            boardSize: importedBoardSize,
          } =
            parseAdmiralsGamelogJson(text);
          const importedBoardConfig =
            ADMIRALS_BOARD_SIZE_CONFIG[importedBoardSize] ?? null;
          if (!importedBoardConfig) {
            throw new Error(
              `Unsupported Admirals board size in gamelog: ${importedBoardSize}.`
            );
          }
          const importedCells = buildAdmiralsCellList(importedBoardConfig.sideLength);
          const replayed = replayAdmiralsGame(
            turns,
            importedCells,
            importedTermination,
            importedBoardConfig.sideLength
          );
          setBoardSize(importedBoardSize);
          setBoard(replayed.board);
          setTurn(replayed.turn);
          setAdmiralsTurns(replayed.turns);
          setPhase("select");
          setSelectedAdmiralCellId(null);
          turnDraftRef.current = emptyTurnDraft();
          setTermination(replayed.termination);
          setResignedWinner(replayed.resignedWinner);
          setUndoStack(replayed.undoStack);
          boardAtTurnStartRef.current = null;
          setGameOverModalDismissed(false);
          setGamelogReview(null);
          setPracticeSessionActive(true);
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

  const skipPlacementEnabled =
    phase === "place" && validShipCells.size === 0;
  const canSuicide =
    phase === "move" &&
    validMoveSurvive.size === 0 &&
    validMoveDeath.size === 0;

  /** Game Settings → Confirm: apply draft board size, opening fleet, allow play. */
  const confirmPracticeSettings = useCallback(() => {
    resetMatch(draftBoardSize);
    setPracticeSessionActive(true);
    setGameSettingsOpen(false);
  }, [resetMatch, draftBoardSize]);
  const confirmAiChallenge = useCallback(() => {
    if (!canConfirmAiChallenge) return;
    setChallengeAiOpen(false);
  }, [canConfirmAiChallenge]);

  // --- Render: site chrome, triple column, board tools, modals ---

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
        NavLink `end`: highlight only on exact route (e.g. /admirals), not subpaths.
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
                        (isActive
                          ? " brand-game-picker-link--active"
                          : "")
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
                    totalPlies={admiralsTurns.length}
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
                      <ol className="gamelog-list gamelog-list--admirals">
                        {gamelogRounds.map((r, i) => {
                          /* Turn = one full round (white + black); same idea as Sumo / Ouroboros. */
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
                          const admLogDis =
                            phase !== "select" ||
                            selectedAdmiralCellId != null;
                          return (
                            <li
                              key={i}
                              className="gamelog-line gamelog-line--admirals-round"
                            >
                              <div className="gamelog-admirals-round-line1">
                                <span className="gamelog-turn-num">
                                  {turnNum}.{" "}
                                </span>
                                <button
                                  type="button"
                                  className={
                                    "gamelog-ply-btn" +
                                    (hiWhite ? " gamelog-ply-btn--active" : "")
                                  }
                                  disabled={admLogDis}
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
                                  <span
                                    className="gamelog-ply-comma"
                                    aria-hidden="true"
                                  >
                                    ,
                                  </span>
                                ) : null}
                              </div>
                              {r.black != null ? (
                                <div className="gamelog-admirals-round-line2">
                                  <button
                                    type="button"
                                    className={
                                      "gamelog-ply-btn" +
                                      (hiBlack
                                        ? " gamelog-ply-btn--active"
                                        : "")
                                    }
                                    disabled={admLogDis}
                                    onClick={() =>
                                      setGamelogReview({
                                        plies: pliesAfterBlack,
                                        includeTermination: false,
                                      })
                                    }
                                  >
                                    {r.black}
                                  </button>
                                </div>
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
                          reviewPliesClamped === admiralsTurns.length &&
                          gamelogReview?.includeTermination
                            ? " gamelog-ply-btn--active"
                            : "")
                        }
                        disabled={
                          phase !== "select" || selectedAdmiralCellId != null
                        }
                        onClick={() =>
                          setGamelogReview({
                            plies: admiralsTurns.length,
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
              `board-wrap--inactive` + shade: no board input until Practice, while reviewing, or
              after outcome (`index.css`).
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
                (displayTurn === "white" && !winner
                  ? " player-game-bar--active"
                  : "")
              }
              role="group"
              aria-label={
                "White — time " +
                CLOCK_INFINITE_DISPLAY +
                " (no limit)."
              }
            >
              <div className="player-game-bar-identity">
                <span
                  className="player-game-admiral player-game-admiral--sidebar-white"
                  aria-hidden="true"
                  title="White admiral"
                >
                  <span className="player-game-admiral-anchor">
                    {SIDEBAR_ANCHOR_GLYPH}
                  </span>
                </span>
                <span className="player-game-name">White</span>
              </div>
              <div className="player-game-bar-stats admirals-player-bar-stats">
                {/* Spacer keeps Admirals clock anchored right like other games. */}
                <span className="admirals-player-bar-spacer mono" aria-hidden="true">
                  &nbsp;
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
              {(phase === "place" || phase === "move") &&
              !winner &&
              !inGamelogReview &&
              practiceSessionActive ? (
                <div
                  className="admirals-board-float-controls"
                  role="toolbar"
                  aria-label="Turn steps"
                >
                  {phase === "place" ? (
                    <button
                      type="button"
                      className="btn-side admirals-float-btn"
                      onClick={backToSelect}
                    >
                      Back
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-side admirals-float-btn"
                      onClick={backToPlace}
                    >
                      Back
                    </button>
                  )}
                  {phase === "place" ? (
                    <button
                      type="button"
                      className="btn-side admirals-float-btn"
                      disabled={!skipPlacementEnabled}
                      title={
                        skipPlacementEnabled
                          ? undefined
                          : "Only Available When No Alternative Available."
                      }
                      onClick={skipPlace}
                    >
                      Skip Ship Placement
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-side admirals-float-btn"
                      disabled={!canSuicide}
                      title={
                        canSuicide
                          ? undefined
                          : "Only Available When No Alternative Available."
                      }
                      onClick={suicideInPlace}
                    >
                      Die in Place
                    </button>
                  )}
                </div>
              ) : null}

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
              <AdmiralsHexBoard
                board={displayBoard}
                cells={cells}
                hexOrientation="pointy-top"
                boardCaption={boardSizeConfig.caption}
                phase={inGamelogReview ? "select" : phase}
                turn={displayTurn}
                selectedAdmiralCellId={
                  inGamelogReview ? null : selectedAdmiralCellId
                }
                validShipCells={validShipCells}
                validMoveSurvive={validMoveSurvive}
                validMoveDeath={validMoveDeath}
                onSelectAdmiral={onAdmiralCellClick}
                onPlaceShip={placeShip}
                onMoveAdmiral={moveAdmiral}
                interactive={
                  !winner && !inGamelogReview && practiceSessionActive
                }
              />
            </div>

            <div
              className={
                "player-game-bar player-game-bar--black" +
                (displayTurn === "black" && !winner
                  ? " player-game-bar--active"
                  : "")
              }
              role="group"
              aria-label={
                "Black — time " +
                CLOCK_INFINITE_DISPLAY +
                " (no limit)."
              }
            >
              <div className="player-game-bar-identity">
                <span
                  className="player-game-admiral player-game-admiral--sidebar-black"
                  aria-hidden="true"
                  title="Black admiral"
                >
                  <span className="player-game-admiral-anchor">
                    {SIDEBAR_ANCHOR_GLYPH}
                  </span>
                </span>
                <span className="player-game-name">Black</span>
              </div>
              <div className="player-game-bar-stats admirals-player-bar-stats">
                <span className="admirals-player-bar-spacer mono" aria-hidden="true">
                  &nbsp;
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

          <aside
            className="side-panel side-panel--right panel"
            aria-label="Notes and game actions"
          >
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
            aria-labelledby="admirals-game-over-modal-title"
            aria-describedby="admirals-game-over-modal-kicker"
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
              id="admirals-game-over-modal-kicker"
              className="game-over-modal-kicker"
            >
              {gameOverModalKicker(termination)}
            </p>
            <p
              id="admirals-game-over-modal-title"
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
        titleId="admirals-game-settings-title"
        boardSizeOptions={ADMIRALS_BOARD_SIZE_OPTIONS}
        boardSizeValue={draftBoardSize}
        onBoardSizeChange={setDraftBoardSize}
      />

      <ChallengeAiModal
        open={challengeAiOpen}
        onClose={() => setChallengeAiOpen(false)}
        onConfirm={confirmAiChallenge}
        botOptions={ADMIRALS_BOT_OPTIONS}
        botValue={selectedAiBotId}
        onBotChange={setSelectedAiBotId}
        canConfirm={canConfirmAiChallenge}
        boardSizeOptions={ADMIRALS_BOARD_SIZE_OPTIONS}
        boardSizeValue={ADMIRALS_BOARD_SIZE_OPTIONS[0]?.value ?? ""}
        titleId="admirals-challenge-ai-title"
      />

      <ThemeSettingsModal
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        theme={theme}
        setTheme={setTheme}
      />
    </div>
  );
}
