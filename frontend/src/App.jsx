import React, { useState, useRef, useEffect } from "react";
import CollectionPage from "./pages/CollectionPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import GiftsPage from "./pages/GiftsPage";

const PAGES = [
  { id: "collection", label: "Collection" },
  { id: "analytics",  label: "Analytics" },
  { id: "gifts",      label: "Gift History" },
];

export default function App() {
  const [page, setPage] = useState("collection");

  return (
    <>
      <nav className="site-nav">
        <div className="nav-inner">
          <div className="nav-logo">The <span>Long Box</span></div>
          <div className="nav-links">
            {PAGES.map(p => (
              <button key={p.id} className={`nav-link ${page===p.id?"active":""}`}
                onClick={() => setPage(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <a
            className="locg-btn"
            href="https://leagueofcomicgeeks.com/profile/GreyWarden247/collection"
            target="_blank" rel="noreferrer"
          >
            LoCG ↗
          </a>
        </div>
      </nav>

      {page === "collection" && <CollectionPage />}
      {page === "analytics"  && <AnalyticsPage />}
      {page === "gifts"      && <GiftsPage />}
    </>
  );
}
