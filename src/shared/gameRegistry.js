/**
 * Canonical list of games: drives the header game picker, `App.jsx` routes, and
 * the `/` landing links in `pages/HomePage.jsx`. Each `GameShell` receives one
 * entry as `config`.
 *
 * @typedef {Object} SiteGameConfig
 * @property {string} id
 * @property {string} path
 * @property {string} wordmark
 * @property {string} listName
 * @property {string} ariaLabel
 * @property {'dot'|'emoji'} brandMarkType
 * @property {string | null} brandEmoji
 * @property {'dot'|'emoji'} listIconType
 * @property {string | null} listIconEmoji
 * @property {string} gamelogFilePrefix
 * @property {string} boardCaption
 * @property {string} rulesFooter
 * @property {'sumo'|'admirals'|'ouroboros'|'mimoveyumove'} boardKind which shell to mount
 */

/** @type {SiteGameConfig[]} */
export const SITE_GAMES = [
  {
    id: "sumo",
    boardKind: "sumo",
    path: "/sumo",
    wordmark: "SUMO",
    listName: "Sumo",
    ariaLabel: "Sumo",
    /** 🔴 large red circle — evoking the red sun (e.g. Japanese flag) beside Sumo’s roots. */
    brandMarkType: "emoji",
    brandEmoji: "🔴",
    listIconType: "emoji",
    listIconEmoji: "🔴",
    gamelogFilePrefix: "sumo",
    boardCaption: "Small Board: 6x6x5",
    rulesFooter:
      "Game ends when a player has a higher score at the start of their turn or when board filled.",
  },
  {
    id: "ouroboros",
    boardKind: "ouroboros",
    path: "/ouroboros",
    wordmark: "OUROBOROS",
    listName: "Ouroboros",
    ariaLabel: "Ouroboros",
    brandMarkType: "emoji",
    brandEmoji: "\uD83D\uDC0D",
    listIconType: "emoji",
    listIconEmoji: "\uD83D\uDC0D",
    gamelogFilePrefix: "ouroboros",
    boardCaption: "Small Board: 6x6",
    rulesFooter:
      "In the default Small Hoopsnake variant, the goal is to make a 3x3 ring of owned stacks. Or have the highest score when a player runs out of pieces or have each cell on the board not be empty.",
  },
  {
    id: "admirals",
    boardKind: "admirals",
    path: "/admirals",
    wordmark: "ADMIRALS",
    listName: "Admirals",
    ariaLabel: "Admirals",
    brandMarkType: "emoji",
    brandEmoji: "⚓",
    listIconType: "emoji",
    listIconEmoji: "⚓",
    gamelogFilePrefix: "admirals",
    boardCaption: "Small Board: 6x6x6",
    rulesFooter:
      "Game ends when all of one player's Admirals are dead or upon resignation.",
  },
  {
    id: "mimoveyumove",
    boardKind: "mimoveyumove",
    path: "/mimoveyumove",
    wordmark: "MIMOVEYUMOVE",
    listName: "Mimoveyumove",
    ariaLabel: "Mimoveyumove",
    brandMarkType: "emoji",
    brandEmoji: "⚪",
    listIconType: "emoji",
    listIconEmoji: "⚪",
    gamelogFilePrefix: "mimoveyumove",
    boardCaption: "Board: 10x10",
    rulesFooter:
      "The goal is to connect 4 yugos in a row, called an Igo. Or have the highest Yugo Score when no more moves are available, in what is called a Wego.",
  },
];
