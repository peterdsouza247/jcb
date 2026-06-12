import React, { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";

const TAG_BADGE = {
  "Bluechip":       "badge-gold",
  "Sleeper":        "badge-blue",
  "Excellent Read": "badge-green",
  "Tradable":       "badge-ink",
};

const OCCASIONS = ["Birthday", "Christmas", "Anniversary", "Diwali", "Just Because", "Thank You", "Other"];

function CoverPh({ comic }) {
  return (
    <div className="cover-ph">
      <span className="ph-pub">{comic.publisher}</span>
      <span className="ph-title">{comic.series || comic.title}</span>
      <span className="ph-year">{comic.year}</span>
    </div>
  );
}

function GiftForm({ onSubmit }) {
  const [form, setForm] = useState({ direction: "to", person: "", date: "", occasion: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="add-gift-form">
      <div className="gift-form-row">
        <select className="gift-select" value={form.direction} onChange={e => set("direction", e.target.value)}>
          <option value="to">I gave this to…</option>
          <option value="by">I received this from…</option>
        </select>
        <input className="gift-input" placeholder="Person's name" value={form.person} onChange={e => set("person", e.target.value)} />
      </div>
      <div className="gift-form-row">
        <input className="gift-input" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
        <select className="gift-select" value={form.occasion} onChange={e => set("occasion", e.target.value)}>
          <option value="">Occasion…</option>
          {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <input className="gift-input" placeholder="Notes (optional)" value={form.notes} onChange={e => set("notes", e.target.value)} />
      <button className="gift-submit" onClick={() => form.person && onSubmit(form)}>
        Record Gift
      </button>
    </div>
  );
}

function TradeForm({ onSubmit }) {
  const [form, setForm] = useState({ to: "", date: "", for: "", price: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="add-gift-form">
      <div className="gift-form-row">
        <input className="gift-input" placeholder="Traded with / Sold to" value={form.to}
          onChange={e => set("to", e.target.value)} />
        <input className="gift-input" type="date" value={form.date}
          onChange={e => set("date", e.target.value)} />
      </div>
      <div className="gift-form-row">
        <input className="gift-input" placeholder="What you got in return (comic or cash)" value={form.for}
          onChange={e => set("for", e.target.value)} />
        <input className="gift-input" type="number" placeholder="Sale price (optional)" value={form.price}
          onChange={e => set("price", e.target.value)} step="0.01" min="0" />
      </div>
      <input className="gift-input" placeholder="Notes (optional)" value={form.notes}
        onChange={e => set("notes", e.target.value)} />
      <button className="gift-submit"
        style={{ background: "var(--red)" }}
        onClick={() => form.to && onSubmit({ ...form, price: form.price ? parseFloat(form.price) : null })}>
        Record Trade
      </button>
    </div>
  );
}

export default function ComicModal({ comic: initial, onClose, onNavigate }) {
  const api = useApi();
  const [comic,         setComic]         = useState(initial);
  const [similar,       setSimilar]       = useState([]);
  const [showGiftForm,  setShowGiftForm]  = useState(false);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [saving,        setSaving]        = useState(false);

  useEffect(() => {
    api.getSimilar(initial.id).then(setSimilar);
    const handler = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [initial.id]);

  const handleGiftSubmit = async (form) => {
    setSaving(true);
    try {
      const updated = await api.addGift(comic.id, form);
      setComic(updated);
      setShowGiftForm(false);
    } finally { setSaving(false); }
  };

  const handleTradeSubmit = async (form) => {
    setSaving(true);
    try {
      const updated = await api.addTrade(comic.id, form);
      setComic(updated);
      setShowTradeForm(false);
    } finally { setSaving(false); }
  };

  const giftsGiven   = comic.gifted_to || [];
  const giftReceived = comic.gifted_by?.person ? comic.gifted_by : null;
  const trades       = comic.traded || [];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-header-info">
            {comic.series && comic.series !== comic.title && (
              <div className="modal-series">{comic.series}{comic.issue ? ` #${comic.issue}` : ""}</div>
            )}
            <div className="modal-title">{comic.title}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-cover">
            {comic.coverImage
              ? <img src={comic.coverImage} alt={comic.title} onError={e => { e.target.style.display = "none"; }} />
              : null}
            <CoverPh comic={comic} />
          </div>

          <div className="modal-details">
            <div className="detail-row">
              <span className="detail-label">Publisher</span>
              <span className="detail-value detail-large">{comic.publisher}</span>
            </div>

            {(comic.writer || comic.artist) && (
              <div className="detail-row">
                <span className="detail-label">Creative Team</span>
                <span className="detail-value">
                  {comic.writer && <><strong>W:</strong> {comic.writer}<br /></>}
                  {comic.artist && comic.artist !== comic.writer && <><strong>A:</strong> {comic.artist}</>}
                </span>
              </div>
            )}

            <div className="detail-row">
              <div className="badge-row">
                <span className="badge badge-out">{comic.year}</span>
                {comic.genre    && <span className="badge badge-ink">{comic.genre}</span>}
                {comic.owned    && <span className="badge badge-red">Owned</span>}
                {comic.read     && <span className="badge badge-green">Read</span>}
                {trades.length > 0 && <span className="badge badge-red" style={{ background: "var(--grey-2)" }}>Traded</span>}
                {comic.on_wish_list && !comic.owned && <span className="badge badge-out">Wish List</span>}
                {(comic.tags || []).map(t => (
                  <span key={t} className={`badge ${TAG_BADGE[t] || "badge-out"}`}>{t}</span>
                ))}
              </div>
            </div>

            {comic.condition && (
              <div className="detail-row">
                <span className="detail-label">Condition</span>
                <span className="detail-value">{comic.condition}{comic.storage_box ? ` · ${comic.storage_box}` : ""}</span>
              </div>
            )}

            {comic.description && (
              <div className="detail-row">
                <span className="detail-label">Synopsis</span>
                <span className="detail-value" style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>{comic.description}</span>
              </div>
            )}

            {(comic.cover_price || comic.est_value) && (
              <div className="detail-row">
                <span className="detail-label">Value</span>
                <span className="detail-value" style={{ fontSize: "0.9rem" }}>
                  {comic.cover_price && <span>Cover: <strong>${comic.cover_price}</strong></span>}
                  {comic.cover_price && comic.est_value && " · "}
                  {comic.est_value   && <span>Est: <strong>${comic.est_value}</strong></span>}
                </span>
              </div>
            )}

            {comic.locg_url && (
              <div className="detail-row">
                <span className="detail-label">League of Comic Geeks</span>
                <a className="locg-link" href={comic.locg_url} target="_blank" rel="noreferrer">
                  View on LoCG ↗
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ── Gift section ──────────────────────────────────────────────── */}
        <div className="gift-section">
          <div className="gift-section-title">Gift History</div>

          {giftReceived && (
            <>
              <div className="detail-label" style={{ marginBottom: "0.4rem" }}>Received From</div>
              <div className="gift-cards">
                <div className="gift-card">
                  <div className="gift-card-header">
                    <span className="gift-person">{giftReceived.person}</span>
                    {giftReceived.occasion && <span className="gift-occasion">{giftReceived.occasion}</span>}
                    {giftReceived.date     && <span className="gift-date">{giftReceived.date}</span>}
                  </div>
                  {giftReceived.notes && <div className="gift-notes">{giftReceived.notes}</div>}
                </div>
              </div>
            </>
          )}

          {giftsGiven.length > 0 && (
            <>
              <div className="detail-label" style={{ marginBottom: "0.4rem", marginTop: giftReceived ? "0.75rem" : 0 }}>Given To</div>
              <div className="gift-cards">
                {giftsGiven.map((g, i) => (
                  <div className="gift-card" key={i}>
                    <div className="gift-card-header">
                      <span className="gift-person">{g.person}</span>
                      {g.occasion && <span className="gift-occasion">{g.occasion}</span>}
                      {g.date     && <span className="gift-date">{g.date}</span>}
                    </div>
                    {g.notes && <div className="gift-notes">{g.notes}</div>}
                  </div>
                ))}
              </div>
            </>
          )}

          {giftsGiven.length === 0 && !giftReceived && (
            <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: "0.5rem" }}>No gift history yet.</div>
          )}

          {showGiftForm
            ? <GiftForm onSubmit={handleGiftSubmit} />
            : <button className="gift-toggle" onClick={() => setShowGiftForm(true)}>
                {saving ? "Saving…" : "+ Record a Gift"}
              </button>
          }
        </div>

        {/* ── Trade section ─────────────────────────────────────────────── */}
        <div className="gift-section" style={{ borderTop: "1px solid var(--grey-5)" }}>
          <div className="gift-section-title" style={{ color: "var(--red)" }}>Trade History</div>

          {trades.length > 0 ? (
            <div className="gift-cards">
              {trades.map((t, i) => (
                <div className="gift-card" key={i} style={{ borderLeft: "3px solid var(--red)" }}>
                  <div className="gift-card-header">
                    <span className="gift-person">{t.to}</span>
                    {t.price != null && (
                      <span className="gift-occasion" style={{ color: "var(--green)" }}>${t.price}</span>
                    )}
                    {t.date && <span className="gift-date">{t.date}</span>}
                  </div>
                  {t.for   && <div className="gift-notes">In exchange for: <strong>{t.for}</strong></div>}
                  {t.notes && <div className="gift-notes">{t.notes}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "0.85rem", color: "#888", marginBottom: "0.5rem" }}>
              No trade history yet.
            </div>
          )}

          {showTradeForm
            ? <TradeForm onSubmit={handleTradeSubmit} />
            : <button className="gift-toggle"
                style={{ borderColor: "var(--red)", color: "var(--red)" }}
                onClick={() => setShowTradeForm(true)}>
                {saving ? "Saving…" : "♻️ Record a Trade / Sale"}
              </button>
          }
        </div>

        {/* ── Similar ───────────────────────────────────────────────────── */}
        {similar.length > 0 && (
          <div className="similar-section">
            <div className="similar-title">More Like This</div>
            <div className="similar-grid">
              {similar.map(s => (
                <div key={s.id} className="similar-card" onClick={() => onNavigate(s)}>
                  <div className="similar-cover">
                    {s.coverImage ? <img src={s.coverImage} alt={s.title} loading="lazy" /> : null}
                    <CoverPh comic={s} />
                  </div>
                  <div className="similar-info">
                    <div className="card-title" style={{ fontSize: "0.72rem" }}>{s.title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
