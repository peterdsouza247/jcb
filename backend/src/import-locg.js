/**
 * import-locg.js — Import your League of Comic Geeks CSV export
 *
 * HOW TO GET YOUR CSV:
 *   1. Go to https://leagueofcomicgeeks.com/profile/GreyWarden247/collection
 *   2. Click "Collection Stats" → "Export Collection" (bottom of the page)
 *   3. Save the CSV file as locg-export.csv in the backend/ folder
 *   4. Run: node src/import-locg.js
 *
 * This script is NON-DESTRUCTIVE for custom data:
 *   - If a comic already exists in ES (matched by locg_id), it merges the
 *     LoCG data in but preserves your custom fields:
 *     notes, gifted_to, gifted_by, condition, storage_box, est_value, rating
 *   - New comics are added fresh.
 *   - Comics no longer in your LoCG export are left untouched.
 *
 * Run with: npm run import-locg
 */

import { Client } from "@elastic/elasticsearch";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import dotenv from "dotenv";
dotenv.config();

const esConfig = process.env.ELASTIC_CLOUD_ID
  ? { cloud: { id: process.env.ELASTIC_CLOUD_ID }, auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD } }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es = new Client(esConfig);
const INDEX = "comics";

// ── LoCG CSV column mapping ──────────────────────────────────────────────────
// LoCG export headers (as of 2024):
// Series Name, Issue Number, Issue Title, Publisher, Release Date, Cover Price,
// My Rating, Read, Owned, Wishlist, Reading List, Tags, Notes, Cover URL
//
// Map each header to our ES field name
const HEADER_MAP = {
  "Series Name":    "series",
  "Issue Number":   "issue",
  "Issue Title":    "title",
  "Publisher":      "publisher",
  "Release Date":   "release_date",   // we'll extract year from this
  "Cover Price":    "cover_price",
  "My Rating":      "rating",
  "Read":           "read",
  "Owned":          "owned",
  "Wishlist":       "on_wish_list",
  "Reading List":   "on_reading_list",
  "Tags":           "tags",
  "Notes":          "notes",
  "Cover URL":      "coverImage",
  "Series ID":      "locg_id",        // if present in the export
};

function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function rowToDoc(headers, values) {
  const raw = {};
  headers.forEach((h, i) => {
    const field = HEADER_MAP[h] || h.toLowerCase().replace(/\s+/g, "_");
    raw[field] = values[i] ?? "";
  });

  // Extract year from release date (YYYY-MM-DD or MM/DD/YYYY)
  let year = null;
  if (raw.release_date) {
    const m = raw.release_date.match(/(\d{4})/);
    if (m) year = parseInt(m[1]);
  }

  // Parse tags — LoCG exports as comma-separated string within the field
  let tags = [];
  if (raw.tags) {
    tags = raw.tags.split(",").map(t => t.trim()).filter(Boolean);
  }

  // Parse booleans — LoCG uses "1"/"0" or "true"/"false"
  const bool = (v) => v === "1" || v === "true" || v === "Yes";

  // Build the issue title: prefer explicit title, fall back to series + issue
  const issue = raw.issue ? parseInt(raw.issue) : null;
  const title = raw.title || (raw.series + (issue ? ` #${issue}` : ""));

  return {
    series:       raw.series || "",
    issue,
    title,
    publisher:    raw.publisher || "",
    year,
    cover_price:  raw.cover_price ? parseFloat(raw.cover_price.replace(/[^0-9.]/g, "")) : null,
    rating:       raw.rating ? parseInt(raw.rating) : null,
    read:         bool(raw.read),
    owned:        bool(raw.owned),
    on_wish_list: bool(raw.on_wish_list),
    tags,
    notes:        raw.notes || "",
    coverImage:   raw.coverimage || "",
    locg_id:      raw.locg_id || null,
    // Build LoCG deep link if we have an ID
    locg_url:     raw.locg_id
      ? `https://leagueofcomicgeeks.com/profile/GreyWarden247/collection/${raw.locg_id}`
      : null,
  };
}

// Fields we NEVER overwrite on existing docs — your custom data is sacred
const PRESERVED_FIELDS = ["gifted_to", "gifted_by", "condition", "storage_box", "est_value", "rating", "notes"];

async function importCSV(csvPath) {
  console.log(`📂 Reading ${csvPath}...`);

  const lines = [];
  const rl = createInterface({ input: createReadStream(csvPath) });
  for await (const line of rl) lines.push(line);

  if (lines.length < 2) {
    console.error("❌ CSV appears empty or has no data rows.");
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]);
  console.log(`📋 Headers: ${headers.join(", ")}`);

  const docs = lines.slice(1)
    .filter(l => l.trim())
    .map(l => rowToDoc(headers, parseCSVLine(l)));

  console.log(`📚 Parsed ${docs.length} comics from CSV.`);

  // Fetch all existing docs so we can merge rather than overwrite
  const existingByLocgId = {};
  const existingByTitle  = {};
  let from = 0;
  while (true) {
    const res = await es.search({ index: INDEX, body: { query: { match_all: {} }, size: 100, from } });
    const hits = res.hits.hits;
    if (hits.length === 0) break;
    hits.forEach(h => {
      if (h._source.locg_id) existingByLocgId[h._source.locg_id] = { id: h._id, ...h._source };
      const key = `${h._source.series}|${h._source.issue}`;
      existingByTitle[key] = { id: h._id, ...h._source };
    });
    from += hits.length;
    if (from >= res.hits.total.value) break;
  }
  console.log(`🔍 Found ${Object.keys(existingByLocgId).length} existing docs with LoCG IDs.`);

  let created = 0, updated = 0, skipped = 0;

  for (const doc of docs) {
    const titleKey = `${doc.series}|${doc.issue}`;
    const existing = (doc.locg_id && existingByLocgId[doc.locg_id]) || existingByTitle[titleKey];

    if (existing) {
      // Merge: take all LoCG fields but preserve our custom ones
      const merged = { ...doc };
      PRESERVED_FIELDS.forEach(f => {
        if (existing[f] !== undefined && existing[f] !== null && existing[f] !== "") {
          merged[f] = existing[f];
        }
      });
      await es.update({ index: INDEX, id: existing.id, doc: merged });
      updated++;
    } else {
      // New comic — insert fresh with empty gift arrays
      await es.index({
        index: INDEX,
        document: { ...doc, gifted_to: [], gifted_by: null, createdAt: new Date().toISOString() }
      });
      created++;
    }
  }

  await es.indices.refresh({ index: INDEX });
  console.log(`\n✅ Import complete!`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);

  const count = await es.count({ index: INDEX });
  console.log(`\n📦 Index now has ${count.count} documents.`);
}

// ── Run ───────────────────────────────────────────────────────────────────────
const csvPath = process.argv[2] || "./locg-export.csv";
importCSV(csvPath).catch(err => {
  console.error("❌ Import failed:", err.message);
  process.exit(1);
});
