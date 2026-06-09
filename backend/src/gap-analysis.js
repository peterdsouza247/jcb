/**
 * gap-analysis.js — Standalone script that prints a gap analysis report.
 *
 * Run with: node src/gap-analysis.js
 *
 * Finds:
 *   1. Series where you own some issues but not all (partial runs)
 *   2. Wish list items that share publishers/writers with your Bluechips
 *      (priority acquisition targets)
 *   3. Tradable items that might be good swap candidates
 */

import { Client } from "@elastic/elasticsearch";
import dotenv from "dotenv";
dotenv.config();

const esConfig = process.env.ELASTIC_CLOUD_ID
  ? { cloud: { id: process.env.ELASTIC_CLOUD_ID }, auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD } }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es = new Client(esConfig);
const INDEX = "comics";

async function gapAnalysis() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  THE LONG BOX — Gap Analysis for GreyWarden247");
  console.log("═══════════════════════════════════════════════════\n");

  // ── 1. Wish list vs owned Bluechips: shared publisher ─────────────────────
  const [bluechips, wishList] = await Promise.all([
    es.search({
      index: INDEX,
      body: {
        query: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Bluechip" } }] } },
        _source: ["series", "publisher", "writer", "genre", "tags"],
        size: 100,
      },
    }),
    es.search({
      index: INDEX,
      body: {
        query: { bool: { filter: [{ term: { on_wish_list: true } }, { term: { owned: false } }] } },
        _source: ["series", "publisher", "writer", "genre", "tags", "locg_url"],
        size: 100,
      },
    }),
  ]);

  const ownedPublishers = new Set(bluechips.hits.hits.map(h => h._source.publisher));
  const ownedWriters    = new Set(bluechips.hits.hits.map(h => h._source.writer).filter(Boolean));

  const priorityWishList = wishList.hits.hits.filter(h => {
    const s = h._source;
    return ownedPublishers.has(s.publisher) || (s.writer && ownedWriters.has(s.writer));
  });

  console.log("📌 PRIORITY WISH LIST (overlap with your Bluechip publishers/writers)");
  console.log("─────────────────────────────────────────────────────────────────────");
  if (priorityWishList.length === 0) {
    console.log("  No overlaps found.\n");
  } else {
    priorityWishList.forEach(h => {
      const s = h._source;
      const reasons = [];
      if (ownedPublishers.has(s.publisher)) reasons.push(`publisher: ${s.publisher}`);
      if (s.writer && ownedWriters.has(s.writer)) reasons.push(`writer: ${s.writer}`);
      console.log(`  • ${s.series}`);
      console.log(`    Why: ${reasons.join(", ")}`);
      if (s.locg_url) console.log(`    LoCG: ${s.locg_url}`);
    });
    console.log();
  }

  // ── 2. Tradable items ─────────────────────────────────────────────────────
  const tradable = await es.search({
    index: INDEX,
    body: {
      query: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Tradable" } }] } },
      _source: ["series", "publisher", "year", "condition", "tags"],
      size: 50,
    },
  });

  console.log("♻️  TRADABLE ITEMS (potential swap or sell candidates)");
  console.log("─────────────────────────────────────────────────────");
  if (tradable.hits.hits.length === 0) {
    console.log("  None tagged as Tradable.\n");
  } else {
    tradable.hits.hits.forEach(h => {
      const s = h._source;
      const extraTags = (s.tags || []).filter(t => t !== "Tradable").join(", ");
      console.log(`  • ${s.series} (${s.year}) — ${s.publisher}${extraTags ? ` [${extraTags}]` : ""}${s.condition ? ` — ${s.condition}` : ""}`);
    });
    console.log();
  }

  // ── 3. Sleepers not yet read ───────────────────────────────────────────────
  const sleepersUnread = await es.search({
    index: INDEX,
    body: {
      query: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Sleeper" } }, { term: { read: false } }] } },
      _source: ["series", "publisher", "year", "writer"],
      sort: [{ year: "asc" }],
      size: 50,
    },
  });

  console.log("👁  UNREAD SLEEPERS (your hidden gems waiting to be discovered)");
  console.log("────────────────────────────────────────────────────────────────");
  sleepersUnread.hits.hits.forEach(h => {
    const s = h._source;
    console.log(`  • ${s.series} (${s.year})${s.writer ? ` — ${s.writer}` : ""}`);
  });
  console.log();

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  const [totalOwned, totalRead, totalWish] = await Promise.all([
    es.count({ index: INDEX, body: { query: { term: { owned: true } } } }),
    es.count({ index: INDEX, body: { query: { bool: { filter: [{ term: { owned: true } }, { term: { read: true } }] } } } }),
    es.count({ index: INDEX, body: { query: { bool: { filter: [{ term: { on_wish_list: true } }, { term: { owned: false } }] } } } }),
  ]);

  const readRate = Math.round((totalRead.count / totalOwned.count) * 100);

  console.log("📊 SUMMARY");
  console.log("──────────");
  console.log(`  Owned:     ${totalOwned.count}`);
  console.log(`  Read:      ${totalRead.count} (${readRate}% read rate)`);
  console.log(`  Wish List: ${totalWish.count}`);
  console.log(`  Priority acquisitions: ${priorityWishList.length}`);
  console.log(`  Tradable:  ${tradable.hits.hits.length}`);
  console.log(`  Unread sleepers: ${sleepersUnread.hits.hits.length}`);
}

gapAnalysis().catch(console.error);
