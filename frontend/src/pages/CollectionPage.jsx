import React, { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../hooks/useApi";
import ComicCard from "../components/ComicCard";
import ComicModal from "../components/ComicModal";

const SORT_OPTS = [
  { value: "relevance", label: "Relevance" },
  { value: "year_desc", label: "Year (Newest)" },
  { value: "year_asc",  label: "Year (Oldest)" },
  { value: "title",     label: "Title A–Z" },
  { value: "value",     label: "Est. Value" },
];

const STATUS_FILTERS = [
  { key: "owned",       label: "Owned",     value: "true" },
  { key: "on_wish_list",label: "Wish List", value: "true" },
  { key: "read",        label: "Read",      value: "true" },
  { key: "gifted",      label: "Given Away",value: "given" },
  { key: "gifted",      label: "Gifted To Me",value: "received" },
];

export default function CollectionPage() {
  const api = useApi();
  const [query, setQuery]   = useState("");
  const [inputVal, setInput] = useState("");
  const [filters, setFilters] = useState({});
  const [sort, setSort]     = useState("year_desc");
  const [page, setPage]     = useState(1);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [suggestions, setSug]   = useState([]);
  const [showSug, setShowSug]   = useState(false);
  const sugTimer = useRef(null);

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

  function setFilter(key, value) {
    setFilters(prev => {
      const next = { ...prev };
      if (prev[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  }

  const clearAll = () => { setFilters({}); setQuery(""); setInput(""); setPage(1); };
  const hasActive = Object.keys(filters).length > 0 || query;
  const aggs = results?.aggregations;

  return (
    <>
      {/* Inline search bar */}
      <div className="page">
        <div style={{marginBottom:"1.5rem"}}>
          <form onSubmit={handleSearch} style={{position:"relative",maxWidth:520}}>
            <input
              className="nav-search" style={{display:"block",width:"100%",background:"var(--white)",border:"var(--rule-heavy)",color:"var(--ink)",padding:"0.6rem 2.5rem 0.6rem 0.85rem",fontSize:"1rem"}}
              placeholder="Search titles, writers, characters…"
              value={inputVal} onChange={handleInput}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              autoComplete="off"
            />
            {inputVal && (
              <button type="button" className="nav-search-clear" style={{color:"var(--ink)"}}
                onClick={() => { setInput(""); setQuery(""); setPage(1); }}>✕</button>
            )}
            {showSug && (
              <ul className="suggestions-box">
                {suggestions.map(s => (
                  <li key={s.id} onMouseDown={() => { setInput(s.title); setQuery(s.title); setPage(1); setShowSug(false); }}>
                    <span>{s.title}</span>
                    {s.writer && <span className="sug-sub">{s.writer}</span>}
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>

        <div className="collection-layout">
          {/* Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-title">Filter</div>
            {hasActive && <button className="clear-btn" onClick={clearAll}>Clear All</button>}

            <div className="filter-section">
              <span className="filter-label">Status</span>
              <ul className="filter-list">
                {STATUS_FILTERS.map(f => {
                  const active = filters[f.key] === f.value;
                  return (
                    <li key={f.label}>
                      <button className={`filter-btn ${active?"active":""}`}
                        onClick={() => setFilter(f.key, f.value)}>
                        {f.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {aggs?.tags?.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Tags</span>
                <ul className="filter-list">
                  {aggs.tags.map(b => (
                    <li key={b.key}>
                      <button className={`filter-btn ${filters.tag===b.key?"active":""}`}
                        onClick={() => setFilter("tag", b.key)}>
                        {b.key} <span className="filter-count">{b.doc_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aggs?.publishers?.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Publisher</span>
                <ul className="filter-list">
                  {aggs.publishers.map(b => (
                    <li key={b.key}>
                      <button className={`filter-btn ${filters.publisher===b.key?"active":""}`}
                        onClick={() => setFilter("publisher", b.key)}>
                        {b.key.replace(" Comics","")} <span className="filter-count">{b.doc_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aggs?.genres?.length > 0 && (
              <div className="filter-section">
                <span className="filter-label">Genre</span>
                <ul className="filter-list">
                  {aggs.genres.map(b => (
                    <li key={b.key}>
                      <button className={`filter-btn ${filters.genre===b.key?"active":""}`}
                        onClick={() => setFilter("genre", b.key)}>
                        {b.key} <span className="filter-count">{b.doc_count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* Results */}
          <main>
            <div className="results-header">
              <div className="results-count">
                {loading
                  ? <div className="loading-dots"><span/><span/><span/></div>
                  : results
                    ? <><em>{results.total}</em> {query ? `results for "${query}"` : "comics"}</>
                    : null}
              </div>
              <select className="sort-select" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
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
                <button className="page-btn" disabled={page<=1} onClick={() => setPage(p=>p-1)}>← Prev</button>
                {Array.from({length: Math.min(results.totalPages, 7)}, (_,i) => i+1).map(p => (
                  <button key={p} className={`page-btn ${page===p?"active":""}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="page-btn" disabled={page>=results.totalPages} onClick={() => setPage(p=>p+1)}>Next →</button>
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
