/**
 * admin-routes.js — All admin endpoints
 *
 * Mounted at /api/admin in server.js
 * Handles CSV uploads, triggered scripts, and gap analysis
 *
 * Protected by a simple ADMIN_PASSWORD env variable.
 * Set ADMIN_PASSWORD in your Render environment variables.
 */

import express from "express";
import multer  from "multer";
import { Client } from "@opensearch-project/opensearch";
const router = express.Router();

// ── OpenSearch client ────────────────────────────────────────────────────────
const esConfig = process.env.ELASTIC_CLOUD_ID
  ? { cloud: { id: process.env.ELASTIC_CLOUD_ID }, auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD } }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es    = new Client(esConfig);
const INDEX = "comics";

// ── Multer — in-memory file storage (no disk writes on Render) ───────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted"));
    }
  }
});

// ── Simple password middleware ────────────────────────────────────────────────
function requireAuth(req, res, next) {
  // Read from process.env each time — never cache as a module-level constant
  const adminPassword = process.env.ADMIN_PASSWORD || "jacob";
  const password = req.headers["x-admin-password"] || req.body?.password;
  if (password !== adminPassword) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(buffer) {
  const text  = buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  function parseLine(line) {
    const fields = [];
    let current  = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; }
      else { current += ch; }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows    = lines.slice(1).map(l => {
    const vals = parseLine(l);
    const obj  = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || "").trim(); });
    return obj;
  });

  return { headers, rows };
}

// ── Field mapping for LoCG collection export ──────────────────────────────────
const LOCG_FIELD_MAP = {
  "Publisher Name":  "publisher",
  "Series Name":     "series",
  "Full Title":      "title",
  "Release Date":    "release_date",
  "In Collection":   "owned",
  "In Wish List":    "on_wish_list",
  "Marked Read":     "read",
  "My Rating":       "rating",
  "Price Paid":      "cover_price",
  "Date Purchased":  "added_date",
  "Condition":       "condition",
  "Notes":           "notes",
  "Tags":            "tags",
};

function rowToDoc(row) {
  const raw = {};
  Object.entries(LOCG_FIELD_MAP).forEach(([locgKey, esKey]) => {
    if (row[locgKey] !== undefined) raw[esKey] = row[locgKey];
  });

  let year = null;
  if (raw.release_date) {
    const m = raw.release_date.match(/(\d{4})/);
    if (m) year = parseInt(m[1]);
  }

  const bool  = v => v === "1" || v === "true" || v === "Yes";
  const issue = row["Issue Number"] ? parseInt(row["Issue Number"]) : null;
  const title = raw.title || (raw.series ? `${raw.series}${issue ? ` #${issue}` : ""}` : "");
  const tags  = raw.tags ? raw.tags.split(",").map(t => t.trim()).filter(Boolean) : [];

  return {
    series:       raw.series       || "",
    issue,
    title,
    publisher:    raw.publisher    || "",
    year,
    cover_price:  raw.cover_price  ? parseFloat(raw.cover_price.replace(/[^0-9.]/g, "")) : null,
    rating:       raw.rating       ? parseInt(raw.rating) : null,
    read:         bool(raw.read),
    owned:        bool(raw.owned),
    on_wish_list: bool(raw.on_wish_list),
    condition:    raw.condition    || "",
    tags,
    notes:        raw.notes        || "",
    coverImage:   "",
  };
}

const PRESERVED = ["gifted_to", "gifted_by", "condition", "storage_box", "est_value", "rating", "notes", "coverImage", "recommendation", "trade_score", "keep_score", "trade_rank", "analysis_summary", "value_factors", "market_note"];

async function getAllExisting() {
  const byTitle = {};
  let from = 0;
  while (true) {
    const res  = await es.search({ index: INDEX, body: { query: { match_all: {} }, size: 100, from, _source: ["title", "series", "issue"] } });
    const hits = res.body.hits.hits;
    if (!hits.length) break;
    hits.forEach(h => {
      const key = `${h._source.series}|${h._source.issue}|${h._source.title}`.toLowerCase();
      byTitle[key] = h._id;
    });
    from += hits.length;
    if (from >= res.body.hits.total.value) break;
  }
  return byTitle;
}

// ── POST /api/admin/import-collection ─────────────────────────────────────────
router.post("/import-collection", requireAuth, upload.single("csv"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No CSV file uploaded" });

  try {
    const { rows } = parseCSV(req.file.buffer);
    if (!rows.length) return res.status(400).json({ error: "CSV appears empty" });

    const docs     = rows.filter(r => r["Full Title"] || r["Series Name"]).map(rowToDoc);
    const existing = await getAllExisting();

    let created = 0, updated = 0, skipped = 0;
    const log   = [];

    for (const doc of docs) {
      const key      = `${doc.series}|${doc.issue}|${doc.title}`.toLowerCase();
      const existId  = existing[key];

      if (existId) {
        // Fetch full existing doc to preserve custom fields
        const full   = await es.get({ index: INDEX, id: existId });
        const merged = { ...doc };
        PRESERVED.forEach(f => {
          if (full.body._source[f] !== undefined && full.body._source[f] !== null && full.body._source[f] !== "") {
            merged[f] = full.body._source[f];
          }
        });
        await es.update({ index: INDEX, id: existId, body: { doc: merged } });
        updated++;
      } else {
        await es.index({
          index: INDEX,
          body: { ...doc, gifted_to: [], gifted_by: null, createdAt: new Date().toISOString() }
        });
        created++;
        log.push(`Added: ${doc.title}`);
      }
    }

    await es.indices.refresh({ index: INDEX });
    const count = await es.count({ index: INDEX });

    res.json({
      success: true,
      message: `Import complete. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`,
      total: count.body.count,
      new_comics: log.slice(0, 20),
    });

  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/import-list ───────────────────────────────────────────────
router.post("/import-list", requireAuth, upload.single("csv"), async (req, res) => {
  const { person, direction, occasion, date } = req.body;

  if (!req.file) return res.status(400).json({ error: "No CSV file uploaded" });
  if (!person)    return res.status(400).json({ error: "Person name is required" });
  if (!["to","by"].includes(direction)) return res.status(400).json({ error: 'Direction must be "to" or "by"' });

  try {
    const { rows }    = parseCSV(req.file.buffer);
    const giftEntry   = { person, date: date || null, occasion: occasion || null, notes: null };
    const existing    = await getAllExisting();

    let matched = 0, created = 0, skipped = 0;
    const log   = [];

    for (const row of rows) {
      const title  = row["Full Title"]  || row["Title"]  || row["Series Name"] || "";
      const series = row["Series Name"] || row["Series"] || "";
      if (!title && !series) continue;

      const key    = `${series}|${row["Issue Number"] || ""}|${title}`.toLowerCase();
      const existId = existing[key];

      // Try fuzzy title match if exact key not found
      let docId   = existId;
      let docData = null;

      if (!docId) {
        const res2 = await es.search({
          index: INDEX,
          body: {
            query: { bool: { should: [
              { match: { title:  { query: title || series,  fuzziness: "AUTO", boost: 2 } } },
              { match: { series: { query: series || title, fuzziness: "AUTO" } } },
            ], minimum_should_match: 1 } },
            size: 1,
          }
        });
        if (res2.body.hits.hits.length > 0) {
          docId   = res2.body.hits.hits[0]._id;
          docData = res2.body.hits.hits[0]._source;
        }
      } else {
        const full = await es.get({ index: INDEX, id: docId });
        docData    = full.body._source;
      }

      if (docId && docData) {
        if (direction === "to") {
          const already = (docData.gifted_to || []).some(g => g.person === person);
          if (already) { skipped++; continue; }
          const gifted_to = [...(docData.gifted_to || []), giftEntry];
          await es.update({ index: INDEX, id: docId, body: { doc: { gifted_to } } });
        } else {
          if (docData.gifted_by?.person === person) { skipped++; continue; }
          await es.update({ index: INDEX, id: docId, body: { doc: { gifted_by: giftEntry } } });
        }
        matched++;
        log.push(`✅ ${title || series}`);
      } else {
        // Create new doc
        await es.index({ index: INDEX, body: {
          title: title || series, series, publisher: row["Publisher Name"] || "",
          year: null, owned: false, read: false, on_wish_list: false, tags: [],
          gifted_to:  direction === "to" ? [giftEntry] : [],
          gifted_by:  direction === "by" ? giftEntry   : null,
          createdAt: new Date().toISOString(),
        }});
        created++;
        log.push(`➕ ${title || series} (new)`);
      }
    }

    await es.indices.refresh({ index: INDEX });

    res.json({
      success: true,
      message: `List import complete. Matched: ${matched}, Created: ${created}, Already recorded: ${skipped}`,
      log: log.slice(0, 30),
    });

  } catch (err) {
    console.error("List import error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/analyze ───────────────────────────────────────────────────
router.post("/analyze", requireAuth, async (req, res) => {
  const force = req.body?.force === true;

  // Import the scoring function inline (same logic as analyze-collection.js)
  // We inline it here so the server doesn't need to spawn a child process

  const KEY_SIGNALS = [
    { match: "dc / marvel",            keep: -5,  trade: 35, confidence: "High",    market: "Only DC/Marvel crossover in 30+ years. Event premiums fade — sell while hot." },
    { match: "batman / deadpool",      keep: -5,  trade: 35, confidence: "High",    market: "Short-term speculator magnet. Flip window is short." },
    { match: "superman / spider-man",  keep: -5,  trade: 32, confidence: "High",    market: "Similar to Batman/Deadpool. Flip window is short." },
    { match: "house of x",             keep: 40, trade: -10, confidence: "High",    market: "HOX/POX demand remains strong — modern key." },
    { match: "powers of x",            keep: 38, trade: -10, confidence: "High",    market: "Inseparable from HOX in collector perception." },
    { match: "absolute batman",        keep: 20, trade:   5, confidence: "Medium",  market: "Early issues of prestige runs tend to hold." },
    { match: "edge of spider-verse",   keep: 30, trade:  -5, confidence: "High",    market: "Gwen Stacy as Spider-Woman firmly established in MCU." },
    { match: "ultimate spider-man",    keep: 28, trade:  -5, confidence: "High",    market: "Hickman Ultimate Universe generating strong collector interest." },
    { match: "spider-man: india",      keep: 30, trade:  -5, confidence: "High",    market: "Pavitr in Spider-Verse film. First solo series issues should hold." },
    { match: "napalm lullaby",         keep: 22, trade:   0, confidence: "Medium",  market: "Remender creator-owned Image work has strong back-issue demand." },
    { match: "decorum",                keep: 25, trade:  -5, confidence: "Medium",  market: "Hickman completionists will want this. Undervalued sleeper." },
    { match: "camelot 3000",           keep: 35, trade: -10, confidence: "High",    market: "Bolland pencilled work is rare. Full run genuinely undervalued." },
    { match: "starman",                keep: 32, trade:  -8, confidence: "High",    market: "One of DC's most praised 90s runs. Still underpriced." },
    { match: "stormwatch",             keep: 28, trade:  -5, confidence: "High",    market: "Ellis Authority precursor. Wildstorm bridge issues have strong appeal." },
    { match: "injection",              keep: 22, trade:   0, confidence: "Medium",  market: "Ellis/Shalvey creative pairing has strong demand." },
    { match: "once & future",          keep: 20, trade:   0, confidence: "Medium",  market: "Dan Mora's stock has risen significantly." },
    { match: "immortal x-men",         keep: 18, trade:   5, confidence: "Medium",  market: "Krakoa era over. Sinister issues are the prize." },
    { match: "preacher special",       keep: 18, trade:   5, confidence: "Medium",  market: "Specials harder to find than main series." },
    { match: "batman and robin",       keep: 18, trade:   5, confidence: "Medium",  market: "Morrison Batman saga — key chapter." },
    { match: "spawn",                  keep: 25, trade:  -5, confidence: "High",    market: "Early issues consistently perform at auction." },
    { match: "savage dragon",          keep: 20, trade:   0, confidence: "Medium",  market: "Original issues have steady collector base." },
    { match: "superpatriot",           keep: 15, trade:   8, confidence: "Low",     market: "Curiosity value for Image completionists." },
    { match: "king spawn",             keep:  5, trade:  18, confidence: "Medium",  market: "Less iconic than original McFarlane issues." },
    { match: "eternal warrior",        keep: 25, trade:  -5, confidence: "Medium",  market: "Original Valiant undervalued — slow appreciation." },
    { match: "generation next",        keep: 28, trade:  -5, confidence: "High",    market: "AoA complete set collectors pay more than sum of parts." },
    { match: "weapon x",               keep: 22, trade:   0, confidence: "High",    market: "Weapon X within AoA is a key chapter." },
    { match: "x-man",                  keep: 18, trade:   5, confidence: "Medium",  market: "Origin issues carry the AoA premium." },
    { match: "detective comics",       keep: 20, trade:   0, confidence: "Medium",  market: "Batman collector base is enormous and consistent." },
    { match: "world of krypton",       keep: 22, trade:   0, confidence: "Medium",  market: "Pre-Crisis DC limited series are genuinely scarce." },
    { match: "fury of firestorm",      keep: 12, trade:   8, confidence: "Low",     market: "Niche character with dedicated fans." },
    { match: "justice league america", keep: 15, trade:   5, confidence: "Medium",  market: "Comedic JLA era has a devoted following." },
    { match: "catwoman",               keep: 10, trade:  10, confidence: "Medium",  market: "King's Catwoman well-regarded but supply is high." },
    { match: "superman: son of kal-el", keep: 15, trade:  8, confidence: "Medium",  market: "Jon Kent Superman is here to stay." },
    { match: "secret history of the authority", keep: 15, trade: 8, confidence: "Medium", market: "Wildstorm completionists collect everything Authority-adjacent." },
    { match: "amazing spider-man",     keep: 15, trade:   8, confidence: "Medium",  market: "Key issues within run outperform the run average significantly." },
    { match: "hallows' eve",           keep: 10, trade:  15, confidence: "Medium",  market: "New characters need time to establish value." },
    { match: "immoral x-men",          keep: 12, trade:  12, confidence: "Medium",  market: "Companion to Immortal X-Men." },
    { match: "midnight suns",          keep:  8, trade:  18, confidence: "Medium",  market: "Game tie-in. Game underperformed — limited lasting appeal." },
    { match: "spider-gwen: gwenverse", keep: 10, trade:  15, confidence: "Medium",  market: "Event series — high supply. Core Gwen issues outperform." },
    { match: "spider-gwen: shadow clones", keep: 10, trade: 15, confidence: "Medium", market: "Not a key chapter for the character." },
    { match: "patsy walker",           keep: 18, trade:   5, confidence: "Medium",  market: "Low print run. MCU profile lifted demand." },
    { match: "moon knight",            keep: 18, trade:   5, confidence: "Medium",  market: "MCU surge drove demand. Premium format helps." },
    { match: "star wars: darth vader", keep: 15, trade:   8, confidence: "Medium",  market: "Prestige format variants trade above standard issues." },
    { match: "star wars: darth maul",  keep: 14, trade:   8, confidence: "Medium",  market: "Maul has devoted following. Prestige format helps." },
    { match: "star wars: the mandalorian", keep: 10, trade: 15, confidence: "Medium", market: "Show hype has cooled. High print run." },
    { match: "wild cards",             keep: 20, trade:   0, confidence: "Medium",  market: "Pre-fame GRRM publication. Niche but intensely sought." },
    { match: "tomorrow knights",       keep: 12, trade:  10, confidence: "Low",     market: "Too obscure for mainstream demand." },
    { match: "brzrkr",                 keep: 12, trade:  15, confidence: "Medium",  market: "Celebrity comics peak at launch and correct." },
    { match: "sonic the hedgehog",     keep:  8, trade:  18, confidence: "Medium",  market: "Archie continuity wiped. Niche nostalgia market." },
    { match: "edenwood",               keep: 12, trade:  10, confidence: "Low",     market: "New series — market unproven." },
    { match: "dc's year of the villain", keep: 5, trade: 20, confidence: "High",   market: "Promotional issue. No secondary market value." },
    { match: "batman day",             keep:  5, trade:  20, confidence: "High",    market: "Free promotional giveaway. Not a collectible." },
    { match: "radiant black",          keep: 15, trade:   8, confidence: "Medium",  market: "Modest appreciation trajectory." },
    { match: "adventures of superman", keep: 12, trade:   8, confidence: "Low",     market: "Key issues within the run are the value play." },
  ];

  function scoreComic(comic) {
    let keepScore  = 50;
    let tradeScore = 50;
    const factors  = [];
    let confidence = "Medium";
    let marketNote = "";

    const tl = (comic.title  || "").toLowerCase();
    const sl = (comic.series || "").toLowerCase();

    for (const entry of KEY_SIGNALS) {
      if (tl.includes(entry.match) || sl.includes(entry.match)) {
        keepScore  += entry.keep;
        tradeScore += entry.trade;
        confidence  = entry.confidence;
        marketNote  = entry.market;
        break;
      }
    }

    if (comic.year) {
      if      (comic.year < 1980) { keepScore += 25; tradeScore -= 10; factors.push("Pre-1980 — strong age premium"); }
      else if (comic.year < 1990) { keepScore += 18; tradeScore -= 8;  factors.push("1980s — age premium"); }
      else if (comic.year < 1995) { keepScore += 10; tradeScore -= 3;  factors.push("Early 1990s"); }
      else if (comic.year >= 2022){ tradeScore += 5;                   factors.push("Very recent — value still establishing"); }
    }

    const pub = (comic.publisher || "").toLowerCase();
    if (pub.includes("valiant")  && comic.year < 1997) { keepScore += 12; factors.push("Original Valiant Universe"); }
    if (pub.includes("image")    && comic.year < 1996) { keepScore += 10; factors.push("Early Image Comics founder era"); }
    if (pub.includes("vertigo"))                        { keepScore +=  8; factors.push("Vertigo imprint premium"); }
    if (pub.includes("wildstorm"))                      { keepScore +=  8; factors.push("Wildstorm Ellis era premium"); }

    const tags = comic.tags || [];
    if (tags.includes("Bluechip"))       { keepScore += 20; tradeScore -= 10; factors.push("Your Bluechip tag"); }
    if (tags.includes("Sleeper"))        { keepScore += 10;                   factors.push("Your Sleeper tag — upside potential"); }
    if (tags.includes("Excellent Read")) { keepScore +=  5;                   factors.push("Your Excellent Read tag"); }
    if (tags.includes("Tradable"))       { tradeScore += 25; keepScore -= 10; factors.push("Your Tradable tag — your instinct says move it"); }

    if (comic.read)          { tradeScore += 4; factors.push("Already read"); }
    else                     { keepScore  += 3; factors.push("Unread — still has personal reading value"); }

    if ((comic.gifted_to||[]).length > 0) { keepScore +=  8; factors.push("Has gifting history"); }
    if (comic.gifted_by?.person)          { keepScore += 12; factors.push(`Gift from ${comic.gifted_by.person}`); }

    if (comic.condition) {
      const c = comic.condition.toLowerCase();
      if (c.includes("near mint") || c.includes("nm")) { keepScore  += 8; factors.push("Near Mint condition"); }
      else if (c.includes("good") || c.includes("poor")) { tradeScore += 10; factors.push("Lower grade condition"); }
    }

    keepScore  = Math.max(0, Math.min(100, Math.round(keepScore)));
    tradeScore = Math.max(0, Math.min(100, Math.round(tradeScore)));

    let recommendation;
    if      (tradeScore >= 65 || (tags.includes("Tradable") && tradeScore >= 50)) recommendation = "Trade";
    else if (keepScore  >= 70 || keepScore - tradeScore >= 25)                    recommendation = "Keep Long Term";
    else                                                                           recommendation = "Keep Short Term";

    if (!marketNote) {
      if      (recommendation === "Trade")           marketNote = "Trade value exceeds long-term appreciation potential.";
      else if (recommendation === "Keep Long Term")  marketNote = "Strong long-term appreciation potential.";
      else                                           marketNote = "Hold and monitor — value factors are mixed.";
    }

    const uniqueFactors = [...new Set(factors)].slice(0, 8);
    const summary = recommendation === "Trade"
      ? `${comic.series||comic.title} scores higher on trade potential (${tradeScore}) than keep value (${keepScore}). ${uniqueFactors[0]||""}`
      : `${comic.series||comic.title} is a ${recommendation.toLowerCase()} (keep: ${keepScore}). ${uniqueFactors[0]||""} ${uniqueFactors[1]||""}`;

    return { recommendation, keep_score: keepScore, trade_score: tradeScore, analysis_confidence: confidence, analysis_summary: summary, value_factors: uniqueFactors, market_note: marketNote, analyzed_at: new Date().toISOString() };
  }

  try {
    const query = force
      ? { term: { owned: true } }
      : { bool: { filter: [{ term: { owned: true } }], must_not: [{ exists: { field: "recommendation" } }] } };

    const esRes = await es.search({
      index: INDEX,
      body: { query, _source: ["title","series","publisher","year","tags","read","gifted_to","gifted_by","condition"], size: 500 }
    });

    const comics = esRes.body.hits.hits.map(h => ({ id: h._id, ...h._source }));

    if (comics.length === 0) {
      return res.json({ success: true, message: force ? "No owned comics found." : "All comics already analyzed.", analyzed: 0 });
    }

    const scored = comics.map(c => ({ id: c.id, result: scoreComic(c) }));
    scored.sort((a, b) => b.result.trade_score - a.result.trade_score);
    scored.forEach((item, i) => { item.result.trade_rank = i + 1; });

    for (const { id, result } of scored) {
      await es.update({ index: INDEX, id, body: { doc: result } });
    }
    await es.indices.refresh({ index: INDEX });

    const keepLong  = scored.filter(s => s.result.recommendation === "Keep Long Term").length;
    const keepShort = scored.filter(s => s.result.recommendation === "Keep Short Term").length;
    const trade     = scored.filter(s => s.result.recommendation === "Trade").length;

    res.json({
      success: true,
      message: `Analysis complete. ${scored.length} comics scored.`,
      analyzed: scored.length,
      summary: { keep_long: keepLong, keep_short: keepShort, trade },
    });

  } catch (err) {
    console.error("Analyze error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/fetch-covers ──────────────────────────────────────────────
router.post("/fetch-covers", requireAuth, async (req, res) => {
  const API_KEY = process.env.COMIC_VINE_API_KEY;
  if (!API_KEY) return res.status(400).json({ error: "COMIC_VINE_API_KEY not set in environment variables" });

  // Return immediately and run in background
  res.json({ success: true, message: "Cover fetch started in background. Check the app in ~30 minutes." });

  // Run async without blocking the response
  (async () => {
    try {
      const missing = await es.search({
        index: INDEX,
        body: {
          query: { bool: { should: [
            { bool: { must_not: { exists: { field: "coverImage" } } } },
            { term: { coverImage: "" } },
          ], minimum_should_match: 1 } },
          _source: ["title", "series", "year"],
          size: 500,
        }
      });

      const docs = missing.body.hits.hits;
      console.log(`[fetch-covers] Starting fetch for ${docs.length} comics...`);

      for (let i = 0; i < docs.length; i++) {
        const { _id, _source } = docs[i];
        const searchTerm = _source.series || _source.title;

        try {
          const url = `https://comicvine.gamespot.com/api/search/?api_key=${API_KEY}&format=json&query=${encodeURIComponent(searchTerm)}&resources=volume&field_list=name,image,start_year&limit=3`;
          const cvRes = await fetch(url, { headers: { "User-Agent": "JacobsComicBooks/1.0" } });
          if (!cvRes.ok) { await new Promise(r => setTimeout(r, 20000)); continue; }
          const data = await cvRes.json();

          const results = data.results || [];
          const match = results.find(r => {
            const rn = (r.name||"").toLowerCase();
            const qn = searchTerm.toLowerCase();
            return rn === qn || rn.includes(qn) || qn.includes(rn);
          });

          if (match?.image?.medium_url) {
            await es.update({ index: INDEX, id: _id, body: { doc: { coverImage: match.image.medium_url } } });
            console.log(`[fetch-covers] ✅ ${searchTerm}`);
          } else {
            console.log(`[fetch-covers] ⚠️  ${searchTerm} — no match`);
          }
        } catch (e) {
          console.log(`[fetch-covers] ⚠️  ${searchTerm} — ${e.message}`);
        }

        if (i < docs.length - 1) await new Promise(r => setTimeout(r, 20000));
      }

      await es.indices.refresh({ index: INDEX });
      console.log(`[fetch-covers] Done.`);
    } catch (e) {
      console.error("[fetch-covers] Fatal error:", e.message);
    }
  })();
});

// ── GET /api/admin/gap-analysis ───────────────────────────────────────────────
router.get("/gap-analysis", requireAuth, async (req, res) => {
  try {
    // Run sequentially to avoid Bonsai free tier concurrent request limit
    const bluechips      = await es.search({ index: INDEX, body: { query: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Bluechip" } }] } }, _source: ["series","publisher","writer"], size: 100 } });
    const wishList       = await es.search({ index: INDEX, body: { query: { bool: { filter: [{ term: { on_wish_list: true } }, { term: { owned: false } }] } }, _source: ["series","publisher","writer","locg_url"], size: 100 } });
    const tradable       = await es.search({ index: INDEX, body: { query: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Tradable" } }] } }, _source: ["series","publisher","year","condition","tags"], size: 50 } });
    const sleepersUnread = await es.search({ index: INDEX, body: { query: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Sleeper" } }, { term: { read: false } }] } }, _source: ["series","publisher","year","writer"], sort: [{ year: "asc" }], size: 50 } });
    const totalOwned     = await es.count({ index: INDEX, body: { query: { term: { owned: true } } } });
    const totalRead      = await es.count({ index: INDEX, body: { query: { bool: { filter: [{ term: { owned: true } }, { term: { read: true } }] } } } });
    const totalWish      = await es.count({ index: INDEX, body: { query: { bool: { filter: [{ term: { on_wish_list: true } }, { term: { owned: false } }] } } } });

    const ownedPublishers = new Set(bluechips.body.hits.hits.map(h => h._source.publisher));
    const ownedWriters    = new Set(bluechips.body.hits.hits.map(h => h._source.writer).filter(Boolean));

    const priorityWishList = wishList.body.hits.hits
      .filter(h => ownedPublishers.has(h._source.publisher) || (h._source.writer && ownedWriters.has(h._source.writer)))
      .map(h => ({ ...h._source, id: h._id }));

    res.json({
      summary: {
        owned:     totalOwned.body.count,
        read:      totalRead.body.count,
        read_rate: Math.round((totalRead.body.count / totalOwned.body.count) * 100),
        wish_list: totalWish.body.count,
      },
      priority_wish_list: priorityWishList,
      tradable:           tradable.body.hits.hits.map(h => ({ ...h._source, id: h._id })),
      unread_sleepers:    sleepersUnread.body.hits.hits.map(h => ({ ...h._source, id: h._id })),
    });

  } catch (err) {
    console.error("Gap analysis error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/status ─────────────────────────────────────────────────────
router.get("/status", requireAuth, async (req, res) => {
  try {
    const total      = await es.count({ index: INDEX });
    const owned      = await es.count({ index: INDEX, body: { query: { term: { owned: true } } } });
    const withCovers = await es.count({ index: INDEX, body: { query: { bool: { must_not: [{ term: { coverImage: "" } }], filter: [{ exists: { field: "coverImage" } }] } } } });
    const analyzed   = await es.count({ index: INDEX, body: { query: { bool: { filter: [{ exists: { field: "recommendation" } }] } } } });
    res.json({
      total_docs:    total.body.count,
      owned:         owned.body.count,
      with_covers:   withCovers.body.count,
      analyzed:      analyzed.body.count,
      comic_vine_key: !!process.env.COMIC_VINE_API_KEY,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
