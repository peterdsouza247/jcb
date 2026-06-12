import React, { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";

const RECO_META = {
  "Keep Long Term":  { color: "var(--green)",  bg: "var(--green-light)", icon: "🏆" },
  "Keep Short Term": { color: "var(--blue)",   bg: "#e8edf8",            icon: "📦" },
  "Trade":           { color: "var(--red)",    bg: "#fde8ea",            icon: "♻️"  },
};

const URGENCY_META = {
  high:   { label: "⚡ Act Now",   color: "var(--red)",         bg: "#fde8ea" },
  medium: { label: "⚠️ Soon",      color: "var(--yellow-dark)", bg: "#fff8e1" },
  low:    { label: "No Rush",      color: "var(--grey-3)",      bg: "var(--grey-5)" },
  none:   { label: "",             color: "",                   bg: "" },
};

const CONF_COLOR = { high: "var(--green)", medium: "var(--yellow-dark)", low: "var(--grey-3)" };

// ── Four-dimension mini chart ─────────────────────────────────────────────────
function DimensionBars({ comic }) {
  if (!comic.dim_intrinsic && comic.dim_intrinsic !== 0) return null;

  const dims = [
    { label: "Intrinsic",      value: comic.dim_intrinsic,     color: "var(--blue)",        help: "Objective worth — key issues, age, creative team, condition" },
    { label: "Personal",       value: comic.dim_personal,      color: "var(--green)",       help: "Your tags, reading history, gift provenance, run completion" },
    { label: "Market Timing",  value: comic.dim_market,        color: "var(--red)",         help: "Higher = stronger sell signal (peak/cooling market)" },
    { label: "Replaceability", value: comic.dim_replaceability, color: "var(--yellow-dark)", help: "Higher = easier to replace if you sell it" },
  ];

  return (
    <div style={{ marginTop: "0.85rem" }}>
      <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--grey-3)", marginBottom: "0.5rem" }}>
        Dimension Scores
      </div>
      {dims.map(d => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }} title={d.help}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--grey-2)", minWidth: 90 }}>{d.label}</span>
          <div style={{ flex: 1, height: 8, background: "var(--grey-5)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${d.value}%`, background: d.color, borderRadius: 4, transition: "width 0.6s ease" }} />
          </div>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--grey-3)", minWidth: 28, textAlign: "right" }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Individual comic card ─────────────────────────────────────────────────────
function RecoCard({ comic, rank }) {
  const [open, setOpen] = useState(false);
  const meta    = RECO_META[comic.recommendation] || RECO_META["Keep Short Term"];
  const urgency = URGENCY_META[comic.trade_urgency] || URGENCY_META.none;

  return (
    <div style={{
      background: "var(--white)", borderRadius: "var(--radius)",
      border: "1px solid var(--grey-5)", boxShadow: "var(--shadow-sm)",
      overflow: "hidden",
    }}>
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem 1rem", cursor: "pointer", borderLeft: `4px solid ${meta.color}` }}
        onClick={() => setOpen(o => !o)}
      >
        {rank && (
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1.1rem", color: "var(--grey-3)", minWidth: 28, textAlign: "center" }}>
            #{rank}
          </div>
        )}

        {/* Cover thumbnail */}
        <div style={{ width: 36, height: 54, background: "var(--grey-1)", borderRadius: 3, overflow: "hidden", flexShrink: 0, position: "relative" }}>
          {comic.coverImage
            ? <img src={comic.coverImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
            : <div style={{ width: "100%", height: "100%", background: "var(--blue-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "0.45rem", color: "var(--yellow)", fontFamily: "'Bangers', cursive", textAlign: "center", padding: 2, lineHeight: 1.2 }}>
                  {(comic.series || comic.title || "").slice(0, 15)}
                </span>
              </div>
          }
        </div>

        {/* Title block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1rem", letterSpacing: "0.03em", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {comic.series || comic.title}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--grey-3)", fontWeight: 500 }}>
            {comic.publisher?.replace(" Comics", "")} · {comic.year}
          </div>
        </div>

        {/* Scores + urgency */}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexShrink: 0 }}>
          {urgency.label && (
            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 6px", borderRadius: 10, background: urgency.bg, color: urgency.color, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
              {urgency.label}
            </span>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1.3rem", color: meta.color, lineHeight: 1 }}>
              {comic.recommendation === "Trade" ? comic.trade_score : comic.keep_score}
            </div>
            <div style={{ fontSize: "0.6rem", color: "var(--grey-3)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {comic.recommendation === "Trade" ? "Trade" : "Keep"}
            </div>
          </div>
          {comic.analysis_confidence && (
            <div style={{ fontSize: "0.62rem", fontWeight: 700, padding: "2px 5px", borderRadius: 10, background: "var(--grey-5)", color: CONF_COLOR[comic.analysis_confidence] || "var(--grey-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {comic.analysis_confidence}
            </div>
          )}
          <span style={{ color: "var(--grey-4)", fontSize: "0.8rem", marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ padding: "0.85rem 1rem 1rem", borderTop: "1px solid var(--grey-5)", background: meta.bg }}>
          {comic.analysis_summary && (
            <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "var(--ink)", marginBottom: "0.75rem" }}>
              {comic.analysis_summary}
            </p>
          )}

          {/* Dimension bars */}
          <DimensionBars comic={comic} />

          {/* Value factor chips */}
          {comic.value_factors?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.85rem" }}>
              {comic.value_factors.map((f, i) => (
                <span key={i} style={{ fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "white", color: meta.color, border: `1px solid ${meta.color}` }}>
                  {f}
                </span>
              ))}
            </div>
          )}

          {/* Market note */}
          {comic.market_note && (
            <p style={{ fontSize: "0.78rem", color: "var(--grey-2)", fontStyle: "italic", marginTop: "0.65rem", lineHeight: 1.5 }}>
              📊 {comic.market_note}
            </p>
          )}

          {/* Tags */}
          {(comic.tags || []).length > 0 && (
            <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.65rem", flexWrap: "wrap" }}>
              {comic.tags.map(t => (
                <span key={t} style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "var(--grey-5)", color: "var(--grey-2)" }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ title, icon, comics, showRank, color, defaultOpen = true }) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.85rem", cursor: "pointer", paddingBottom: "0.5rem", borderBottom: `3px solid ${color}` }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: "1.35rem" }}>{icon}</span>
        <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: "1.75rem", letterSpacing: "0.05em", color: "var(--ink)", flex: 1 }}>{title}</h2>
        <span style={{ fontFamily: "'Bangers', cursive", fontSize: "1.3rem", background: color, color: "white", padding: "2px 10px", borderRadius: 20 }}>{comics.length}</span>
        <span style={{ color: "var(--grey-4)" }}>{collapsed ? "▼" : "▲"}</span>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {comics.map(c => <RecoCard key={c.id} comic={c} rank={showRank ? c.trade_rank : null} />)}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const api = useApi();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnalysis().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page" style={{ textAlign: "center", padding: "4rem" }}>
      <div className="loading-dots"><span/><span/><span/></div>
    </div>
  );

  if (!data || data.total === 0) return (
    <div className="page">
      <div className="page-heading"><h1>Collection <span>Analysis</span></h1></div>
      <div style={{ background: "var(--white)", borderRadius: "var(--radius)", border: "1px solid var(--grey-5)", padding: "2.5rem", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔍</div>
        <h3 style={{ fontFamily: "'Bangers', cursive", fontSize: "1.6rem", marginBottom: "0.5rem" }}>No Analysis Yet</h3>
        <p style={{ color: "var(--grey-3)", marginBottom: "1.25rem" }}>Go to the Admin page and click Run Analysis to score your collection.</p>
        <div style={{ background: "var(--grey-1)", borderRadius: "var(--radius-sm)", padding: "0.85rem 1.25rem", display: "inline-block" }}>
          <code style={{ color: "var(--yellow)", fontSize: "0.9rem" }}>Admin → Analyze Collection → Run Analysis</code>
        </div>
      </div>
    </div>
  );

  const { by_recommendation, analyzed_at } = data;

  const urgentTrades = (by_recommendation.trade || []).filter(c => c.trade_urgency === "high");
  const otherTrades  = (by_recommendation.trade || []).filter(c => c.trade_urgency !== "high");
  const tradeList    = [...urgentTrades, ...otherTrades];
  const longList     = (by_recommendation.keep_long  || []).sort((a, b) => (b.keep_score  || 0) - (a.keep_score  || 0));
  const shortList    = (by_recommendation.keep_short || []).sort((a, b) => (b.keep_score  || 0) - (a.keep_score  || 0));

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Collection <span>Analysis</span></h1>
        <p>
          Multi-dimensional scoring · {data.total} comics analyzed
          {analyzed_at && ` · ${new Date(analyzed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        </p>
      </div>

      {/* Summary */}
      <div className="summary-row" style={{ marginBottom: "2rem" }}>
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
          <div className="summary-label">Trade</div>
        </div>
        {urgentTrades.length > 0 && (
          <div className="summary-card" style={{ borderTop: "3px solid var(--red)" }}>
            <div className="summary-num" style={{ color: "var(--red)" }}>{urgentTrades.length}</div>
            <div className="summary-label">⚡ Act Now</div>
          </div>
        )}
      </div>

      {/* Scoring method note */}
      <div style={{ background: "var(--grey-5)", borderRadius: "var(--radius-sm)", padding: "0.85rem 1rem", marginBottom: "2rem", fontSize: "0.82rem", color: "var(--grey-2)", lineHeight: 1.6 }}>
        <strong>How scoring works:</strong> Each comic is scored across four dimensions —
        <strong> Intrinsic Value</strong> (key issues, age, creative team),
        <strong> Personal Value</strong> (your tags, gift provenance, run completion),
        <strong> Market Timing</strong> (peak/rising/stable/cooling/dead), and
        <strong> Replaceability</strong> (how hard to find again if sold).
        The recommendation is derived from the combination, not a single blended score.
        Expand any comic to see its dimension breakdown.
      </div>

      {tradeList.length > 0 && (
        <Section title="Recommended Trade" icon="♻️" comics={tradeList} showRank={true} color="var(--red)" defaultOpen={true} />
      )}
      {longList.length > 0 && (
        <Section title="Keep Long Term" icon="🏆" comics={longList} showRank={false} color="var(--green)" defaultOpen={true} />
      )}
      {shortList.length > 0 && (
        <Section title="Keep Short Term" icon="📦" comics={shortList} showRank={false} color="var(--blue)" defaultOpen={false} />
      )}

      <div style={{ marginTop: "1.5rem", padding: "0.85rem 1rem", background: "var(--grey-5)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem", color: "var(--grey-3)" }}>
        Re-analyze after updating tags: <strong>Admin → Analyze Collection → check Force re-analyze → Run Analysis</strong>
      </div>
    </div>
  );
}
