import React, { useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";

function BarChart({ data, max, color = "" }) {
  return (
    <div className="bar-chart">
      {data.map(d => (
        <div className="bar-row" key={d.key ?? d.label}>
          <span className="bar-label" title={d.key ?? d.label}>{d.key ?? d.label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${color}`} style={{ width: `${((d.doc_count ?? d.value) / max) * 100}%` }} />
          </div>
          <span className="bar-val">{d.doc_count ?? d.value}</span>
        </div>
      ))}
    </div>
  );
}

function Timeline({ data }) {
  const max = Math.max(...data.map(d => d.doc_count), 1);
  return (
    <div>
      <div className="timeline-wrap">
        <div className="timeline">
          {data.map(d => (
            <div key={d.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="timeline-bar" style={{ height: `${(d.doc_count / max) * 70 + 4}px` }}
                title={`${d.key}s: ${d.doc_count}`} />
            </div>
          ))}
        </div>
        <div className="timeline-years">
          {data.map(d => (
            <div key={d.key} className="timeline-label" style={{ flex: 1 }}>{d.key}s</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const api = useApi();
  const [data, setData] = useState(null);

  useEffect(() => { api.getAnalytics().then(setData).catch(console.error); }, []);

  if (!data) return (
    <div className="page" style={{ textAlign: "center", padding: "4rem" }}>
      <div className="loading-dots"><span /><span /><span /></div>
    </div>
  );

  const { summary, tags, publishers, genres, by_decade, bluechip_by_publisher, gifted_to, gifted_by } = data;
  const maxPub = Math.max(...publishers.map(p => p.doc_count), 1);
  const maxGenre = Math.max(...genres.map(g => g.doc_count), 1);

  const tagPills = [
    { label: "Bluechip", count: tags.bluechip, cls: "badge-gold" },
    { label: "Sleeper",  count: tags.sleeper,  cls: "badge-blue" },
    { label: "Excellent Read", count: tags.excellent_read, cls: "badge-green" },
    { label: "Tradable", count: tags.tradable, cls: "badge-ink" },
  ];

  return (
    <div className="page">
      <div className="page-heading">
        <h1>Collection <span>Analytics</span></h1>
        <p>GreyWarden247 · {summary.total_owned} owned · {summary.total_wish_list} on wish list</p>
      </div>

      {/* Summary cards */}
      <div className="summary-row">
        <div className="summary-card">
          <div className="summary-num">{summary.total_owned}</div>
          <div className="summary-label">Owned</div>
        </div>
        <div className="summary-card">
          <div className="summary-num">{summary.total_read}</div>
          <div className="summary-label">Read</div>
        </div>
        <div className="summary-card">
          <div className="summary-num">{summary.total_owned - summary.total_read}</div>
          <div className="summary-label">Unread</div>
        </div>
        <div className="summary-card">
          <div className="summary-num">{summary.total_wish_list}</div>
          <div className="summary-label">Wish List</div>
        </div>
        <div className="summary-card">
          <div className="summary-num">{summary.gifted_to}</div>
          <div className="summary-label">Given Away</div>
        </div>
        <div className="summary-card">
          <div className="summary-num">{summary.gifted_by}</div>
          <div className="summary-label">Received</div>
        </div>
        {summary.total_value > 0 && (
          <div className="summary-card">
            <div className="summary-num">${Math.round(summary.total_value)}</div>
            <div className="summary-label">Est. Value</div>
          </div>
        )}
      </div>

      <div className="analytics-grid">
        {/* Tags */}
        <div className="stat-panel">
          <div className="stat-panel-title">Your <span>Tags</span></div>
          <div className="tag-pills">
            {tagPills.map(t => (
              <div key={t.label} className={`tag-pill badge ${t.cls}`}>
                <span className="tag-pill-count">{t.count}</span>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
          {/* read rate */}
          <div style={{ marginTop: "1.25rem" }}>
            <div className="detail-label" style={{ marginBottom: "0.5rem" }}>Read Rate</div>
            <div className="bar-row">
              <span className="bar-label">Read</span>
              <div className="bar-track">
                <div className="bar-fill red" style={{ width: `${(summary.total_read / summary.total_owned) * 100}%` }} />
              </div>
              <span className="bar-val">{Math.round((summary.total_read / summary.total_owned) * 100)}%</span>
            </div>
          </div>
        </div>

        {/* By Publisher */}
        <div className="stat-panel">
          <div className="stat-panel-title">By <span>Publisher</span></div>
          <BarChart data={publishers} max={maxPub} />
        </div>

        {/* By Genre */}
        <div className="stat-panel">
          <div className="stat-panel-title">By <span>Genre</span></div>
          <BarChart data={genres} max={maxGenre} color="blue" />
        </div>

        {/* Bluechips by publisher */}
        {bluechip_by_publisher?.length > 0 && (
          <div className="stat-panel">
            <div className="stat-panel-title">Bluechips by <span>Publisher</span></div>
            <BarChart data={bluechip_by_publisher} max={Math.max(...bluechip_by_publisher.map(b=>b.doc_count),1)} color="gold" />
          </div>
        )}

        {/* Timeline */}
        {by_decade?.length > 0 && (
          <div className="stat-panel" style={{ gridColumn: "1 / -1" }}>
            <div className="stat-panel-title">Collection by <span>Decade</span></div>
            <Timeline data={by_decade} />
          </div>
        )}

        {/* Gifted to */}
        {gifted_to?.by_person?.length > 0 && (
          <div className="stat-panel">
            <div className="stat-panel-title">Comics <span>Given</span></div>
            <BarChart data={gifted_to.by_person} max={Math.max(...gifted_to.by_person.map(b=>b.doc_count),1)} color="green" />
            {gifted_to.by_occasion?.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div className="filter-label" style={{ marginBottom: "0.5rem" }}>By Occasion</div>
                <div className="badge-row">
                  {gifted_to.by_occasion.map(o => (
                    <span key={o.key} className="badge badge-out">{o.key} ({o.doc_count})</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gifted by */}
        {gifted_by?.by_person?.length > 0 && (
          <div className="stat-panel">
            <div className="stat-panel-title">Comics <span>Received</span></div>
            <BarChart data={gifted_by.by_person} max={Math.max(...gifted_by.by_person.map(b=>b.doc_count),1)} color="red" />
          </div>
        )}
      </div>
    </div>
  );
}
