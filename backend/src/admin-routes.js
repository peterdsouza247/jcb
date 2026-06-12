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

  // ── Knowledge base (multi-dimensional) ──────────────────────────────────
  const SERIES_KB = [
    { match: ["dc / marvel","batman / deadpool","superman / spider-man"], intrinsic: 28, market: "peak",     replaceability: "very_hard", confidence: "high",   market_detail: "Only DC/Marvel crossover in 30+ years. Event premiums fade 40-60% within 18 months.", factors: ["Only DC/Marvel crossover since 1996","Historic publishing event","Speculator demand at maximum"] },
    { match: ["house of x"],                 intrinsic: 40, market: "stable",   replaceability: "moderate",  confidence: "high",   market_detail: "HOX/POX demand durable — already entering back-issue staple territory.", factors: ["Rewrote X-Men continuity","Hickman landmark","CGC submission rate high"] },
    { match: ["powers of x"],                intrinsic: 38, market: "stable",   replaceability: "moderate",  confidence: "high",   market_detail: "Inseparable from HOX in collector perception. Both or neither.", factors: ["Paired with HOX — complete story","Hickman landmark"] },
    { match: ["ultimate spider-man"],        intrinsic: 32, market: "rising",   replaceability: "moderate",  confidence: "high",   market_detail: "Hickman Ultimate Universe sustained interest. Early issues likely to appreciate further.", factors: ["Hickman relaunch","Strong critical reception","Early in potential long run"] },
    { match: ["edge of spider-verse"],       intrinsic: 35, market: "stable",   replaceability: "hard",      confidence: "high",   market_detail: "Gwen Stacy as Ghost-Spider is permanently established post-MCU. Durable demand.", factors: ["Spider-Gwen first appearance context","MCU character","Film franchise"] },
    { match: ["spider-man: india"],          intrinsic: 30, market: "rising",   replaceability: "hard",      confidence: "high",   market_detail: "Pavitr in Across the Spider-Verse. First solo series for film-featured character. Still early in curve.", factors: ["Spider-Verse film appearance","Culturally significant","First solo series"] },
    { match: ["absolute batman"],            intrinsic: 22, market: "rising",   replaceability: "moderate",  confidence: "medium", market_detail: "Snyder Batman return — still in rising phase. Watch for key issue developments.", factors: ["Scott Snyder return","Prestige format","Potential long run"] },
    { match: ["moon knight"],                intrinsic: 22, market: "stable",   replaceability: "hard",      confidence: "medium", market_detail: "MCU surge. Premium format in limited print holding value post-hype.", factors: ["MCU character surge","Black White Blood prestige format"] },
    { match: ["hallows' eve"],               intrinsic: 12, market: "cooling",  replaceability: "very_easy", confidence: "medium", market_detail: "New character — unproven market. No urgency either way.", factors: ["New character","Market unproven"] },
    { match: ["midnight suns"],              intrinsic: 8,  market: "dead",     replaceability: "very_easy", confidence: "high",   market_detail: "Game tie-in. Game underperformed. Not on cult classic trajectory.", factors: ["Game tie-in","Game underperformed","High print run"] },
    { match: ["spider-gwen"],                intrinsic: 15, market: "cooling",  replaceability: "easy",      confidence: "medium", market_detail: "Gwen's popularity real but these event series are not key chapters. Core Gwen outperforms.", factors: ["Character demand real","Event series — high supply"] },
    { match: ["patsy walker","hellcat"],     intrinsic: 22, market: "stable",   replaceability: "hard",      confidence: "high",   market_detail: "Low print run + MCU profile = durable demand. Already partially appreciated.", factors: ["Kate Leth — cult run","Genuinely low print run","MCU Hellcat appearance"] },
    { match: ["amazing spider-man"],         intrinsic: 18, market: "stable",   replaceability: "easy",      confidence: "low",    market_detail: "Perpetual demand but perpetual supply. Key appearances vastly outperform run average.", factors: ["Flagship title","Issue-specific value — need to identify keys","High print run"] },
    { match: ["star wars: darth vader"],     intrinsic: 18, market: "stable",   replaceability: "hard",      confidence: "medium", market_detail: "Vader — most collectible SW character. Prestige format above standard SW issues.", factors: ["Darth Vader demand","Black White Red prestige format"] },
    { match: ["star wars: darth maul"],      intrinsic: 16, market: "stable",   replaceability: "hard",      confidence: "medium", market_detail: "Maul cult following. Similar to Vader BWR but slightly lower demand.", factors: ["Maul cult following","Black White Red prestige format"] },
    { match: ["star wars: the mandalorian"], intrinsic: 12, market: "cooling",  replaceability: "very_easy", confidence: "high",   market_detail: "Show hype cooled. High print run = heavy supply. Not a priority hold.", factors: ["Show hype cooled","High print run"] },
    { match: ["napalm lullaby"],             intrinsic: 20, market: "rising",   replaceability: "hard",      confidence: "medium", market_detail: "Remender creator-owned Image. Low print run likely. Still early in appreciation.", factors: ["Remender creator-owned","Image first issues collect well","Likely low print run"] },
    { match: ["decorum"],                    intrinsic: 24, market: "stable",   replaceability: "hard",      confidence: "medium", market_detail: "Hickman completionists reliable collector base. Genuine sleeper — undersold at publication.", factors: ["Hickman + Huddleston","Structurally unique","Limited issues"] },
    { match: ["radiant black"],              intrinsic: 14, market: "stable",   replaceability: "easy",      confidence: "medium", market_detail: "Indie superhero — loyal audience, limited crossover. Slow burner.", factors: ["Kyle Higgins creator-owned","Limited mainstream crossover"] },
    { match: ["edenwood"],                   intrinsic: 12, market: "rising",   replaceability: "moderate",  confidence: "low",    market_detail: "New series — entirely unproven. Daniel's name carries some weight.", factors: ["Tony Daniel creator-owned","Market completely unproven"] },
    { match: ["brzrkr"],                     intrinsic: 12, market: "cooling",  replaceability: "very_easy", confidence: "high",   market_detail: "Celebrity comics peak at launch and correct hard. High print run. Correction underway.", factors: ["Celebrity comic","High print run","No ongoing story engine"] },
    { match: ["camelot 3000"],               intrinsic: 38, market: "stable",   replaceability: "very_hard", confidence: "high",   market_detail: "Bolland pencilled interiors are exceptionally rare. Full run genuinely undervalued.", factors: ["Brian Bolland full interior pencils — extremely rare","1982 prestige format pioneer","Complete 12-issue limited run"] },
    { match: ["starman"],                    intrinsic: 35, market: "stable",   replaceability: "hard",      confidence: "high",   market_detail: "Omnibus drove renewed interest. One of DC's most literary runs — consistently studied.", factors: ["James Robinson career-defining","Complete run premium substantial","Omnibus validated collector interest"] },
    { match: ["detective comics"],           intrinsic: 22, market: "stable",   replaceability: "moderate",  confidence: "low",    market_detail: "Value entirely issue/run dependent. Batman collector base enormous.", factors: ["Longest-running DC title","Issue-specific value critical"] },
    { match: ["batman and robin"],           intrinsic: 20, market: "stable",   replaceability: "moderate",  confidence: "medium", market_detail: "Morrison Batman saga — key chapter. Professor Pyg first appearance in this run.", factors: ["Grant Morrison Batman era","Dick Grayson as Batman","Professor Pyg first appearance"] },
    { match: ["catwoman"],                   intrinsic: 14, market: "stable",   replaceability: "easy",      confidence: "medium", market_detail: "King run well-regarded but heavily stocked. Not a standout performer.", factors: ["Tom King — acclaimed","High supply","No standout key issues"] },
    { match: ["superman: son of kal-el"],    intrinsic: 18, market: "stable",   replaceability: "easy",      confidence: "medium", market_detail: "Issue #18 (coming out) is the key. Other issues have modest interest.", factors: ["Jon Kent established character","Issue #18 is genuine key"] },
    { match: ["world of krypton"],           intrinsic: 26, market: "stable",   replaceability: "hard",      confidence: "high",   market_detail: "First Superman limited series in DC history. Pre-Crisis scarce in high grade.", factors: ["1979 DC — age premium","First Superman limited series","Pre-Crisis collector appeal"] },
    { match: ["fury of firestorm"],          intrinsic: 14, market: "stable",   replaceability: "moderate",  confidence: "low",    market_detail: "Firestorm cult following keeps demand steady at low level.", factors: ["1980s DC age premium","Firestorm cult character"] },
    { match: ["justice league america"],     intrinsic: 18, market: "stable",   replaceability: "moderate",  confidence: "medium", market_detail: "Giffen/DeMatteis era is a cult classic. Convention staple.", factors: ["Bwahahaha era — cult classic","Booster/Blue Beetle beloved","Unique comedic tone"] },
    { match: ["dc's year of the villain"],  intrinsic: 2,  market: "dead",     replaceability: "very_easy", confidence: "high",   market_detail: "Promotional giveaway. Not a collectible.", factors: ["Promotional giveaway","No scarcity","No key issue status"] },
    { match: ["batman day"],                 intrinsic: 2,  market: "dead",     replaceability: "very_easy", confidence: "high",   market_detail: "Free promotional giveaway. Not a collectible.", factors: ["Free promotional giveaway","No collectible status"] },
    { match: ["secret history of the authority"], intrinsic: 16, market: "stable", replaceability: "hard",   confidence: "medium", market_detail: "Wildstorm completionists collect everything Authority-adjacent.", factors: ["Authority universe","Limited series"] },
    { match: ["adventures of superman"],     intrinsic: 14, market: "stable",   replaceability: "moderate",  confidence: "low",    market_detail: "Key issues within the run are the value play.", factors: ["Post-Crisis era","Issue-specific value"] },
    { match: ["preacher special"],           intrinsic: 20, market: "stable",   replaceability: "hard",      confidence: "medium", market_detail: "Vertigo specials scarcer than main series. TV legacy keeps demand.", factors: ["Vertigo special — scarcer than main series","Ennis/Dillon peak work"] },
    { match: ["spawn"],                      intrinsic: 30, market: "stable",   replaceability: "hard",      confidence: "high",   market_detail: "Longest-running creator-owned superhero. Early issues consistently perform at auction.", factors: ["Todd McFarlane creator-owned icon","30+ year history","Early issues genuinely scarce in high grade"] },
    { match: ["savage dragon"],              intrinsic: 22, market: "stable",   replaceability: "hard",      confidence: "medium", market_detail: "Image founder era. Still ongoing — keeps interest alive.", factors: ["Erik Larsen creator-owned","Image founder era","Still ongoing"] },
    { match: ["superpatriot"],               intrinsic: 14, market: "stable",   replaceability: "hard",      confidence: "low",    market_detail: "Low print run creates real scarcity despite low profile.", factors: ["Early Image — low print run","Genuine scarcity"] },
    { match: ["king spawn"],                 intrinsic: 10, market: "cooling",  replaceability: "easy",      confidence: "medium", market_detail: "Modern spin-off. Less iconic than McFarlane-era issues.", factors: ["Modern Spawn spin-off","Higher print run than original"] },
    { match: ["stormwatch"],                 intrinsic: 28, market: "stable",   replaceability: "very_hard", confidence: "high",   market_detail: "Ellis Authority precursor. Most influential late-90s superhero origin. Very hard to find in high grade.", factors: ["Authority precursor — Warren Ellis","Most influential late-90s superhero origin","Extremely hard to find in high grade"] },
    { match: ["injection"],                  intrinsic: 22, market: "stable",   replaceability: "hard",      confidence: "medium", market_detail: "Incomplete series — only 15 issues. Ellis/Shalvey pairing strong demand.", factors: ["Ellis + Shalvey","Only 15 issues — series ended","Complete run is the target"] },
    { match: ["once & future"],              intrinsic: 20, market: "rising",   replaceability: "moderate",  confidence: "medium", market_detail: "Dan Mora's profile has risen significantly. Early issues being revisited by collectors.", factors: ["Kieron Gillen + Dan Mora","BOOM! Studios collector following","Dan Mora — rising star"] },
    { match: ["eternal warrior"],            intrinsic: 26, market: "rising",   replaceability: "hard",      confidence: "medium", market_detail: "Original Valiant Universe undervalued relative to VU peers. Film option interest lifting whole VU.", factors: ["Original Valiant Universe 1992","Low original print run","Valiant originals rising"] },
    { match: ["generation next"],            intrinsic: 28, market: "stable",   replaceability: "hard",      confidence: "high",   market_detail: "AoA complete set premium. Bachalo art at peak. Keep with other AoA issues.", factors: ["Age of Apocalypse — landmark event","Complete 4-issue run","Chris Bachalo peak art"] },
    { match: ["weapon x"],                   intrinsic: 24, market: "stable",   replaceability: "hard",      confidence: "high",   market_detail: "Wolverine collector demand is one of the deepest in comics. AoA crossover premium.", factors: ["Weapon X — Wolverine centrepiece","AoA crossover chapter","Wolverine demand is deep"] },
    { match: ["x-man"],                      intrinsic: 20, market: "stable",   replaceability: "moderate",  confidence: "medium", market_detail: "AoA origin issues carry event premium. Later ongoing is mid-tier.", factors: ["AoA origin — event premium","Nate Grey cult following"] },
    { match: ["wild cards"],                 intrinsic: 22, market: "stable",   replaceability: "very_hard", confidence: "medium", market_detail: "Pre-fame GRRM material actively sought. Genuinely obscure — real scarcity.", factors: ["George RR Martin IP","Pre-Game of Thrones","Genuinely obscure"] },
    { match: ["tomorrow knights"],           intrinsic: 12, market: "stable",   replaceability: "very_hard", confidence: "low",    market_detail: "Low print run but demand hasn't materialised. May never.", factors: ["1990 Marvel — low print run","Genuine scarcity","Demand unproven"] },
    { match: ["sonic the hedgehog"],         intrinsic: 10, market: "cooling",  replaceability: "very_easy", confidence: "medium", market_detail: "Archie continuity wiped. Niche nostalgia market shrinking.", factors: ["Archie continuity ended","Nostalgia-driven only"] },
    { match: ["immortal x-men"],             intrinsic: 22, market: "stable",   replaceability: "easy",      confidence: "medium", market_detail: "Krakoa era complete. Full run collectible as unit. Sinister issues are the prize.", factors: ["Gillen Krakoa era","Sinister key issues within run","Complete run now possible"] },
    { match: ["immoral x-men"],              intrinsic: 18, market: "stable",   replaceability: "easy",      confidence: "medium", market_detail: "Companion to Immortal X-Men. Collectors who want one want both.", factors: ["Krakoa era tie-in","Short series"] },
  ];

  // ── Dimension scoring functions ──────────────────────────────────────────
  function findKB(comic) {
    const tl = (comic.title  || "").toLowerCase();
    const sl = (comic.series || "").toLowerCase();
    return SERIES_KB.find(e => e.match.some(m => tl.includes(m) || sl.includes(m)));
  }

  function detectRunCompletion(allComics) {
    const bySeries = {};
    allComics.forEach(c => {
      if (!c.series) return;
      if (!bySeries[c.series]) bySeries[c.series] = 0;
      bySeries[c.series]++;
    });
    const signals = {};
    Object.entries(bySeries).forEach(([s, count]) => {
      if (count >= 2) signals[s] = { count, bonus: Math.min(15, count * 3), note: `Own ${count} issues — complete run premium` };
    });
    return signals;
  }

  function scoreIntrinsic(comic, kb) {
    let score = kb ? kb.intrinsic : 15;
    const notes = [...(kb?.factors || [])];
    if (comic.year) {
      if      (comic.year < 1975) { score += 20; notes.push("Pre-1975 — substantial age premium"); }
      else if (comic.year < 1980) { score += 15; notes.push("Late 1970s — strong age premium"); }
      else if (comic.year < 1985) { score += 12; notes.push("Early 1980s — age premium"); }
      else if (comic.year < 1990) { score += 8;  notes.push("Mid-late 1980s — age premium"); }
      else if (comic.year < 1993) { score += 5;  notes.push("Early 1990s — modest age premium"); }
    }
    const pub = (comic.publisher || "").toLowerCase();
    if (pub.includes("valiant")   && comic.year < 1997) { score += 10; notes.push("Original Valiant Universe"); }
    if (pub.includes("vertigo"))                         { score +=  6; notes.push("Vertigo imprint premium"); }
    if (pub.includes("wildstorm"))                       { score +=  6; notes.push("Wildstorm collector premium"); }
    if (pub.includes("image")     && comic.year < 1996) { score +=  8; notes.push("Early Image founder era"); }
    if (comic.condition) {
      const c = comic.condition.toLowerCase();
      if      (c.includes("near mint") || c.includes("nm")) { score += 8; notes.push("Near Mint condition"); }
      else if (c.includes("good") || c.includes("poor"))    { score -= 5; notes.push("Lower grade condition"); }
    }
    return { score: Math.max(0, Math.min(100, score)), notes };
  }

  function scorePersonal(comic, runSignals) {
    let score = 30;
    const notes = [];
    const tags = comic.tags || [];
    if (tags.includes("Bluechip"))       { score += 30; notes.push("Your Bluechip tag"); }
    if (tags.includes("Sleeper"))        { score += 15; notes.push("Your Sleeper tag"); }
    if (tags.includes("Excellent Read")) { score += 10; notes.push("Your Excellent Read tag"); }
    if (tags.includes("Tradable"))       { score -= 25; notes.push("Your Tradable tag"); }
    if (!comic.read) { score += 8;  notes.push("Unread — reading value not yet realised"); }
    else             { score -= 5;  notes.push("Already read"); }
    if ((comic.gifted_to||[]).length > 0) { score += 10; notes.push("Has gifting provenance"); }
    if (comic.gifted_by?.person)          { score += 18; notes.push(`Gift from ${comic.gifted_by.person}`); }
    const run = runSignals[comic.series];
    if (run) { score += run.bonus; notes.push(run.note); }
    return { score: Math.max(0, Math.min(100, score)), notes };
  }

  function scoreMarketTiming(kb) {
    if (!kb) return { score: 50, notes: ["Market timing unassessed"], urgency: "none" };
    const MAP = {
      peak:    { score: 80, urgency: "high",   notes: ["Market at PEAK — strong sell signal"] },
      rising:  { score: 30, urgency: "low",    notes: ["Market RISING — let it appreciate"] },
      stable:  { score: 45, urgency: "none",   notes: ["Market STABLE — no urgency"] },
      cooling: { score: 65, urgency: "medium", notes: ["Market COOLING — consider selling"] },
      dead:    { score: 90, urgency: "high",   notes: ["Market DEAD — no appreciation potential"] },
    };
    const r = { ...MAP[kb.market] || MAP.stable };
    if (kb.market_detail) r.notes.push(kb.market_detail);
    return r;
  }

  function scoreReplaceability(kb) {
    if (!kb) return { score: 50, notes: ["Replaceability unknown"] };
    const MAP = {
      very_hard: { score: 10, notes: ["Extremely hard to replace once sold"] },
      hard:      { score: 25, notes: ["Hard to replace — limited secondary market supply"] },
      moderate:  { score: 50, notes: ["Moderate replaceability"] },
      easy:      { score: 75, notes: ["Easy to replace — abundant supply"] },
      very_easy: { score: 90, notes: ["Very easy to replace"] },
    };
    return MAP[kb.replaceability] || MAP.moderate;
  }

  function deriveRecommendation(intrinsic, personal, market, replace, kb, comic) {
    const tags = comic.tags || [];
    if (tags.includes("Tradable") && personal.score < 40)
      return { recommendation: "Trade", urgency: "low", reason: "Your Tradable tag combined with low personal value — trust your instinct." };
    if (comic.gifted_by?.person && personal.score >= 60)
      return { recommendation: "Keep Long Term", urgency: "none", reason: `Gift from ${comic.gifted_by.person} — sentimental value overrides market signals.` };
    if (kb?.market === "dead" && intrinsic.score < 20)
      return { recommendation: "Trade", urgency: "high", reason: kb.market_detail || "No appreciation potential and market is dead." };

    const hi  = intrinsic.score >= 55;
    const hp  = personal.score  >= 55;
    const mp  = market.score    >= 70;
    const er  = replace.score   >= 65;

    if (hi && hp)            return { recommendation: "Keep Long Term",  urgency: "none",           reason: "Strong intrinsic and personal value — a core collection piece." };
    if (hi && !hp && mp && er) return { recommendation: "Trade",         urgency: "high",           reason: "Peak market, low personal attachment, easy to replace. Optimal sell window." };
    if (hi && !hp && mp)     return { recommendation: "Keep Short Term", urgency: "none",           reason: "Peak market but hard to replace — monitor before deciding." };
    if (hi && !hp)           return { recommendation: "Keep Short Term", urgency: "none",           reason: "Good intrinsic value. Personal attachment is low but market may improve." };
    if (!hi && hp)           return { recommendation: "Keep Short Term", urgency: "none",           reason: "Personal value is the primary driver. Keep while it matters to you." };
    if (!hi && !hp && replace.score <= 30) return { recommendation: "Keep Short Term", urgency: "none", reason: "Low value signals but hard to replace — hold until sure." };
    return { recommendation: "Trade", urgency: mp ? "high" : "low",     reason: "Low intrinsic and personal value. No strong case for holding." };
  }

  function scoreComic(comic, runSignals) {
    const kb        = findKB(comic);
    const intrinsic = scoreIntrinsic(comic, kb);
    const personal  = scorePersonal(comic, runSignals);
    const market    = scoreMarketTiming(kb);
    const replace   = scoreReplaceability(kb);
    const { recommendation, urgency, reason } = deriveRecommendation(intrinsic, personal, market, replace, kb, comic);

    const tradeScore = Math.round((market.score * 0.35) + ((100 - intrinsic.score) * 0.25) + ((100 - personal.score) * 0.25) + (replace.score * 0.15));
    const keepScore  = Math.round((intrinsic.score * 0.40) + (personal.score * 0.30) + ((100 - market.score) * 0.15) + ((100 - replace.score) * 0.15));

    const allFactors = [...new Set([
      ...intrinsic.notes.slice(0, 3),
      ...personal.notes.slice(0, 2),
      ...market.notes.slice(0, 2),
      ...replace.notes.slice(0, 1),
    ])].slice(0, 8);

    const issueNote = kb?.issue_notes || "";
    const summary   = `${reason}${issueNote ? " " + issueNote : ""}`;

    return {
      recommendation,
      trade_score:          Math.max(0, Math.min(100, tradeScore)),
      keep_score:           Math.max(0, Math.min(100, keepScore)),
      analysis_confidence:  kb?.confidence || "low",
      analysis_summary:     summary,
      value_factors:        allFactors,
      market_note:          kb?.market_detail || "No specific market data for this series.",
      trade_urgency:        urgency,
      dim_intrinsic:        intrinsic.score,
      dim_personal:         personal.score,
      dim_market:           market.score,
      dim_replaceability:   replace.score,
      analyzed_at:          new Date().toISOString(),
    };
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

    // Build run completion signals
    const allRes    = await es.search({ index: INDEX, body: { query: { term: { owned: true } }, _source: ["series"], size: 500 } });
    const allOwned  = allRes.body.hits.hits.map(h => h._source);
    const runSignals = detectRunCompletion(allOwned);

    const scored = comics.map(c => ({ id: c.id, result: scoreComic(c, runSignals) }));

    // Rank by urgency then trade score
    const urgencyOrder = { high: 0, medium: 1, low: 2, none: 3 };
    const rankSorted = [...scored].sort((a, b) => {
      const ud = (urgencyOrder[a.result.trade_urgency]||3) - (urgencyOrder[b.result.trade_urgency]||3);
      return ud !== 0 ? ud : b.result.trade_score - a.result.trade_score;
    });
    rankSorted.forEach((item, i) => { item.result.trade_rank = i + 1; });

    for (const { id, result } of scored) {
      await es.update({ index: INDEX, id, body: { doc: result } });
    }
    await es.indices.refresh({ index: INDEX });

    const keepLong  = scored.filter(s => s.result.recommendation === "Keep Long Term").length;
    const keepShort = scored.filter(s => s.result.recommendation === "Keep Short Term").length;
    const trade     = scored.filter(s => s.result.recommendation === "Trade").length;

    res.json({
      success: true,
      message: `Analysis complete. ${scored.length} comics scored with multi-dimensional engine.`,
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
