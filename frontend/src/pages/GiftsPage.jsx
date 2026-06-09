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

function GiftItem({ comic, onClick }) {
  const gifts = comic.gifted_to || [];
  return (
    <li className="gift-item" onClick={() => onClick(comic)}>
      <div className="gift-thumb">
        {comic.coverImage
          ? <img src={comic.coverImage} alt={comic.title} onError={e => e.target.style.display="none"} />
          : null}
        <CoverPh comic={comic} />
      </div>
      <div className="gift-item-info">
        <div className="gift-item-title">{comic.title}</div>
        <div className="gift-item-meta">{comic.publisher} · {comic.year}</div>
        <div className="gift-item-persons">
          {gifts.map((g, i) => (
            <div key={i} className="gift-person-chip">
              <span className="gift-person-name">{g.person}</span>
              {g.occasion && <span className="gift-person-occ">{g.occasion}</span>}
              {g.date && <span className="gift-person-date">{g.date}</span>}
            </div>
          ))}
        </div>
      </div>
    </li>
  );
}

function ReceivedItem({ comic, onClick }) {
  const g = comic.gifted_by;
  return (
    <li className="gift-item" onClick={() => onClick(comic)}>
      <div className="gift-thumb">
        {comic.coverImage
          ? <img src={comic.coverImage} alt={comic.title} onError={e => e.target.style.display="none"} />
          : null}
        <CoverPh comic={comic} />
      </div>
      <div className="gift-item-info">
        <div className="gift-item-title">{comic.title}</div>
        <div className="gift-item-meta">{comic.publisher} · {comic.year}</div>
        {g && (
          <div className="gift-item-persons">
            <div className="gift-person-chip">
              <span className="gift-person-name">{g.person}</span>
              {g.occasion && <span className="gift-person-occ">{g.occasion}</span>}
              {g.date && <span className="gift-person-date">{g.date}</span>}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export default function GiftsPage() {
  const api = useApi();
  const [gifts, setGifts] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => { api.getGifts().then(setGifts).catch(console.error); }, []);

  const refresh = () => api.getGifts().then(setGifts);

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Gift <span>History</span></h1>
        <p>Comics you've given and received — a paper trail of generosity.</p>
      </div>

      {!gifts ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <div className="loading-dots"><span /><span /><span /></div>
        </div>
      ) : (
        <div className="gifts-layout">
          {/* Given */}
          <div className="gifts-panel">
            <div className="gifts-panel-header">
              <div className="gifts-panel-title">Given Away</div>
              <div className="gifts-panel-sub">{gifts.given.length} comic{gifts.given.length !== 1 ? "s" : ""}</div>
            </div>
            {gifts.given.length === 0
              ? <div className="gifts-empty">No gifts recorded yet.<br/>Open a comic and click "Record a Gift".</div>
              : <ul className="gifts-list">
                  {gifts.given.map(c => <GiftItem key={c.id} comic={c} onClick={setSelected} />)}
                </ul>
            }
          </div>

          {/* Received */}
          <div className="gifts-panel">
            <div className="gifts-panel-header">
              <div className="gifts-panel-title">Received</div>
              <div className="gifts-panel-sub">{gifts.received.length} comic{gifts.received.length !== 1 ? "s" : ""}</div>
            </div>
            {gifts.received.length === 0
              ? <div className="gifts-empty">No received gifts recorded yet.<br/>Open a comic and log who gave it to you.</div>
              : <ul className="gifts-list">
                  {gifts.received.map(c => <ReceivedItem key={c.id} comic={c} onClick={setSelected} />)}
                </ul>
            }
          </div>
        </div>
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
