const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function useApi() {
  const get = async (path) => {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };
  const post = async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };
  const put = async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };
  const patch = async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  };

  return {
    search:       (params) => { const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined && v !== ""))); return get(`/api/comics/search?${q}`); },
    getComic:     (id) => get(`/api/comics/${id}`),
    getSimilar:   (id) => get(`/api/comics/${id}/similar`).catch(() => []),
    getSuggest:   (prefix) => get(`/api/suggest/${encodeURIComponent(prefix)}`).catch(() => []),
    getAnalytics: () => get("/api/analytics"),
    getGifts:     () => get("/api/gifts"),
    addComic:     (data) => post("/api/comics", data),
    updateComic:  (id, data) => put(`/api/comics/${id}`, data),
    addGift:      (id, data) => patch(`/api/comics/${id}/gift`, data),
    checkHealth:  () => fetch(`${API_BASE}/health`).then(r => r.ok).catch(() => false),
  };
}
