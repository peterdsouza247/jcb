import React, { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";
import ComicModal from "../components/ComicModal";

function CoverPh({ comic }) {
  return (
    <div className="cover-ph" style={{ fontSize: "0.65rem" }}>
      <span className="ph-title">{comic.series || comic.title}</span>
    </div>
  );
}

function TradeItem({ comic, onClick }) {
  const trades = comic.traded || [];
  const totalValue = trades.reduce((sum, t) => sum + (t.price || 0), 0);

  return (
    <li className="gift-item" onClick={() => onClick(comic)}>
      <div className="gift-thumb">
        {comic.coverImage
          ? <img src={comic.coverImage} alt={comic.title}
              onError={e => e.target.style.display = "none"} />
          : null}
        <CoverPh comic={comic} />
      </div>

      <div className="gift-item-info">
        <div className="gift-item-title">{comic.title}</div>
        <div className="gift-item-meta">
          {comic.publisher} · {comic.year}
          {totalValue > 0 && (
            <span style={{ marginLeft: "0.5rem", color: "var(--green)", fontWeight: 700 }}>
              ${totalValue.toFixed(2)}
            </span>
          )}
        </div>

        <div className="gift-item-persons">
          {trades.map((t, i) => (
            <div key={i} className="gift-person-chip">
              <span className="gift-person-name">{t.to}</span>
              {t.for   && <span style={{ fontSize: "0.78rem", color: "var(--grey-3)" }}>for {t.for}</span>}
              {t.price != null && <span className="gift-person-occ" style={{ color: "var(--green)" }}>${t.price}</span>}
              {t.date  && <span className="gift-person-date">{t.date}</span>}
            </div>
          ))}
        </div>
      </div>
    </li>
  );
}

export default function TradedPage() {
  const api = useApi();
  const [traded,   setTraded]   = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => { api.getTraded().then(setTraded).catch(console.error); }, []);

  const refresh = () => api.getTraded().then(setTraded);

  const totalValue = (traded || []).reduce((sum, c) => {
    return sum + (c.traded || []).reduce((s, t) => s + (t.price || 0), 0);
  }, 0);

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Trade <span>History</span></h1>
        <p>Comics you've traded or sold from your collection.</p>
      </div>

      {!traded ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <div className="loading-dots"><span /><span /><span /></div>
        </div>
      ) : traded.length === 0 ? (
        <div style={{ background: "var(--white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--grey-5)", padding: "3rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>♻️</div>
          <h3 style={{ fontFamily: "'Bangers', cursive", fontSize: "1.6rem", marginBottom: "0.5rem" }}>No Trades Yet</h3>
          <p style={{ color: "var(--grey-3)", lineHeight: 1.6 }}>
            Open any comic in your collection and click<br />
            <strong>♻️ Record a Trade / Sale</strong> to log it here.
          </p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
            <div className="summary-card" style={{ flex: 1, minWidth: 120 }}>
              <div className="summary-num" style={{ color: "var(--red)" }}>{traded.length}</div>
              <div className="summary-label">Comics Traded</div>
            </div>
            {totalValue > 0 && (
              <div className="summary-card" style={{ flex: 1, minWidth: 120 }}>
                <div className="summary-num" style={{ color: "var(--green)" }}>${totalValue.toFixed(2)}</div>
                <div className="summary-label">Total Sold For</div>
              </div>
            )}
            <div className="summary-card" style={{ flex: 1, minWidth: 120 }}>
              <div className="summary-num" style={{ color: "var(--blue)" }}>
                {traded.reduce((s, c) => s + (c.traded || []).length, 0)}
              </div>
              <div className="summary-label">Total Transactions</div>
            </div>
          </div>

          <div className="gifts-panel">
            <div className="gifts-panel-header">
              <div className="gifts-panel-title">Traded Comics</div>
              <div className="gifts-panel-sub">{traded.length} comic{traded.length !== 1 ? "s" : ""}</div>
            </div>
            <ul className="gifts-list">
              {traded.map(c => (
                <TradeItem key={c.id} comic={c} onClick={setSelected} />
              ))}
            </ul>
          </div>
        </>
      )}

      {selected && (
        <ComicModal
          comic={selected}
          onClose={() => { setSelected(null); refresh(); }}
          onNavigate={setSelected}
        />
      )}
    </div>
  );
}
