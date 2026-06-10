import React, { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";

const RECO_META = {
  "Keep Long Term":  { color: "var(--green)",      bg: "var(--green-light)", icon: "🏆", label: "Keep Long Term"  },
  "Keep Short Term": { color: "var(--blue)",        bg: "#e8edf8",           icon: "📦", label: "Keep Short Term" },
  "Trade":           { color: "var(--red)",         bg: "#fde8ea",           icon: "♻️",  label: "Trade"           },
};

const CONF_COLOR = { High: "var(--green)", Medium: "var(--yellow-dark)", Low: "var(--grey-3)" };

function RecoCard({ comic, rank }) {
  const [open, setOpen] = useState(false);
  const meta = RECO_META[comic.recommendation] || RECO_META["Keep Short Term"];

  return (
    <div style={{
      background: "var(--white)", borderRadius: "var(--radius)",
      border: `1px solid var(--grey-5)`, boxShadow: "var(--shadow-sm)",
      overflow: "hidden", transition: "box-shadow 0.15s",
    }}>
      {/* Header row */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "0.85rem 1rem", cursor: "pointer",
          borderLeft: `4px solid ${meta.color}`,
        }}
        onClick={() => setOpen(o => !o)}
      >
        {/* Rank badge */}
        {rank && (
          <div style={{
            fontFamily: "'Bangers', cursive", fontSize: "1.1rem",
            color: "var(--grey-3)", minWidth: 28, textAlign: "center",
          }}>#{rank}</div>
        )}

        {/* Cover thumbnail */}
        <div style={{
          width: 36, height: 54, background: "var(--grey-1)",
          borderRadius: 3, overflow: "hidden", flexShrink: 0, position: "relative",
        }}>
          {comic.coverImage
            ? <img src={comic.coverImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--blue-dark)" }}>
                <span style={{ fontSize: "0.5rem", color: "var(--yellow)", fontFamily: "'Bangers', cursive", textAlign: "center", padding: "2px" }}>
                  {(comic.series || comic.title || "").slice(0,12)}
                </span>
              </div>
          }
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1rem", letterSpacing: "0.03em", lineHeight: 1.15 }}>
            {comic.series || comic.title}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--grey-3)", fontWeight: 500 }}>
            {comic.publisher?.replace(" Comics", "")} · {comic.year}
          </div>
        </div>

        {/* Scores */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1.3rem", color: meta.color, lineHeight: 1 }}>
              {comic.recommendation === "Trade" ? comic.trade_score : comic.keep_score}
            </div>
            <div style={{ fontSize: "0.6rem", color: "var(--grey-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {comic.recommendation === "Trade" ? "Trade" : "Keep"}
            </div>
          </div>
          {comic.analysis_confidence && (
            <div style={{
              fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px",
              borderRadius: 10, background: "var(--grey-5)",
              color: CONF_COLOR[comic.analysis_confidence] || "var(--grey-3)",
              letterSpacing: "0.06em",
            }}>
              {comic.analysis_confidence}
            </div>
          )}
          <span style={{ color: "var(--grey-4)", fontSize: "0.85rem" }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{
          padding: "0.75rem 1rem 1rem",
          borderTop: "1px solid var(--grey-5)",
          background: meta.bg,
        }}>
          {comic.analysis_summary && (
            <p style={{ fontSize: "0.875rem", lineHeight: 1.55, color: "var(--ink)", marginBottom: "0.65rem" }}>
              {comic.analysis_summary}
            </p>
          )}
          {comic.value_factors?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
              {comic.value_factors.map((f, i) => (
                <span key={i} style={{
                  fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px",
                  borderRadius: 20, background: "white",
                  color: meta.color, border: `1px solid ${meta.color}`,
                }}>{f}</span>
              ))}
            </div>
          )}
          {comic.market_note && (
            <p style={{ fontSize: "0.78rem", color: "var(--grey-2)", fontStyle: "italic", marginTop: "0.35rem" }}>
              📊 {comic.market_note}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.65rem", flexWrap: "wrap" }}>
            <div style={{
              fontSize: "0.72rem", fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: meta.color, color: "white",
            }}>
              {meta.icon} {meta.label}
            </div>
            {(comic.tags || []).map(t => (
              <div key={t} style={{
                fontSize: "0.72rem", fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                background: "var(--grey-5)", color: "var(--grey-2)",
              }}>{t}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, comics, showRank, color }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: "0.65rem",
          marginBottom: "0.85rem", cursor: "pointer",
          paddingBottom: "0.5rem", borderBottom: `3px solid ${color}`,
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: "1.35rem" }}>{icon}</span>
        <h2 style={{
          fontFamily: "'Bangers', cursive", fontSize: "1.75rem",
          letterSpacing: "0.05em", color: "var(--ink)", flex: 1,
        }}>{title}</h2>
        <span style={{
          fontFamily: "'Bangers', cursive", fontSize: "1.3rem",
          background: color, color: "white", padding: "2px 10px", borderRadius: 20,
        }}>{comics.length}</span>
        <span style={{ color: "var(--grey-4)" }}>{collapsed ? "▼" : "▲"}</span>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {comics.map((c, i) => (
            <RecoCard key={c.id} comic={c} rank={showRank ? c.trade_rank : null} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const api = useApi();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    api.getAnalysis()
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="page" style={{ textAlign: "center", padding: "4rem" }}>
      <div className="loading-dots"><span/><span/><span/></div>
      <p style={{ marginTop: "1rem", color: "var(--grey-3)" }}>Loading analysis…</p>
    </div>
  );

  if (error || !data || data.total === 0) return (
    <div className="page">
      <div className="page-heading">
        <h1>Collection <span>Analysis</span></h1>
      </div>
      <div style={{
        background: "var(--white)", borderRadius: "var(--radius)",
        border: "1px solid var(--grey-5)", padding: "2.5rem", textAlign: "center",
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🤖</div>
        <h3 style={{ fontFamily: "'Bangers', cursive", fontSize: "1.6rem", marginBottom: "0.5rem" }}>
          No Analysis Yet
        </h3>
        <p style={{ color: "var(--grey-3)", marginBottom: "1.25rem", lineHeight: 1.6 }}>
          Run the analysis script to get AI-powered trade recommendations for your collection.
        </p>
        <div style={{
          background: "var(--grey-1)", borderRadius: "var(--radius-sm)",
          padding: "0.85rem 1.25rem", display: "inline-block", textAlign: "left",
        }}>
          <code style={{ color: "var(--yellow)", fontSize: "0.9rem", fontFamily: "monospace" }}>
            cd backend<br/>
            node src/analyze-collection.js
          </code>
        </div>
        <p style={{ color: "var(--grey-3)", fontSize: "0.85rem", marginTop: "1rem" }}>
          Requires <code>ANTHROPIC_API_KEY</code> in your <code>.env</code> file.<br/>
          Get a free key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>console.anthropic.com</a>
        </p>
      </div>
    </div>
  );

  const { by_recommendation, analyzed_at } = data;
  const tradeList  = (by_recommendation.trade      || []).sort((a,b) => (a.trade_rank||999) - (b.trade_rank||999));
  const longList   = (by_recommendation.keep_long  || []).sort((a,b) => (b.keep_score||0)  - (a.keep_score||0));
  const shortList  = (by_recommendation.keep_short || []).sort((a,b) => (b.keep_score||0)  - (a.keep_score||0));

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Collection <span>Analysis</span></h1>
        <p>
          AI-powered trade recommendations · {data.total} comics analyzed
          {analyzed_at && ` · ${new Date(analyzed_at).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}`}
        </p>
      </div>

      {/* Summary bar */}
      <div className="summary-row" style={{ marginBottom: "2.5rem" }}>
        <div className="summary-card">
          <div className="summary-num" style={{ color: "var(--green)" }}>{longList.length}</div>
          <div className="summary-label">Keep Long Term</div>
        </div>
        <div className="summary-card">
          <div className="summary-num" style={{ color: "var(--blue)" }}>{shortList.length}</div>
          <div className="summary-label">Keep Short Term</div>
        </div>
        <div className="summary-card">
          <div className="summary-num" style={{ color: "var(--red)" }}>{tradeList.length}</div>
          <div className="summary-label">Recommended Trade</div>
        </div>
        <div className="summary-card">
          <div className="summary-num">{data.total}</div>
          <div className="summary-label">Total Analyzed</div>
        </div>
      </div>

      {tradeList.length > 0 && (
        <Section
          title="Recommended Trade"
          icon="♻️"
          comics={tradeList}
          showRank={true}
          color="var(--red)"
        />
      )}

      {longList.length > 0 && (
        <Section
          title="Keep Long Term"
          icon="🏆"
          comics={longList}
          showRank={false}
          color="var(--green)"
        />
      )}

      {shortList.length > 0 && (
        <Section
          title="Keep Short Term"
          icon="📦"
          comics={shortList}
          showRank={false}
          color="var(--blue)"
        />
      )}

      <div style={{ marginTop: "2rem", padding: "1rem", background: "var(--grey-5)", borderRadius: "var(--radius-sm)", fontSize: "0.82rem", color: "var(--grey-3)", lineHeight: 1.6 }}>
        <strong style={{ color: "var(--grey-2)" }}>Re-analyze:</strong> Run <code>node src/analyze-collection.js --force</code> to refresh all recommendations.
        New comics added since the last run are analyzed automatically without <code>--force</code>.
      </div>
    </div>
  );
}
