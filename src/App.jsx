/**
 * Router: `/` is the site landing (`pages/HomePage.jsx`); each game path comes
 * from `shared/gameRegistry.js` and mounts the matching shell component.
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import { SumoGameShell } from "./sumo/SumoGameShell.jsx";
import { AdmiralsGameShell } from "./admirals/AdmiralsGameShell.jsx";
import { OuroborosGameShell } from "./ouroboros/OuroborosGameShell.jsx";
import { MimoveyumoveGameShell } from "./mimoveyumove/MimoveyumoveGameShell.jsx";
import { SITE_GAMES } from "./shared/gameRegistry.js";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {SITE_GAMES.map((g) => (
          <Route
            key={g.id}
            path={g.path}
            element={
              g.boardKind === "admirals" ? (
                <AdmiralsGameShell config={g} />
              ) : g.boardKind === "ouroboros" ? (
                <OuroborosGameShell config={g} />
              ) : g.boardKind === "mimoveyumove" ? (
                <MimoveyumoveGameShell config={g} />
              ) : (
                <SumoGameShell config={g} />
              )
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
