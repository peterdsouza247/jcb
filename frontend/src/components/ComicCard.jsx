import React from "react";

const TAG_CLASSES = {
  "Bluechip": "tag-bluechip",
  "Sleeper": "tag-sleeper",
  "Excellent Read": "tag-excellent",
  "Tradable": "tag-tradable",
};

function CoverPh({ comic }) {
  return (
    <div className="cover-ph">
      <span className="ph-pub">{comic.publisher}</span>
      <span className="ph-title">{comic.series || comic.title}</span>
      <span className="ph-year">{comic.year}</span>
    </div>
  );
}

export default function ComicCard({ comic, onClick }) {
  const snippet = comic.highlight?.description?.[0] || comic.highlight?.title?.[0];
  const hasGift = (comic.gifted_to?.length > 0) || (comic.gifted_by?.person);
  const tags = comic.tags || [];

  return (
    <div className="comic-card" onClick={() => onClick(comic)}>
      <div className="comic-cover">
        {comic.coverImage
          ? <img src={comic.coverImage} alt={comic.title} loading="lazy"
              onError={e => { e.target.style.display="none"; }}/>
          : null}
        <CoverPh comic={comic} />
        <div className="cover-ribbon">
          {tags.map(t => (
            <span key={t} className={`ribbon-tag ${TAG_CLASSES[t] || ""}`}>
              {t === "Excellent Read" ? "★" : t === "Bluechip" ? "💎" : t === "Sleeper" ? "👁" : t}
            </span>
          ))}
          {comic.on_wish_list && !comic.owned && (
            <span className="ribbon-tag tag-wishlist">Want</span>
          )}
        </div>
      </div>
      <div className="card-info">
        {comic.series && comic.series !== comic.title && (
          <div className="card-series">{comic.series}</div>
        )}
        <div className="card-title">{comic.title}</div>
        {snippet && (
          <div className="card-snippet" dangerouslySetInnerHTML={{ __html: snippet }} />
        )}
        <div className="card-meta">
          <span>{comic.publisher?.replace(" Comics","")}</span>
          <span style={{display:"flex",alignItems:"center",gap:"2px"}}>
            {comic.year}
            {hasGift && <span className="gift-dot" title="Has gift history" />}
          </span>
        </div>
      </div>
    </div>
  );
}
