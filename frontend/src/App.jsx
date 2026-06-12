import React, { useState } from "react";
import CollectionPage from "./pages/CollectionPage";
import AnalyticsPage  from "./pages/AnalyticsPage";
import GiftsPage      from "./pages/GiftsPage";
import AnalysisPage   from "./pages/AnalysisPage";
import AdminPage      from "./pages/AdminPage";
import TradedPage     from "./pages/TradePage";

const PAGES = [
  { id: "collection", label: "Collection"   },
  { id: "analytics",  label: "Analytics"    },
  { id: "analysis",   label: "Analysis"     },
  { id: "gifts",      label: "Gift History" },
  { id: "traded",     label: "Trades"       },
  { id: "admin",      label: "⚙️ Admin"      },
];

export default function App() {
  const [page, setPage]         = useState("collection");
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(id) { setPage(id); setMenuOpen(false); }

  return (
    <>
      <nav className="site-nav">
        <div className="nav-inner">
          <div className="nav-logo">Jacob's <span>Comic Books</span></div>
          <div className="nav-links">
            {PAGES.map(p => (
              <button key={p.id} className={`nav-link ${page === p.id ? "active" : ""}`}
                onClick={() => navigate(p.id)}>{p.label}</button>
            ))}
          </div>
          <a className="locg-btn"
            href="https://leagueofcomicgeeks.com/profile/GreyWarden247/collection"
            target="_blank" rel="noreferrer">LoCG ↗</a>
          <button className="nav-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      <div className={`nav-drawer ${menuOpen ? "open" : ""}`}>
        {PAGES.map(p => (
          <button key={p.id} className={`nav-link ${page === p.id ? "active" : ""}`}
            onClick={() => navigate(p.id)}>{p.label}</button>
        ))}
        <a className="nav-link" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" }}
          href="https://leagueofcomicgeeks.com/profile/GreyWarden247/collection"
          target="_blank" rel="noreferrer">League of Comic Geeks ↗</a>
      </div>

      {page === "collection" && <CollectionPage />}
      {page === "analytics"  && <AnalyticsPage  />}
      {page === "analysis"   && <AnalysisPage   />}
      {page === "gifts"      && <GiftsPage       />}
      {page === "traded"     && <TradePage      />}
      {page === "admin"      && <AdminPage       />}
    </>
  );
}
