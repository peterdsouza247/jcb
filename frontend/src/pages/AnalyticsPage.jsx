import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../hooks/useApi";
import ComicCard   from "../components/ComicCard";
import ComicModal  from "../components/ComicModal";

const SORT_OPTS = [
  { value: "relevance", label: "Relevance"     },
  { value: "year_desc", label: "Year (Newest)" },
  { value: "year_asc",  label: "Year (Oldest)" },
  { value: "title",     label: "Title A–Z"     },
  { value: "value",     label: "Est. Value"    },
];

const STATUS_FILTERS = [
  { key: "owned",        value: "true",     label: "Owned"         },
  { key: "on_wish_list", value: "true",     label: "Wish List"     },
  { key: "read",         value: "true",     label: "Read"          },
  { key: "gifted",       value: "given",    label: "Given Away"    },
  { key: "gifted",       value: "received", label: "Gifted to Me"  },
];

export default function CollectionPage() {
  const api = useApi();

  const [query,      setQuery]      = useState("");
  const [inputVal,   setInput]      = useState("");
  const [filters,    setFilters]    = useState({});
  const [sort,       setSort]       = useState("year_desc");
  const [page,       setPage]       = useState(1);
  const [results,    setResults]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [suggestions, setSug]       = useState([]);
  const [showSug,    setShowSug]    = useState(false);
  const [giftPeople, setGiftPeople] = useState({ given_to: [], given_by: [] });

  const sugTimer = useRef(null);

  useEffect(() => { api.getGiftPeople().then(setGiftPeople).catch(() => {}); }, []);

  const runSearch = useCallback(async (q, f, s, p) => {
    setLoading(true);
    try {
      const data = await api.search({ q, ...f, sort: s, page: p });
      setResults(data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { runSearch(query, filters, sort, page); }, [query, filters, sort, page]);

  function handleSearch(e) {
    e.preventDefault();
    setQuery(inputVal); setPage(1); setShowSug(false); setSug([]);
  }

  function handleInput(e) {
    const v = e.target.value; setInput(v);
    clearTimeout(sugTimer.current);
    if (v.length < 2) { setSug([]); return; }
    sugTimer.current = setTimeout(async () => {
      const s = await api.getSuggest(v);
      setSug(s); setShowSug(s.length > 0);
    }, 250);
  }

  // Simple key/value filter toggle
  function setFilter(key, value) {
    setFilters(prev => {
      const next = { ...prev };
      if (prev[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  }

  // Gift person filter — sets gifted direction + gift_person together
  function setGiftPersonFilter(direction, person) {
    setFilters(prev => {
      const giftedVal = direction === "to" ? "given" : "received";
      // Toggle off if already active
      if (prev.gifted === giftedVal && prev.gift_person === person) {
        const next = { ...prev };
        delete next.gifted;
        delete next.gift_person;
        return next;
      }
      return { ...prev, gifted: giftedVal, gift_person: person };
    });
    setPage(1);
  }

  const clearAll  = () => { setFilters({}); setQuery(""); setInput(""); setPage(1); };
  const hasActive = Object.keys(filters).length > 0 || query;
  const aggs      = results?.aggregations;

  return (
    <>
      <div className="page">
        {/* Search */}
        <div style={{ marginBottom: "1.5rem" }}>
          <form onSubmit={handleSearch} style={{ position: "relative", maxWidth: 520 }}>
            <input
              style={{
                width: "100%", background: "var(--white)",
                border: "1.5px solid var(--grey-4)", borderRadius: "var(--radius)",
                padding: "0.6rem 2.5rem 0.6rem 0.85rem",
                fontFamily: "'Inter', sans-serif", fontSize: "1rem", color: "var(--ink)",
                outline: "none", boxShadow: "var(--shadow-sm)",
              }}
              placeholder="Search titles, writers, characters…"
              value={inputVal} onChange={handleInput}
              onFocus={e => e.target.style.borderColor = "var(--blue)"}
              onBlur={e => { e.target.style.borderColor = "var(--grey-4)"; setTimeout(() => setShowSug(false), 150); }}
              autoComplete="off"
            />
            {inputVal && (
              <button type="button" className="nav-search-clear" style={{ color: "var(--grey-3)" }}
                onClick={() => { setInput(""); setQuery(""); setPage(1); }}>✕</button>
            )}
            {showSug && suggestions.length > 0 && (
              <ul className="suggestions-box">
                {suggestions.map(s => (
                  <li key={s.id} onMouseDown={() => {
                    setInput(s.title); setQuery(s.title); setPage(1); setShowSug(false);
                  }}>
                    <span>{s.title}</span>
                    {s.writer && <span className="sug-sub">{s.writer}</span>}
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>

        <div className="collection-layout">
          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <aside className="sidebar">
            <div className="sidebar-title">Filter</div>
            {hasActive && <button className="clear-btn" onClick={clearAll}>Clear All</button>}

            {/* Status */}
            <div className="filter-section">
              <span className="filter-label">Status</span>
              <ul className="filter-list">
                {STATUS_FILTERS.map(f => (
                  <li key={f.label}>
                    <button className={`filter-btn ${filters[f.key] === f.value ? "active" : ""}`}
                      onClick={() => setFilter(f.key, f.value)}>
                      {f.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Given To — one button per person */}
            {giftPeople.given_to.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Given To</span>
                <ul className="filter-list">
                  {giftPeople.given_to.map(p => {
                    const active = filters.gifted === "given" && filters.gift_person === p.person;
                    return (
                      <li key={p.person}>
                        <button className={`filter-btn ${active ? "active" : ""}`}
                          onClick={() => setGiftPersonFilter("to", p.person)}>
                          {p.person}
                          <span className="filter-count">{p.count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Gifted By — one button per person */}
            {giftPeople.given_by.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Gifted By</span>
                <ul className="filter-list">
                  {giftPeople.given_by.map(p => {
                    const active = filters.gifted === "received" && filters.gift_person === p.person;
                    return (
                      <li key={p.person}>
                        <button className={`filter-btn ${active ? "active" : ""}`}
                          onClick={() => setGiftPersonFilter("by", p.person)}>
                          {p.person}
                          <span className="filter-count">{p.count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Tags */}
            {aggs?.tags?.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Tags</span>
                <ul className="filter-list">
                  {aggs.tags.map(b => (
                    <li key={b.key}>
                      <button className={`filter-btn ${filters.tag === b.key ? "active" : ""}`}
                        onClick={() => setFilter("tag", b.key)}>
                        {b.key} <span className="filter-count">{b.doc_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Publisher */}
            {aggs?.publishers?.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Publisher</span>
                <ul className="filter-list">
                  {aggs.publishers.map(b => (
                    <li key={b.key}>
                      <button className={`filter-btn ${filters.publisher === b.key ? "active" : ""}`}
                        onClick={() => setFilter("publisher", b.key)}>
                        {b.key.replace(" Comics", "")}
                        <span className="filter-count">{b.doc_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Genre */}
            {aggs?.genres?.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Genre</span>
                <ul className="filter-list">
                  {aggs.genres.map(b => (
                    <li key={b.key}>
                      <button className={`filter-btn ${filters.genre === b.key ? "active" : ""}`}
                        onClick={() => setFilter("genre", b.key)}>
                        {b.key} <span className="filter-count">{b.doc_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* ── Results ──────────────────────────────────────────────────── */}
          <main>
            <div className="results-header">
              <div className="results-count">
                {loading
                  ? <div className="loading-dots"><span/><span/><span/></div>
                  : results
                    ? <><em>{results.total}</em> {query ? `results for "${query}"` : "comics"}</>
                    : null}
              </div>
              <select className="sort-select" value={sort}
                onChange={e => { setSort(e.target.value); setPage(1); }}>
                {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="comic-grid">
              {!loading && results?.comics?.length === 0 && (
                <div className="state-box">
                  <span className="icon">📭</span>
                  <h3>No Results</h3>
                  <p>Try a different search or clear your filters.</p>
                </div>
              )}
              {results?.comics?.map(c => (
                <ComicCard key={c.id} comic={c} onClick={setSelected} />
              ))}
            </div>

            {results && results.totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}>← Prev</button>
                {Array.from({ length: Math.min(results.totalPages, 7) }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`page-btn ${page === p ? "active" : ""}`}
                    onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="page-btn" disabled={page >= results.totalPages}
                  onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </main>
        </div>
      </div>

      {selected && (
        <ComicModal comic={selected} onClose={() => setSelected(null)} onNavigate={setSelected} />
      )}
    </>
  );
}
