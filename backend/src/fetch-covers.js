/**
 * fetch-covers.js — Auto-fetch cover art from Comic Vine API
 *
 * GET YOUR FREE API KEY (takes 2 minutes):
 *   1. Go to https://comicvine.gamespot.com/api/
 *   2. Create a free account and verify email
 *   3. Your API key appears on that page immediately
 *   4. Add to backend/.env:  COMIC_VINE_API_KEY=your_key_here
 *   5. Add to Render env vars: COMIC_VINE_API_KEY=your_key_here
 *
 * RUN:
 *   node src/fetch-covers.js
 *
 * BEHAVIOUR:
 *   - Only fetches covers for comics that have no coverImage set
 *   - Safe to re-run — skips anything already covered
 *   - Respects Comic Vine's rate limit (200 req/hour free tier)
 *   - Stores the cover URL back into Elasticsearch
 */

import { Client } from "@opensearch-project/opensearch";
import dotenv from "dotenv";
dotenv.config();

const esConfig = process.env.ELASTIC_CLOUD_ID
  ? { cloud: { id: process.env.ELASTIC_CLOUD_ID }, auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD } }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es = new Client(esConfig);
const INDEX = "comics";
const API_KEY = process.env.COMIC_VINE_API_KEY;

if (!API_KEY) {
  console.error("❌ Missing COMIC_VINE_API_KEY in your .env file");
  console.error("   Get a free key at: https://comicvine.gamespot.com/api/");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Comic Vine rate limit: 200 requests/hour on free tier = 1 per 18s
// We use 20s to be safe
const RATE_LIMIT_MS = 20000;

async function searchComicVine(seriesName, year) {
  const url = new URL("https://comicvine.gamespot.com/api/search/");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("query", seriesName);
  url.searchParams.set("resources", "volume");
  url.searchParams.set("field_list", "name,image,start_year,publisher");
  url.searchParams.set("limit", "5");

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "JacobsComicBooks/1.0 (personal collection tool)" }
    });
    if (!res.ok) {
      if (res.status === 420 || res.status === 429) {
        console.log("   ⏳ Rate limited — waiting 60s...");
        await sleep(60000);
        return null;
      }
      return null;
    }
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.log(`   ⚠️  Fetch error: ${e.message}`);
    return null;
  }
}

function pickBestResult(results, seriesName, year) {
  if (!results || results.length === 0) return null;

  const scored = results.map(r => {
    let score = 0;
    const rName = (r.name || "").toLowerCase().trim();
    const qName = seriesName.toLowerCase().trim();

    // Exact match is highest priority
    if (rName === qName) score += 10;
    else if (rName.startsWith(qName) || qName.startsWith(rName)) score += 6;
    else if (rName.includes(qName) || qName.includes(rName)) score += 3;

    // Year proximity bonus
    if (year && r.start_year) {
      const diff = Math.abs(parseInt(r.start_year) - parseInt(year));
      if (diff === 0)     score += 4;
      else if (diff <= 1) score += 2;
      else if (diff <= 3) score += 1;
    }

    return { ...r, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);

  // Only return if we have a reasonable match
  return scored[0]._score >= 3 ? scored[0] : null;
}

async function fetchCovers() {
  console.log("🎨 Jacob's Comic Books — Cover Art Fetcher");
  console.log("─────────────────────────────────────────────\n");

  // Get all comics missing cover images
  const res = await es.search({
    index: INDEX,
    body: {
      query: {
        bool: {
          should: [
            { bool: { must_not: { exists: { field: "coverImage" } } } },
            { term: { coverImage: "" } },
          ],
          minimum_should_match: 1,
        }
      },
      _source: ["title", "series", "year", "publisher"],
      size: 500,
    }
  });

  const docs = res.body.hits.hits;

  if (docs.length === 0) {
    console.log("✅ All comics already have cover images! Nothing to do.");
    return;
  }

  console.log(`Found ${docs.length} comics without cover images.`);
  console.log(`Estimated time: ~${Math.ceil(docs.length * RATE_LIMIT_MS / 60000)} minutes (Comic Vine rate limit)\n`);

  let found = 0, notFound = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const { title, series, year } = doc._source;

    // Use series name for searching — more reliable than full title
    const searchTerm = series || title;

    process.stdout.write(`[${i + 1}/${docs.length}] "${searchTerm}"... `);

    const results = await searchComicVine(searchTerm, year);
    const match = pickBestResult(results, searchTerm, year);

    if (match?.image?.medium_url || match?.image?.small_url) {
      const coverUrl = match.image.medium_url || match.image.small_url;
      await es.update({
        index: INDEX,
        id: doc._id,
        body: { doc: { coverImage: coverUrl } }
      });
      console.log(`✅ "${match.name}" (${match.start_year})`);
      found++;
    } else {
      console.log(`⚠️  No match`);
      notFound++;
    }

    // Rate limit between requests (skip delay after last item)
    if (i < docs.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  await es.indices.refresh({ index: INDEX });

  console.log(`\n🎉 Done!`);
  console.log(`   ✅ Covers found:  ${found} / ${docs.length}`);
  console.log(`   ⚠️  Not found:    ${notFound}`);

  if (notFound > 0) {
    console.log(`\n💡 For the ${notFound} not found, you can:`);
    console.log(`   1. Re-run this script (sometimes retrying works)`);
    console.log(`   2. Manually add a cover URL by updating the comic in ES`);
    console.log(`   3. The placeholder card still shows title + publisher`);
  }
}

fetchCovers().catch(console.error);
