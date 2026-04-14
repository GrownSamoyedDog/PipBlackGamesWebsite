/**
 * Mimoveyumove match shell.
 *
 * Rule engine lives in `mimoveyumoveLogic.js`:
 * - legal actions (LOS + anti-overline),
 * - Yugo creation/removal,
 * - Igo / Wego end checks,
 * - post-Igo shape highlighting inputs.
 *
 * This shell focuses on UI orchestration (selection, highlights, modals, gamelog, theme).
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { SITE_GAMES } from "../shared/gameRegistry.js";
import { ThemeSettingsModal } from "../shared/ThemeSettingsModal.jsx";
import { GameSettingsModal } from "../shared/GameSettingsModal.jsx";
import { ChallengeAiModal } from "../shared/ChallengeAiModal.jsx";
import { SiteTopNav } from "../shared/SiteTopNav.jsx";
import { SiteHomepageLink } from "../shared/SiteHomepageLink.jsx";
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
  movesToGamelogRounds,
  serializeMimoveGamelog,
  parseMimoveGamelogJson,
  replayMimoveGameForImport,
  replayMimoveStateAtPlies,
} from "./mimoveyumoveGamelog.js";
import {
  MIMO_PIECE_WHITE_MIGO,
  MIMO_PIECE_WHITE_YUGO,
  MIMO_PIECE_WHITE_SPAWNER,
  MIMO_PIECE_BLACK_MIGO,
  MIMO_PIECE_BLACK_YUGO,
  MIMO_PIECE_BLACK_SPAWNER,
  MIMO_FILES,
  createInitialMimoBoard,
  normalizeMimoPiece,
  mimoPieceColor,
  mimoPieceRole,
  collectLegalTargets,
  applyMimoAction,
  computeMimoYugoScores,
  evaluateIgoWinner,
  collectIgoHighlightCoords,
  evaluateWegoOutcome,
  playerHasAnyLegalAction,
  isInteriorFull,
} from "./mimoveyumoveLogic.js";
import "./MimoveyumoveGameShell.css";

const MIMO_BOARD_SIZE_OPTIONS = [{ value: "8x8", label: "8x8" }];
const MIMO_BOARD_SIZE_CONFIG = {
  // `8x8` is the playable interior; physical coordinates remain 10x10 with edge spawners.
  "8x8": { size: 10, caption: "Standard Board: 8x8" },
  // Backward compatibility for older imports that saved the physical-grid label.
  "10x10": { size: 10, caption: "Standard Board: 8x8" },
};
const MIMO_BOT_OPTIONS = [];
const CLOCK_INFINITE_DISPLAY = "99:99";

/**
 * @param {number} boardSize
 * @returns {{ id: string, label: string, isEdge: boolean }[]}
 */
function buildSquareCells(boardSize) {
  return Array.from({ length: boardSize * boardSize }, (_, index) => {
    const row = Math.floor(index / boardSize) + 1;
    const col = (index % boardSize) + 1;
    const file = MIMO_FILES[col - 1] ?? String.fromCharCode(96 + col);
    const rank = boardSize - row;
    const coord = `${file}${rank}`;
    const isEdge = row === 1 || row === boardSize || col === 1 || col === boardSize;
    return { id: coord, label: coord, isEdge };
  });
}

/**
 * @typedef {{
 *   board: Record<string, string>,
 *   turn: 'white'|'black',
 *   moveHistory: string[],
 *   lastPlacedId: string | null,
 *   naturalOutcome: 'white'|'black'|'draw'|null,
 *   termination: null | 'resign' | 'agreed_draw' | 'igo_win' | 'wego_win' | 'wego_draw',
 * }} MimoveUndoSnapshot
 */

/** @param {{ config: import("../shared/gameRegistry.js").SiteGameConfig }} props */
export function MimoveyumoveGameShell({ config }) {
  useSyncGameViewportHeight();
  const [boardSize, setBoardSize] = useState("8x8");
  const boardSizeConfig =
    MIMO_BOARD_SIZE_CONFIG[boardSize] ?? MIMO_BOARD_SIZE_CONFIG["8x8"];
  const boardSizeN = boardSizeConfig.size;
  const cells = useMemo(() => buildSquareCells(boardSizeN), [boardSizeN]);

  const [board, setBoard] = useState(() => createInitialMimoBoard());
  const [turn, setTurn] = useState("white");
  const [lastPlacedId, setLastPlacedId] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [notepad, setNotepad] = useState("");
  const [undoStack, setUndoStack] = useState(
    /** @type {MimoveUndoSnapshot[]} */ ([])
  );
  const [resignedWinner, setResignedWinner] = useState(
    /** @type {'white'|'black'|null} */ (null)
  );
  const [naturalOutcome, setNaturalOutcome] = useState(
    /** @type {'white'|'black'|'draw'|null} */ (null)
  );
  const [termination, setTermination] = useState(
    /** @type {null | 'resign' | 'agreed_draw' | 'igo_win' | 'wego_win' | 'wego_draw'} */ (null)
  );
  const [selectedAction, setSelectedAction] = useState(
    /** @type {{ source: string, mode: 'spawn' | 'move' } | null} */ (null)
  );

  const [theme, setTheme] = useState(() => mergeTheme(loadStoredTheme()));
  const [themeOpen, setThemeOpen] = useState(false);

  const [practiceSessionActive, setPracticeSessionActive] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [draftBoardSize, setDraftBoardSize] = useState("8x8");

  const [challengeAiOpen, setChallengeAiOpen] = useState(false);
  const [selectedAiBotId, setSelectedAiBotId] = useState("");
  const canConfirmAiChallenge = MIMO_BOT_OPTIONS.some(
    (bot) => bot.value === selectedAiBotId
  );

  /**
   * Interactive destinations for the currently selected piece.
   * Rule pipeline (in logic module): LOS -> interior-only -> anti-overline (>4 blocked).
   */
  const availableTargetSet = useMemo(() => {
    if (!selectedAction) return new Set();
    const sourcePiece = normalizeMimoPiece(board[selectedAction.source]);
    const sourceColor = mimoPieceColor(sourcePiece);
    if (!sourcePiece || sourceColor !== turn) return new Set();
    if (
      (selectedAction.mode === "spawn" && mimoPieceRole(sourcePiece) !== "spawner") ||
      (selectedAction.mode === "move" && mimoPieceRole(sourcePiece) !== "migo")
    ) {
      return new Set();
    }
    return collectLegalTargets(board, selectedAction.source, selectedAction.mode, turn);
  }, [selectedAction, board, turn]);

  const gameSettingsWasOpenRef = useRef(false);
  useEffect(() => {
    if (gameSettingsOpen && !gameSettingsWasOpenRef.current) {
      setDraftBoardSize(boardSize);
    }
    gameSettingsWasOpenRef.current = gameSettingsOpen;
  }, [gameSettingsOpen, boardSize]);

  const themeCss = useMemo(() => themeToCssVars(theme), [theme]);
  const gamelogEndRef = useRef(null);
  const gamelogFileInputRef = useRef(null);

  const [gameOverModalDismissed, setGameOverModalDismissed] = useState(false);
  const [gamelogReview, setGamelogReview] = useState(
    /** @type {{ plies: number, includeTermination: boolean } | null} */ (null)
  );
  const exitGamelogReview = useCallback(() => setGamelogReview(null), []);
  const inGamelogReview = gamelogReview != null;

  const reviewPliesClamped = useMemo(() => {
    if (!gamelogReview) return 0;
    return Math.min(Math.max(0, gamelogReview.plies), moveHistory.length);
  }, [gamelogReview, moveHistory.length]);

  const atGameEndReview =
    inGamelogReview &&
    gamelogReview != null &&
    reviewPliesClamped === moveHistory.length &&
    gamelogReview.includeTermination;

  const dismissGameOverModal = useCallback(() => {
    setGameOverModalDismissed(true);
    if (atGameEndReview) exitGamelogReview();
  }, [atGameEndReview, exitGamelogReview]);

  const naturalOutcomeAtEndOfMoves = naturalOutcome;

  const hasGamelogTerminalStep = useMemo(
    () => gamelogReviewHasTerminalStep(termination, naturalOutcomeAtEndOfMoves),
    [termination, naturalOutcomeAtEndOfMoves]
  );

  const gamelogReviewFraction = useMemo(() => {
    if (!gamelogReview) return null;
    return gamelogReviewDisplayFraction(
      gamelogReview,
      moveHistory.length,
      hasGamelogTerminalStep
    );
  }, [gamelogReview, moveHistory.length, hasGamelogTerminalStep]);

  /**
   * Review mode replays from the opening position at the selected ply.
   * This mirrors the board-scrub behavior already used by the other games.
   */
  const replayAtReview = useMemo(() => {
    if (!gamelogReview) return null;
    return replayMimoveStateAtPlies(moveHistory, cells, reviewPliesClamped);
  }, [gamelogReview, moveHistory, cells, reviewPliesClamped]);
  const displayBoard = replayAtReview ? replayAtReview.board : board;
  const displayTurn = replayAtReview ? replayAtReview.turn : turn;
  const yugoScores = useMemo(
    () => computeMimoYugoScores(displayBoard),
    [displayBoard]
  );
  /**
   * Post-game Igo overlay. Keep all exact-4 Yugo lines highlighted, including
   * multi-line outcomes, so the decisive shape remains visible.
   */
  const igoHighlightCoords = useMemo(() => {
    if (termination !== "igo_win") return new Set();
    if (naturalOutcome !== "white" && naturalOutcome !== "black") return new Set();
    const atFinalBoardOfFinishedMatch =
      !inGamelogReview || reviewPliesClamped === moveHistory.length;
    if (!atFinalBoardOfFinishedMatch) return new Set();
    return collectIgoHighlightCoords(displayBoard, naturalOutcome);
  }, [
    termination,
    naturalOutcome,
    inGamelogReview,
    reviewPliesClamped,
    moveHistory.length,
    displayBoard,
  ]);

  const winner = useMemo(() => {
    if (inGamelogReview && gamelogReview) {
      const atTerminal =
        reviewPliesClamped === moveHistory.length &&
        gamelogReview.includeTermination;
      if (atTerminal && termination === "agreed_draw") return "draw";
      if (atTerminal && termination === "wego_draw") return "draw";
      if (atTerminal && termination === "resign" && resignedWinner) {
        return resignedWinner;
      }
      if (
        atTerminal &&
        (termination === "igo_win" || termination === "wego_win") &&
        naturalOutcome
      ) {
        return naturalOutcome;
      }
      return null;
    }
    if (termination === "agreed_draw") return "draw";
    if (termination === "wego_draw") return "draw";
    if (termination === "resign") return resignedWinner;
    if (termination === "igo_win" || termination === "wego_win") {
      return naturalOutcome;
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

  const practiceDisabled =
    inGamelogReview || (practiceSessionActive && winner == null);
  const isBoardInactive =
    !practiceSessionActive || inGamelogReview || winner != null;
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

  useEffect(() => {
    if (winner == null) setGameOverModalDismissed(false);
  }, [winner]);
  useEffect(() => {
    if (atGameEndReview) setGameOverModalDismissed(false);
  }, [atGameEndReview]);
  useEffect(() => {
    if (isBoardInactive) setSelectedAction(null);
  }, [isBoardInactive]);
  /**
   * Wego ending check at the start of each actionable turn:
   * - if interior 8x8 is full, or
   * - if active player has no legal spawn/move.
   */
  useEffect(() => {
    if (!practiceSessionActive || inGamelogReview || winner != null) return;
    if (selectedAction != null) return;
    const fullInterior = isInteriorFull(board);
    const hasLegalAction = playerHasAnyLegalAction(board, turn);
    if (!fullInterior && hasLegalAction) return;
    const outcome = evaluateWegoOutcome(board);
    setNaturalOutcome(outcome);
    setTermination(outcome === "draw" ? "wego_draw" : "wego_win");
  }, [
    practiceSessionActive,
    inGamelogReview,
    winner,
    selectedAction,
    board,
    turn,
  ]);

  const showGameOverModal =
    winner != null &&
    !gameOverModalDismissed &&
    (!inGamelogReview || atGameEndReview);
  const canOpenGameResultPanel =
    winner != null && gameOverModalDismissed && !inGamelogReview;

  const cancelSelectedAction = useCallback(() => {
    setSelectedAction(null);
  }, []);

  const onBoardCellClick = useCallback(
    (coord) => {
      if (isBoardInactive) return;
      const piece = normalizeMimoPiece(board[coord]);
      const pieceColor = mimoPieceColor(piece);
      const pieceRole = mimoPieceRole(piece);

      // Alternate cancel UX: clicking the already-selected source toggles selection off.
      if (selectedAction && selectedAction.source === coord) {
        setSelectedAction(null);
        return;
      }

      if (selectedAction && availableTargetSet.has(coord)) {
        const sourcePiece = normalizeMimoPiece(board[selectedAction.source]);
        if (!sourcePiece) return;
        const sourceColor = mimoPieceColor(sourcePiece);
        if (sourceColor !== turn) return;
        const actionNotationPrefix = selectedAction.mode === "spawn" ? "S" : "M";
        const actionResult = applyMimoAction(
          board,
          { source: selectedAction.source, target: coord, mode: selectedAction.mode },
          turn
        );
        const nextBoard = actionResult.board;
        const yugoStars =
          actionResult.yugoLineCount > 0
            ? "*".repeat(Math.min(4, actionResult.yugoLineCount))
            : "";
        const nextMoveNotation = `${actionNotationPrefix}${selectedAction.source}-${coord}${yugoStars}`;
        const igoWinner = evaluateIgoWinner(nextBoard, turn);

        setUndoStack((s) => [
          ...s,
          {
            board: { ...board },
            turn,
            moveHistory: [...moveHistory],
            lastPlacedId,
            naturalOutcome,
            resignedWinner,
            termination,
          },
        ]);

        setBoard(nextBoard);
        setMoveHistory((h) => [...h, nextMoveNotation]);
        setLastPlacedId(coord);
        setSelectedAction(null);
        if (igoWinner) {
          setNaturalOutcome(igoWinner);
          setTermination("igo_win");
        } else {
          setTurn((prev) => (prev === "white" ? "black" : "white"));
        }
        return;
      }

      if (!piece || pieceColor !== turn) return;
      if (pieceRole === "spawner") {
        if (collectLegalTargets(board, coord, "spawn", turn).size === 0) return;
        setSelectedAction({ source: coord, mode: "spawn" });
        return;
      }
      if (pieceRole === "migo") {
        if (collectLegalTargets(board, coord, "move", turn).size === 0) return;
        setSelectedAction({ source: coord, mode: "move" });
      }
    },
    [
      isBoardInactive,
      board,
      selectedAction,
      availableTargetSet,
      turn,
      moveHistory,
      lastPlacedId,
      naturalOutcome,
      resignedWinner,
      termination,
    ]
  );

  const requestUndo = useCallback(() => {
    setUndoStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setBoard(prev.board);
      setTurn(prev.turn);
      setMoveHistory(prev.moveHistory);
      setLastPlacedId(prev.lastPlacedId);
      setNaturalOutcome(prev.naturalOutcome ?? null);
      setResignedWinner(prev.resignedWinner);
      setTermination(prev.termination ?? null);
      setSelectedAction(null);
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
        turn,
        moveHistory: [...moveHistory],
        lastPlacedId,
        naturalOutcome,
        resignedWinner,
        termination,
      },
    ]);
    setNaturalOutcome(null);
    setResignedWinner(turn === "white" ? "black" : "white");
    setTermination("resign");
    setSelectedAction(null);
  }, [
    practiceSessionActive,
    winner,
    board,
    turn,
    moveHistory,
    lastPlacedId,
    naturalOutcome,
    resignedWinner,
    termination,
  ]);

  const agreedDraw = useCallback(() => {
    if (!practiceSessionActive) return;
    if (winner != null) return;
    setUndoStack((s) => [
      ...s,
      {
        board: { ...board },
        turn,
        moveHistory: [...moveHistory],
        lastPlacedId,
        naturalOutcome,
        resignedWinner,
        termination,
      },
    ]);
    setNaturalOutcome(null);
    setTermination("agreed_draw");
    setSelectedAction(null);
  }, [
    practiceSessionActive,
    winner,
    board,
    turn,
    moveHistory,
    lastPlacedId,
    naturalOutcome,
    resignedWinner,
    termination,
  ]);

  const downloadGamelog = useCallback(() => {
    const json = serializeMimoveGamelog(moveHistory, termination, winner, { boardSize });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.gamelogFilePrefix}-gamelog-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [moveHistory, termination, winner, config.gamelogFilePrefix, boardSize]);

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
          } = parseMimoveGamelogJson(text);
          const importedConfig = MIMO_BOARD_SIZE_CONFIG[importedBoardSize] ?? null;
          if (!importedConfig) {
            throw new Error(
              `Unsupported Mimoveyumove board size in gamelog: ${importedBoardSize}.`
            );
          }
          const importedCells = buildSquareCells(importedConfig.size);
          const {
            board: nextBoard,
            turn: nextTurn,
            lastPlacedId: nextLast,
            moveHistory: nextHistory,
            undoStack: nextUndo,
          } = replayMimoveGameForImport(moves, importedCells, importedTermination);
          setBoardSize(importedBoardSize);
          setBoard(nextBoard);
          setTurn(nextTurn);
          setMoveHistory(nextHistory);
          setLastPlacedId(nextLast);
          setUndoStack(nextUndo);
          setResignedWinner(null);
          setNaturalOutcome(null);
          setTermination(null);
          setSelectedAction(null);
          setGameOverModalDismissed(false);
          setGamelogReview(null);
          setPracticeSessionActive(true);
          if (importedTermination === "resign") {
            setResignedWinner(nextTurn === "white" ? "black" : "white");
            setTermination("resign");
          } else if (importedTermination === "agreed_draw") {
            setTermination("agreed_draw");
          } else if (importedTermination === "igo_win" || importedTermination === "wego_win") {
            setNaturalOutcome(
              importedWinner === "white" || importedWinner === "black"
                ? importedWinner
                : nextTurn === "white"
                  ? "black"
                  : "white"
            );
            setTermination(importedTermination);
          } else if (importedTermination === "wego_draw") {
            setNaturalOutcome("draw");
            setTermination("wego_draw");
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

  const newGame = useCallback(() => {
    setBoard(createInitialMimoBoard());
    setTurn("white");
    setLastPlacedId(null);
    setMoveHistory([]);
    setUndoStack([]);
    setResignedWinner(null);
    setNaturalOutcome(null);
    setTermination(null);
    setSelectedAction(null);
    setGamelogReview(null);
  }, []);

  const confirmPracticeSettings = useCallback(() => {
    setBoardSize(draftBoardSize);
    newGame();
    setPracticeSessionActive(true);
    setGameSettingsOpen(false);
  }, [draftBoardSize, newGame]);

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
          <aside className="side-panel side-panel--left panel" aria-label="Move log and actions">
            <div className="side-action-buttons" role="group" aria-label="Game actions">
              <button
                type="button"
                className="btn-side"
                onClick={requestUndo}
                disabled={undoStack.length === 0 || inGamelogReview}
              >
                Request Undo
              </button>
              <button
                type="button"
                className="btn-side"
                onClick={agreedDraw}
                disabled={!canRequestDrawOrResign}
              >
                Request Draw
              </button>
              <button
                type="button"
                className="btn-side"
                onClick={resign}
                disabled={!canRequestDrawOrResign}
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
                      Review Ply: {gamelogReviewFraction.num}/{gamelogReviewFraction.den}
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
              <div className="gamelog-scroll mono" role="log" aria-live="polite">
                {gamelogRounds.length === 0 && !hasGamelogTerminalStep ? (
                  <p className="gamelog-empty">No moves yet.</p>
                ) : (
                  <>
                    {gamelogRounds.length > 0 ? (
                      <ol className="gamelog-list gamelog-list--by-turn">
                        {gamelogRounds.map((r, i) => {
                          const turnNum = i + 1;
                          const pliesAfterWhite = 2 * i + 1;
                          const pliesAfterBlack = r.black != null ? 2 * i + 2 : null;
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
                            <li key={i} className="gamelog-line gamelog-line--with-ply">
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
                                  <span className="gamelog-ply-comma" aria-hidden="true">
                                    ,
                                  </span>{" "}
                                  <button
                                    type="button"
                                    className={
                                      "gamelog-ply-btn" +
                                      (hiBlack ? " gamelog-ply-btn--active" : "")
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

          <section
            className={
              "board-wrap board-wrap--center board-wrap--stacked" +
              (inGamelogReview ? " board-wrap--gamelog-review" : "") +
              (isBoardInactive ? " board-wrap--inactive" : "")
            }
            aria-label="Mimoveyumove board"
          >
            <div
              className={
                "player-game-bar player-game-bar--white" +
                (displayTurn === "white" && winner == null
                  ? " player-game-bar--active"
                  : "")
              }
            >
              <div className="player-game-bar-identity">
                <span className="player-game-piece player-game-piece--white" aria-hidden="true" />
                <span className="player-game-name">White</span>
              </div>
              <div className="player-game-bar-stats">
                <span className="player-game-score-line mono">
                  Yugo Score: {yugoScores.white}
                </span>
                <span className="player-game-clock mono">{CLOCK_INFINITE_DISPLAY}</span>
              </div>
            </div>

            <div className="board-stage-inner">
              {selectedAction ? (
                <div className="mimo-board-float-controls" role="toolbar" aria-label="Action controls">
                  <button
                    type="button"
                    className="btn-side mimo-float-btn"
                    onClick={cancelSelectedAction}
                    title="Cancel selected action"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="board-corner-actions" role="toolbar" aria-label="Board tools">
                <button
                  type="button"
                  className="board-floating-icon-btn board-game-result-btn"
                  disabled={!canOpenGameResultPanel}
                  onClick={() => setGameOverModalDismissed(false)}
                  aria-label="Show game result"
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

              <div className="mimo-board-stage">
                <div className="mimo-square-grid-wrap">
                  <div
                    className="mimo-square-grid"
                    role="grid"
                    aria-label={`${boardSizeN} by ${boardSizeN} square grid`}
                    style={{ "--mimo-board-size": boardSizeN }}
                  >
                    {cells.map((cell) => (
                      (() => {
                        const piece = normalizeMimoPiece(displayBoard[cell.label]);
                        const pieceColor = mimoPieceColor(piece);
                        const pieceRole = mimoPieceRole(piece);
                        const isWhitePiece =
                          piece === MIMO_PIECE_WHITE_MIGO ||
                          piece === MIMO_PIECE_WHITE_YUGO ||
                          piece === MIMO_PIECE_WHITE_SPAWNER;
                        const isYugo =
                          piece === MIMO_PIECE_WHITE_YUGO || piece === MIMO_PIECE_BLACK_YUGO;
                        const isSpawner =
                          piece === MIMO_PIECE_WHITE_SPAWNER ||
                          piece === MIMO_PIECE_BLACK_SPAWNER;
                        const isSelectedSource = selectedAction?.source === cell.label;
                        const isActionTarget = selectedAction != null && availableTargetSet.has(cell.label);
                        const isTurnStartMigoHint =
                          selectedAction == null &&
                          !isBoardInactive &&
                          pieceColor === turn &&
                          pieceRole === "migo";
                        const isTurnStartSpawnerHint =
                          selectedAction == null &&
                          !isBoardInactive &&
                          pieceColor === turn &&
                          pieceRole === "spawner";
                        return (
                          <button
                            key={cell.id}
                            type="button"
                            className={
                              "mimo-square-cell" +
                              (cell.isEdge ? " mimo-square-cell--edge" : "") +
                              (isTurnStartMigoHint ? " mimo-square-cell--hint-migo" : "") +
                              (isTurnStartSpawnerHint ? " mimo-square-cell--hint-spawner" : "") +
                              (isSelectedSource ? " mimo-square-cell--selected" : "") +
                              (isActionTarget ? " mimo-square-cell--target" : "")
                            }
                            role="gridcell"
                            aria-label={`Square ${cell.label}`}
                            onClick={() => onBoardCellClick(cell.label)}
                            disabled={isBoardInactive}
                          >
                            {igoHighlightCoords.has(cell.label) ? (
                              <span className="mimo-igo-cell-highlight" aria-hidden="true" />
                            ) : null}
                            {piece ? (
                              <span
                                className={
                                  "mimo-piece " +
                                  (isWhitePiece ? "mimo-piece--white" : "mimo-piece--black")
                                }
                                aria-hidden="true"
                              >
                                {isYugo ? (
                                  <span className="mimo-piece-mark mimo-piece-mark--yugo" />
                                ) : null}
                                {isSpawner ? (
                                  <span
                                    className={
                                      "mimo-piece-mark mimo-piece-mark--spawner " +
                                      (isWhitePiece
                                        ? "mimo-piece-mark--spawner-dark"
                                        : "mimo-piece-mark--spawner-light")
                                    }
                                  >
                                    ∞
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                            <span
                              className={
                                "mimo-square-coord" + (cell.isEdge ? " mimo-square-coord--edge" : "")
                              }
                              aria-hidden="true"
                            >
                              {cell.label}
                            </span>
                          </button>
                        );
                      })()
                    ))}
                  </div>
                </div>
                <p className="hex-legend">{boardSizeConfig.caption}</p>
              </div>
            </div>

            <div
              className={
                "player-game-bar player-game-bar--black" +
                (displayTurn === "black" && winner == null
                  ? " player-game-bar--active"
                  : "")
              }
            >
              <div className="player-game-bar-identity">
                <span className="player-game-piece player-game-piece--black" aria-hidden="true" />
                <span className="player-game-name">Black</span>
              </div>
              <div className="player-game-bar-stats">
                <span className="player-game-score-line mono">
                  Yugo Score: {yugoScores.black}
                </span>
                <span className="player-game-clock mono">{CLOCK_INFINITE_DISPLAY}</span>
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
              <label htmlFor={`notepad-${config.id}`} className="side-panel-heading notepad-label">
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
            aria-labelledby="mimo-game-over-modal-title"
            aria-describedby="mimo-game-over-modal-kicker"
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
            <p id="mimo-game-over-modal-kicker" className="game-over-modal-kicker">
              {gameOverModalKicker(termination)}
            </p>
            <p id="mimo-game-over-modal-title" className="game-over-modal-title">
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
        titleId="mimo-game-settings-title"
        boardSizeOptions={MIMO_BOARD_SIZE_OPTIONS}
        boardSizeValue={draftBoardSize}
        onBoardSizeChange={setDraftBoardSize}
      />

      <ChallengeAiModal
        open={challengeAiOpen}
        onClose={() => setChallengeAiOpen(false)}
        onConfirm={confirmAiChallenge}
        botOptions={MIMO_BOT_OPTIONS}
        botValue={selectedAiBotId}
        onBotChange={setSelectedAiBotId}
        canConfirm={canConfirmAiChallenge}
        boardSizeOptions={MIMO_BOARD_SIZE_OPTIONS}
        boardSizeValue={MIMO_BOARD_SIZE_OPTIONS[0]?.value ?? ""}
        titleId="mimo-challenge-ai-title"
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
