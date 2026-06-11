import React, { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ── Simple password gate ──────────────────────────────────────────────────────
function useAdminAuth() {
  const [password, setPassword] = useState(() => sessionStorage.getItem("admin_pw") || "");
  const [authed,   setAuthed]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [error,    setError]    = useState("");

  async function login(pw) {
    setChecking(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/status`, {
        headers: { "x-admin-password": pw }
      });
      if (res.ok) {
        sessionStorage.setItem("admin_pw", pw);
        setPassword(pw); setAuthed(true);
      } else {
        setError("Wrong password.");
      }
    } catch {
      setError("Cannot reach the backend.");
    } finally {
      setChecking(false);
    }
  }

  function logout() { sessionStorage.removeItem("admin_pw"); setAuthed(false); setPassword(""); }

  return { password, authed, checking, error, login, logout };
}

// ── Shared admin fetch helper ─────────────────────────────────────────────────
function useAdminFetch(password) {
  async function adminGet(path) {
    const res = await fetch(`${API_BASE}/api/admin${path}`, {
      headers: { "x-admin-password": password }
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  }

  async function adminPost(path, body) {
    const res = await fetch(`${API_BASE}/api/admin${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  }

  async function adminUpload(path, formData) {
    formData.append("password", password);
    const res = await fetch(`${API_BASE}/api/admin${path}`, {
      method:  "POST",
      headers: { "x-admin-password": password },
      body:    formData,
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  }

  return { adminGet, adminPost, adminUpload };
}

// ── Reusable result box ───────────────────────────────────────────────────────
function ResultBox({ result, error }) {
  if (!result && !error) return null;
  const isError = !!error;
  return (
    <div style={{
      marginTop: "0.85rem",
      padding: "0.85rem 1rem",
      borderRadius: "var(--radius-sm)",
      background: isError ? "#fde8ea" : "var(--green-light)",
      border: `1px solid ${isError ? "var(--red)" : "var(--green)"}`,
      fontSize: "0.875rem",
      color: isError ? "var(--red-dark)" : "var(--green)",
    }}>
      {isError ? `❌ ${error}` : `✅ ${result.message || "Done"}`}
      {result?.new_comics?.length > 0 && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--grey-2)" }}>
          {result.new_comics.map((c, i) => <div key={i}>{c}</div>)}
        </div>
      )}
      {result?.log?.length > 0 && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--grey-2)" }}>
          {result.log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      {result?.summary && (
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span>🏆 Keep Long Term: <strong>{result.summary.keep_long}</strong></span>
          <span>📦 Keep Short Term: <strong>{result.summary.keep_short}</strong></span>
          <span>♻️ Trade: <strong>{result.summary.trade}</strong></span>
        </div>
      )}
    </div>
  );
}

// ── File drop zone ────────────────────────────────────────────────────────────
function FileZone({ onFile, accept = ".csv", label = "Drop CSV here or click to browse" }) {
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");
  const inputRef = useRef();

  function handle(file) {
    if (!file) return;
    setFilename(file.name);
    onFile(file);
  }

  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
      style={{
        border: `2px dashed ${dragging ? "var(--blue)" : "var(--grey-4)"}`,
        borderRadius: "var(--radius)",
        padding: "1.5rem",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "#e8edf8" : "var(--off-white)",
        transition: "all 0.15s",
      }}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }}
        onChange={e => handle(e.target.files[0])} />
      <div style={{ fontSize: "1.5rem", marginBottom: "0.4rem" }}>📄</div>
      <div style={{ fontSize: "0.875rem", color: filename ? "var(--green)" : "var(--grey-3)", fontWeight: 500 }}>
        {filename || label}
      </div>
    </div>
  );
}

// ── Admin panel card ──────────────────────────────────────────────────────────
function Panel({ title, icon, children }) {
  return (
    <div style={{
      background: "var(--white)", borderRadius: "var(--radius-lg)",
      border: "1px solid var(--grey-5)", boxShadow: "var(--shadow-sm)",
      overflow: "hidden",
    }}>
      <div style={{
        background: "linear-gradient(135deg, var(--blue) 0%, var(--blue-light) 100%)",
        padding: "0.85rem 1.25rem",
        display: "flex", alignItems: "center", gap: "0.65rem",
      }}>
        <span style={{ fontSize: "1.25rem" }}>{icon}</span>
        <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: "1.4rem", letterSpacing: "0.05em", color: "var(--white)" }}>{title}</h2>
      </div>
      <div style={{ padding: "1.25rem" }}>{children}</div>
    </div>
  );
}

function ActionButton({ onClick, loading, children, variant = "primary" }) {
  const bg = variant === "danger" ? "var(--red)" : variant === "secondary" ? "var(--grey-2)" : "var(--blue)";
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        background: loading ? "var(--grey-4)" : bg,
        color: "var(--white)", border: "none",
        fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: "0.875rem",
        padding: "0.55rem 1.25rem", borderRadius: "var(--radius-sm)",
        cursor: loading ? "not-allowed" : "pointer", transition: "background 0.15s",
        display: "flex", alignItems: "center", gap: "0.4rem",
      }}
    >
      {loading ? <span className="loading-dots" style={{ display: "inline-flex", gap: 3 }}><span style={{ width:6,height:6,borderRadius:"50%",background:"white",display:"inline-block" }}/><span style={{ width:6,height:6,borderRadius:"50%",background:"white",display:"inline-block" }}/><span style={{ width:6,height:6,borderRadius:"50%",background:"white",display:"inline-block" }}/></span> : children}
    </button>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--grey-3)", marginBottom: "0.35rem" }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input {...props} style={{
      width: "100%", background: "var(--white)",
      border: "1.5px solid var(--grey-4)", borderRadius: "var(--radius-sm)",
      padding: "0.45rem 0.65rem", fontFamily: "'Inter', sans-serif",
      fontSize: "0.875rem", color: "var(--ink)", outline: "none",
    }} />
  );
}

function Select({ children, ...props }) {
  return (
    <select {...props} style={{
      width: "100%", background: "var(--white)",
      border: "1.5px solid var(--grey-4)", borderRadius: "var(--radius-sm)",
      padding: "0.45rem 0.65rem", fontFamily: "'Inter', sans-serif",
      fontSize: "0.875rem", color: "var(--ink)", outline: "none",
    }}>
      {children}
    </select>
  );
}

// ── Gap analysis display ──────────────────────────────────────────────────────
function GapReport({ data }) {
  if (!data) return null;
  const { summary, priority_wish_list, tradable, unread_sleepers } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1rem" }}>
      {/* Summary */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {[
          { label: "Owned",     val: summary.owned },
          { label: "Read",      val: `${summary.read} (${summary.read_rate}%)` },
          { label: "Wish List", val: summary.wish_list },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--grey-5)", borderRadius: "var(--radius-sm)", padding: "0.65rem 1rem", textAlign: "center", flex: 1 }}>
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1.5rem", color: "var(--blue)" }}>{s.val}</div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--grey-3)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Priority wish list */}
      {priority_wish_list.length > 0 && (
        <div>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1.1rem", color: "var(--red)", marginBottom: "0.5rem" }}>
            📌 Priority Wish List ({priority_wish_list.length})
          </div>
          {priority_wish_list.map((c, i) => (
            <div key={i} style={{ fontSize: "0.85rem", padding: "0.3rem 0", borderBottom: "1px solid var(--grey-5)" }}>
              <strong>{c.series}</strong> — {c.publisher}
            </div>
          ))}
        </div>
      )}

      {/* Tradable */}
      {tradable.length > 0 && (
        <div>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1.1rem", color: "var(--grey-2)", marginBottom: "0.5rem" }}>
            ♻️ Tradable ({tradable.length})
          </div>
          {tradable.map((c, i) => (
            <div key={i} style={{ fontSize: "0.85rem", padding: "0.3rem 0", borderBottom: "1px solid var(--grey-5)" }}>
              {c.series} ({c.year}) — {c.publisher}
            </div>
          ))}
        </div>
      )}

      {/* Unread sleepers */}
      {unread_sleepers.length > 0 && (
        <div>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: "1.1rem", color: "var(--blue)", marginBottom: "0.5rem" }}>
            👁 Unread Sleepers ({unread_sleepers.length})
          </div>
          {unread_sleepers.map((c, i) => (
            <div key={i} style={{ fontSize: "0.85rem", padding: "0.3rem 0", borderBottom: "1px solid var(--grey-5)" }}>
              {c.series} ({c.year}){c.writer ? ` — ${c.writer}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, checking, error }) {
  const [pw, setPw] = useState("");
  return (
    <div className="page" style={{ maxWidth: 420, margin: "4rem auto" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: "3rem" }}>🔐</div>
        <h1 style={{ fontFamily: "'Bangers', cursive", fontSize: "2.5rem", color: "var(--blue)", letterSpacing: "0.05em" }}>Admin</h1>
        <p style={{ color: "var(--grey-3)", fontSize: "0.9rem" }}>Jacob's Comic Books</p>
      </div>
      <div style={{ background: "var(--white)", borderRadius: "var(--radius-lg)", border: "1px solid var(--grey-5)", boxShadow: "var(--shadow)", padding: "1.75rem" }}>
        <FormField label="Password">
          <Input
            type="password" value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onLogin(pw)}
            placeholder="Enter admin password"
            autoFocus
          />
        </FormField>
        {error && <div style={{ color: "var(--red)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{error}</div>}
        <ActionButton onClick={() => onLogin(pw)} loading={checking}>
          Sign In
        </ActionButton>
        <p style={{ marginTop: "1rem", fontSize: "0.78rem", color: "var(--grey-3)", lineHeight: 1.5 }}>
          Password is set via <code>ADMIN_PASSWORD</code> environment variable on Render.
          Default is <code>jacob</code> — change this in production.
        </p>
      </div>
    </div>
  );
}

// ── Main admin page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const auth = useAdminAuth();

  useEffect(() => {
    if (auth.password) auth.login(auth.password);
  }, []);

  if (!auth.authed) {
    return <LoginScreen onLogin={auth.login} checking={auth.checking} error={auth.error} />;
  }

  return <AdminDashboard password={auth.password} onLogout={auth.logout} />;
}

function AdminDashboard({ password, onLogout }) {
  const { adminGet, adminPost, adminUpload } = useAdminFetch(password);

  // Status
  const [status, setStatus] = useState(null);
  useEffect(() => { adminGet("/status").then(setStatus).catch(() => {}); }, []);

  // Import collection
  const [collectionFile, setCollectionFile] = useState(null);
  const [collectionResult, setCollectionResult] = useState(null);
  const [collectionError,  setCollectionError]  = useState("");
  const [collectionLoading, setCollectionLoading] = useState(false);

  async function importCollection() {
    if (!collectionFile) return;
    setCollectionLoading(true); setCollectionResult(null); setCollectionError("");
    try {
      const fd = new FormData();
      fd.append("csv", collectionFile);
      const res = await adminUpload("/import-collection", fd);
      setCollectionResult(res);
      adminGet("/status").then(setStatus).catch(() => {});
    } catch(e) { setCollectionError(e.message); }
    finally { setCollectionLoading(false); }
  }

  // Import gift list
  const [listFile,    setListFile]    = useState(null);
  const [listPerson,  setListPerson]  = useState("");
  const [listDir,     setListDir]     = useState("to");
  const [listOccasion,setListOccasion]= useState("");
  const [listDate,    setListDate]    = useState("");
  const [listResult,  setListResult]  = useState(null);
  const [listError,   setListError]   = useState("");
  const [listLoading, setListLoading] = useState(false);

  async function importList() {
    if (!listFile || !listPerson) return;
    setListLoading(true); setListResult(null); setListError("");
    try {
      const fd = new FormData();
      fd.append("csv",       listFile);
      fd.append("person",    listPerson);
      fd.append("direction", listDir);
      fd.append("occasion",  listOccasion);
      fd.append("date",      listDate);
      const res = await adminUpload("/import-list", fd);
      setListResult(res);
    } catch(e) { setListError(e.message); }
    finally { setListLoading(false); }
  }

  // Fetch covers
  const [coversResult,  setCoversResult]  = useState(null);
  const [coversError,   setCoversError]   = useState("");
  const [coversLoading, setCoversLoading] = useState(false);

  async function fetchCovers() {
    setCoversLoading(true); setCoversResult(null); setCoversError("");
    try {
      const res = await adminPost("/fetch-covers", {});
      setCoversResult(res);
    } catch(e) { setCoversError(e.message); }
    finally { setCoversLoading(false); }
  }

  // Analyze
  const [analyzeForce,   setAnalyzeForce]   = useState(false);
  const [analyzeResult,  setAnalyzeResult]  = useState(null);
  const [analyzeError,   setAnalyzeError]   = useState("");
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  async function runAnalysis() {
    setAnalyzeLoading(true); setAnalyzeResult(null); setAnalyzeError("");
    try {
      const res = await adminPost("/analyze", { force: analyzeForce });
      setAnalyzeResult(res);
    } catch(e) { setAnalyzeError(e.message); }
    finally { setAnalyzeLoading(false); }
  }

  // Gap analysis
  const [gapData,    setGapData]    = useState(null);
  const [gapError,   setGapError]   = useState("");
  const [gapLoading, setGapLoading] = useState(false);

  async function runGapAnalysis() {
    setGapLoading(true); setGapData(null); setGapError("");
    try {
      const res = await adminGet("/gap-analysis");
      setGapData(res);
    } catch(e) { setGapError(e.message); }
    finally { setGapLoading(false); }
  }

  const OCCASIONS = ["Birthday", "Christmas", "Anniversary", "Diwali", "Just Because", "Thank You", "Other"];

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div className="page-heading" style={{ marginBottom: 0 }}>
          <h1>Admin <span>Panel</span></h1>
          <p>Manage your collection data</p>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: "1.5px solid var(--grey-4)", color: "var(--grey-3)", fontSize: "0.8rem", fontWeight: 600, padding: "0.4rem 0.85rem", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
          Sign Out
        </button>
      </div>

      {/* Status bar */}
      {status && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
          {[
            { label: "Total Comics",    val: status.total_docs,  color: "var(--blue)"  },
            { label: "Owned",           val: status.owned,       color: "var(--green)" },
            { label: "With Covers",     val: status.with_covers, color: "var(--blue)"  },
            { label: "Analyzed",        val: status.analyzed,    color: "var(--red)"   },
            { label: "Comic Vine Key",  val: status.comic_vine_key ? "✅ Set" : "❌ Missing", color: status.comic_vine_key ? "var(--green)" : "var(--red)" },
          ].map(s => (
            <div key={s.label} className="summary-card" style={{ flex: 1, minWidth: 110 }}>
              <div className="summary-num" style={{ color: s.color }}>{s.val}</div>
              <div className="summary-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: "1.5rem" }}>

        {/* Import Collection */}
        <Panel title="Sync LoCG Collection" icon="📥">
          <p style={{ fontSize: "0.85rem", color: "var(--grey-3)", marginBottom: "1rem", lineHeight: 1.6 }}>
            Export your collection from LoCG: go to your{" "}
            <a href="https://leagueofcomicgeeks.com/profile/greywarden247/stats/collection" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
              Collection Stats page
            </a>
            {" "}→ scroll to bottom → Export Collection. Upload the CSV here.
          </p>
          <FormField label="LoCG Export CSV">
            <FileZone onFile={setCollectionFile} label="Drop locg-export.csv here" />
          </FormField>
          <ActionButton onClick={importCollection} loading={collectionLoading}>
            Import Collection
          </ActionButton>
          <ResultBox result={collectionResult} error={collectionError} />
        </Panel>

        {/* Import Gift List */}
        <Panel title="Import Gift List" icon="🎁">
          <p style={{ fontSize: "0.85rem", color: "var(--grey-3)", marginBottom: "1rem", lineHeight: 1.6 }}>
            Export a LoCG community list as CSV and upload it here. Set the person's name and whether these are comics you gave to them or received from them.
          </p>
          <FormField label="Gift List CSV">
            <FileZone onFile={setListFile} label="Drop gift list CSV here" />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <FormField label="Person's Name">
              <Input value={listPerson} onChange={e => setListPerson(e.target.value)} placeholder="e.g. Luca" />
            </FormField>
            <FormField label="Direction">
              <Select value={listDir} onChange={e => setListDir(e.target.value)}>
                <option value="to">I gave TO them</option>
                <option value="by">They gave to ME</option>
              </Select>
            </FormField>
            <FormField label="Occasion (optional)">
              <Select value={listOccasion} onChange={e => setListOccasion(e.target.value)}>
                <option value="">Select occasion…</option>
                {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </Select>
            </FormField>
            <FormField label="Date (optional)">
              <Input type="date" value={listDate} onChange={e => setListDate(e.target.value)} />
            </FormField>
          </div>
          <ActionButton onClick={importList} loading={listLoading}>
            Import Gift List
          </ActionButton>
          <ResultBox result={listResult} error={listError} />
        </Panel>

        {/* Fetch Covers */}
        <Panel title="Fetch Cover Art" icon="🎨">
          <p style={{ fontSize: "0.85rem", color: "var(--grey-3)", marginBottom: "1rem", lineHeight: 1.6 }}>
            Fetches cover images from Comic Vine for all comics missing a cover.
            Requires <code>COMIC_VINE_API_KEY</code> set in your Render environment variables.
            Get a free key at{" "}
            <a href="https://comicvine.gamespot.com/api/" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
              comicvine.gamespot.com/api
            </a>.
          </p>
          {status && !status.comic_vine_key && (
            <div style={{ background: "#fff8e1", border: "1px solid var(--yellow-dark)", borderRadius: "var(--radius-sm)", padding: "0.65rem 0.85rem", fontSize: "0.82rem", color: "#7a5200", marginBottom: "1rem" }}>
              ⚠️ Comic Vine API key not detected. Add <code>COMIC_VINE_API_KEY</code> to your Render environment variables first.
            </div>
          )}
          <p style={{ fontSize: "0.82rem", color: "var(--grey-3)", marginBottom: "1rem" }}>
            This runs in the background — it can take up to 30 minutes for a full collection due to rate limiting. The app will update progressively as covers are found.
          </p>
          <ActionButton onClick={fetchCovers} loading={coversLoading} variant={status?.comic_vine_key ? "primary" : "secondary"}>
            Start Fetching Covers
          </ActionButton>
          <ResultBox result={coversResult} error={coversError} />
        </Panel>

        {/* Analyze Collection */}
        <Panel title="Analyze Collection" icon="🔍">
          <p style={{ fontSize: "0.85rem", color: "var(--grey-3)", marginBottom: "1rem", lineHeight: 1.6 }}>
            Scores every owned comic on trade vs keep potential. Results appear in the Analysis tab. Only analyzes new/unscored comics unless you force a full re-analysis.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
            <input type="checkbox" id="force-analyze" checked={analyzeForce} onChange={e => setAnalyzeForce(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            <label htmlFor="force-analyze" style={{ fontSize: "0.875rem", cursor: "pointer", color: "var(--grey-2)" }}>
              Force re-analyze everything (use after updating tags)
            </label>
          </div>
          <ActionButton onClick={runAnalysis} loading={analyzeLoading}>
            Run Analysis
          </ActionButton>
          <ResultBox result={analyzeResult} error={analyzeError} />
        </Panel>

        {/* Gap Analysis */}
        <Panel title="Gap Analysis" icon="📊">
          <p style={{ fontSize: "0.85rem", color: "var(--grey-3)", marginBottom: "1rem", lineHeight: 1.6 }}>
            Shows priority wish list items, tradable comics, and unread sleepers based on your current collection.
          </p>
          <ActionButton onClick={runGapAnalysis} loading={gapLoading}>
            Run Gap Analysis
          </ActionButton>
          {gapError && <div style={{ color: "var(--red)", fontSize: "0.85rem", marginTop: "0.75rem" }}>❌ {gapError}</div>}
          <GapReport data={gapData} />
        </Panel>

      </div>
    </div>
  );
}
