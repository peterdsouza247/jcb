/**
 * import-locg-list.js — Import a LoCG Community List CSV as gifted comics
 *
 * HOW TO EXPORT A LIST FROM LoCG:
 *   1. Go to your list, e.g. leagueofcomicgeeks.com/profile/greywarden247/lists/153972
 *   2. Look for the "Export" or "Stats" option on the list page
 *   3. If no export button: open the list in your browser, then use
 *      File → Save Page As (complete HTML), and run with --html flag
 *   4. Save the file into the backend/ folder
 *
 * USAGE:
 *   # Comics you gifted TO someone (gifted_to)
 *   node src/import-locg-list.js luca-list.csv "Luca" to
 *   node src/import-locg-list.js luca-list.csv "Luca" to "Birthday" "2024-12-25"
 *
 *   # Comics gifted BY someone to you (gifted_by)
 *   node src/import-locg-list.js sarah-list.csv "Sarah" by
 *   node src/import-locg-list.js sarah-list.csv "Sarah" by "Christmas" "2025-12-25"
 *
 * NON-DESTRUCTIVE:
 *   - Matches existing ES docs by title/series
 *   - Never duplicates a gift entry for the same person
 *   - Preserves all your existing custom data
 *   - Creates new docs for comics not yet in your collection
 *
 * ADD npm run import-list TO package.json SCRIPTS:
 *   "import-list": "node src/import-locg-list.js"
 */

import { Client } from "@opensearch-project/opensearch";
import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import dotenv from "dotenv";
dotenv.config();

const esConfig = process.env.ELASTIC_CLOUD_ID
  ? { cloud: { id: process.env.ELASTIC_CLOUD_ID }, auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD } }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es = new Client(esConfig);
const INDEX = "comics";

// ── CLI args ──────────────────────────────────────────────────────────────────
const CSV_PATH  = process.argv[2];
const PERSON    = process.argv[3];
const DIRECTION = process.argv[4]; // "to" or "by"
const OCCASION  = process.argv[5] || "";
const DATE      = process.argv[6] || "";

if (!CSV_PATH || !PERSON || !DIRECTION) {
  console.log(`
Usage:
  node src/import-locg-list.js <csv-file> "<person>" <to|by> [occasion] [date]

Examples:
  node src/import-locg-list.js luca-list.csv "Luca" to
  node src/import-locg-list.js luca-list.csv "Luca" to "Birthday" "2024-12-25"
  node src/import-locg-list.js sarah-list.csv "Sarah" by "Christmas" "2025-12-25"

direction:
  to  = you gifted this to the person  (populates gifted_to[])
  by  = the person gifted this to you  (populates gifted_by)
  `);
  process.exit(1);
}

if (!["to", "by"].includes(DIRECTION)) {
  console.error(`❌ Direction must be "to" or "by", got: "${DIRECTION}"`);
  process.exit(1);
}

if (!existsSync(CSV_PATH)) {
  console.error(`❌ File not found: ${CSV_PATH}`);
  process.exit(1);
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const fields = [];
  let current = "";
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

// LoCG exports use these header names (handles both collection and list exports)
const HEADER_MAP = {
  // List export headers
  "Title":          "title",
  "Series":         "series",
  "Series Name":    "series",
  "Issue":          "issue",
  "Issue Number":   "issue",
  "Publisher":      "publisher",
  "Publisher Name": "publisher",
  "Full Title":     "title",
  "Release Date":   "release_date",
  "Cover":          "coverImage",
  "Cover URL":      "coverImage",
  "Image":          "coverImage",
};

function rowToDoc(headers, values) {
  const raw = {};
  headers.forEach((h, i) => {
    const field = HEADER_MAP[h.trim()] || h.toLowerCase().replace(/\s+/g, "_");
    raw[field] = (values[i] || "").trim();
  });

  // Extract year
  let year = null;
  if (raw.release_date) {
    const m = raw.release_date.match(/(\d{4})/);
    if (m) year = parseInt(m[1]);
  }

  const issue = raw.issue ? parseInt(raw.issue) : null;
  const title = raw.title || (raw.series ? `${raw.series}${issue ? ` #${issue}` : ""}` : "");

  return { title, series: raw.series || "", issue, publisher: raw.publisher || "", year, coverImage: raw.coverimage || raw.cover || "" };
}

// ── ES matching ───────────────────────────────────────────────────────────────
async function findInES(title, series) {
  if (!title) return null;
  const res = await es.search({
    index: INDEX,
    body: {
      query: {
        bool: {
          should: [
            { match: { title:  { query: title,          boost: 3, fuzziness: "AUTO" } } },
            { match: { series: { query: series || title, boost: 2, fuzziness: "AUTO" } } },
          ],
          minimum_should_match: 1,
        }
      },
      size: 1,
    }
  });
  const hits = res.body.hits.hits;
  return hits.length > 0 ? { id: hits[0]._id, ...hits[0]._source } : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function importList() {
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Jacob's Comic Books — List Import`);
  console.log(`  File:      ${CSV_PATH}`);
  console.log(`  Person:    ${PERSON}`);
  console.log(`  Direction: ${DIRECTION === "to" ? "Gifted TO " + PERSON : "Gifted BY " + PERSON}`);
  if (OCCASION) console.log(`  Occasion:  ${OCCASION}`);
  if (DATE)     console.log(`  Date:      ${DATE}`);
  console.log("════════════════════════════════════════════════════════\n");

  // Read CSV
  const lines = [];
  const rl = createInterface({ input: createReadStream(CSV_PATH) });
  for await (const line of rl) { if (line.trim()) lines.push(line); }

  if (lines.length < 2) {
    console.error("❌ CSV appears empty or has no data rows.");
    process.exit(1);
  }

  const headers = parseCSVLine(lines[0]);
  console.log(`📋 Headers: ${headers.join(", ")}`);

  const docs = lines.slice(1).map(l => rowToDoc(headers, parseCSVLine(l))).filter(d => d.title);
  console.log(`📚 Parsed ${docs.length} comics.\n`);

  const giftEntry = {
    person:   PERSON,
    date:     DATE || null,
    occasion: OCCASION || null,
    notes:    null,
  };

  let matched = 0, created = 0, skipped = 0;

  for (const doc of docs) {
    const existing = await findInES(doc.title, doc.series);

    if (existing) {
      // Check for duplicate
      if (DIRECTION === "to") {
        const already = (existing.gifted_to || []).some(g => g.person === PERSON);
        if (already) {
          console.log(`  ⏭  Already recorded: "${doc.title}"`);
          skipped++; continue;
        }
        const gifted_to = [...(existing.gifted_to || []), giftEntry];
        await es.update({ index: INDEX, id: existing.id, body: { doc: { gifted_to } } });
      } else {
        // "by" — only one gifted_by per doc; skip if same person already set
        if (existing.gifted_by?.person === PERSON) {
          console.log(`  ⏭  Already recorded: "${doc.title}"`);
          skipped++; continue;
        }
        await es.update({ index: INDEX, id: existing.id, body: { doc: { gifted_by: giftEntry } } });
      }
      console.log(`  ✅ Updated: "${doc.title}" (matched "${existing.title}")`);
      matched++;
    } else {
      // Not in collection — create a new doc
      const newDoc = {
        ...doc,
        owned: false,
        read: false,
        on_wish_list: false,
        tags: [],
        gifted_to:  DIRECTION === "to" ? [giftEntry] : [],
        gifted_by:  DIRECTION === "by" ? giftEntry : null,
        createdAt: new Date().toISOString(),
        notes: `Added via list import (${DIRECTION === "to" ? "gifted to" : "gifted by"} ${PERSON})`,
      };
      await es.index({ index: INDEX, body: newDoc });
      console.log(`  ➕ Created: "${doc.title}" (not yet in collection)`);
      created++;
    }
  }

  await es.indices.refresh({ index: INDEX });

  console.log(`\n✅ Import complete!`);
  console.log(`   Matched & updated: ${matched}`);
  console.log(`   Created new:       ${created}`);
  console.log(`   Already recorded:  ${skipped}`);
  console.log(`\n💡 Run "npm run gap-analysis" to see updated gift stats.`);
}

importList().catch(console.error);
