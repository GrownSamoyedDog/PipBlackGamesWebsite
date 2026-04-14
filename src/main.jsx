/**
 * Site entry: router (`App.jsx`), global styles (`index.css`), per-game shells
 * (`sumo/SumoGameShell.css`, `admirals/AdmiralsGameShell.css`, …), and pages
 * (e.g. `pages/HomePage.css`).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
