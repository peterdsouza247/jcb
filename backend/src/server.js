import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Client } from "@opensearch-project/opensearch";
import adminRouter from "./admin-routes.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// ── Admin routes ───────────────────────────────────────────────────────────
app.use("/api/admin", adminRouter);

const esConfig = process.env.ELASTIC_CLOUD_ID
  ? { cloud: { id: process.env.ELASTIC_CLOUD_ID }, auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD } }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es = new Client(esConfig);
const INDEX = "comics";

// ── Health ─────────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    const info = await es.info();
    res.json({ status: "ok", version: info.body?.version?.number });
  } catch (err) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Search ─────────────────────────────────────────────────────────────────
app.get("/api/comics/search", async (req, res) => {
  const {
    q = "", publisher, genre, tag,
    owned, on_wish_list, read,
    gifted, gift_person,
    sort = "relevance", page = 1, size = 24
  } = req.query;

  const must = [];
  const filter = [];

  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ["title^3", "series^2", "writer^2", "artist", "description", "characters"],
        fuzziness: "AUTO",
      },
    });
  }

  if (publisher)              filter.push({ term: { "publisher.keyword": publisher } });
  if (genre)                  filter.push({ term: { "genre.keyword": genre } });
  if (tag)                    filter.push({ term: { tags: tag } });
  if (owned !== undefined)    filter.push({ term: { owned: owned === "true" } });
  if (on_wish_list !== undefined) filter.push({ term: { on_wish_list: on_wish_list === "true" } });
  if (read !== undefined)     filter.push({ term: { read: read === "true" } });

  // Gifted direction filters
  if (gifted === "given") {
    filter.push({ nested: { path: "gifted_to", query: { match_all: {} } } });
  }
  if (gifted === "received") {
    filter.push({ exists: { field: "gifted_by.person" } });
  }

  // Filter by specific gift person
  if (gift_person && gifted === "given") {
    filter.push({ nested: { path: "gifted_to", query: { term: { "gifted_to.person": gift_person } } } });
  }
  if (gift_person && gifted === "received") {
    filter.push({ term: { "gifted_by.person": gift_person } });
  }

  const sortOptions = {
    relevance: ["_score"],
    year_desc: [{ year: "desc" }],
    year_asc:  [{ year: "asc"  }],
    title:     [{ "title.keyword": "asc" }],
    value:     [{ est_value: { order: "desc", missing: "_last" } }],
  };

  const from = (parseInt(page) - 1) * parseInt(size);

  try {
    const response = await es.search({
      index: INDEX,
      body: {
        query: { bool: { must: must.length ? must : [{ match_all: {} }], filter } },
        sort: sortOptions[sort] || ["_score"],
        from,
        size: parseInt(size),
        aggs: {
          publishers:      { terms: { field: "publisher.keyword", size: 20 } },
          genres:          { terms: { field: "genre.keyword",     size: 20 } },
          tags:            { terms: { field: "tags",              size: 20 } },
          owned_count:     { filter: { term: { owned: true } } },
          wish_list_count: { filter: { term: { on_wish_list: true } } },
          read_count:      { filter: { term: { read: true } } },
          unread_count:    { filter: { bool: { filter: [{ term: { owned: true } }, { term: { read: false } }] } } },
          gifted_to_count: {
            nested: { path: "gifted_to" },
            aggs: { has_gift: { value_count: { field: "gifted_to.person" } } }
          },
          by_decade:   { histogram: { field: "year", interval: 10, min_doc_count: 1 } },
          total_value: { sum: { field: "est_value" } },
        },
        highlight: {
          fields: {
            description: { number_of_fragments: 1, fragment_size: 150 },
            title: {},
          },
          pre_tags: ["<mark>"], post_tags: ["</mark>"],
        },
      },
    });

    const body = response.body;
    const hits = body.hits;
    const aggs = body.aggregations;

    res.json({
      total: hits.total.value,
      page: parseInt(page),
      totalPages: Math.ceil(hits.total.value / parseInt(size)),
      comics: hits.hits.map(hit => ({ id: hit._id, score: hit._score, highlight: hit.highlight, ...hit._source })),
      aggregations: {
        publishers:  aggs.publishers.buckets,
        genres:      aggs.genres.buckets,
        tags:        aggs.tags.buckets,
        owned:       aggs.owned_count.doc_count,
        wish_list:   aggs.wish_list_count.doc_count,
        read:        aggs.read_count.doc_count,
        unread:      aggs.unread_count.doc_count,
        gifted_to:   aggs.gifted_to_count?.has_gift?.value ?? 0,
        by_decade:   aggs.by_decade.buckets,
        total_value: aggs.total_value.value,
      },
    });
  } catch (err) {
    console.error("Search error:", err.meta?.body?.error || err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Gift people (for sidebar filter) ──────────────────────────────────────
// Returns all unique people from gifted_to[] and gifted_by with counts
app.get("/api/gift-people", async (req, res) => {
  try {
    const response = await es.search({
      index: INDEX,
      body: {
        size: 0,
        aggs: {
          gifted_to_people: {
            nested: { path: "gifted_to" },
            aggs: { people: { terms: { field: "gifted_to.person", size: 50 } } }
          },
          gifted_by_people: {
            terms: { field: "gifted_by.person", size: 50 }
          }
        }
      }
    });

    const a = response.body.aggregations;
    res.json({
      given_to: a.gifted_to_people.people.buckets.map(b => ({ person: b.key, count: b.doc_count })),
      given_by: a.gifted_by_people.buckets.map(b => ({ person: b.key, count: b.doc_count })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ──────────────────────────────────────────────────────────────
app.get("/api/analytics", async (req, res) => {
  try {
    const response = await es.search({
      index: INDEX,
      body: {
        size: 0,
        aggs: {
          publishers:      { terms: { field: "publisher.keyword", size: 20 } },
          genres:          { terms: { field: "genre.keyword",     size: 20 } },
          tags:            { terms: { field: "tags",              size: 20 } },
          by_decade:       { histogram: { field: "year", interval: 10, min_doc_count: 1 } },
          total_value:     { sum: { field: "est_value" } },
          owned_count:     { filter: { term: { owned: true } } },
          wish_list_count: { filter: { term: { on_wish_list: true } } },
          read_count:      { filter: { term: { read: true } } },
          bluechip:        { filter: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Bluechip"       } }] } } },
          sleeper:         { filter: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Sleeper"        } }] } } },
          excellent_read:  { filter: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Excellent Read" } }] } } },
          tradable:        { filter: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Tradable"       } }] } } },
          gifted_to_count: {
            nested: { path: "gifted_to" },
            aggs: {
              total:       { value_count: { field: "gifted_to.person" } },
              by_person:   { terms: { field: "gifted_to.person",   size: 50 } },
              by_occasion: { terms: { field: "gifted_to.occasion", size: 10 } },
            }
          },
          gifted_by_person:   { terms: { field: "gifted_by.person",   size: 50 } },
          gifted_by_occasion: { terms: { field: "gifted_by.occasion", size: 10 } },
          bluechip_by_publisher: {
            filter: { bool: { filter: [{ term: { owned: true } }, { term: { tags: "Bluechip" } }] } },
            aggs:   { publishers: { terms: { field: "publisher.keyword", size: 10 } } }
          },
        },
      },
    });

    const a = response.body.aggregations;
    res.json({
      summary: {
        total_owned:     a.owned_count.doc_count,
        total_wish_list: a.wish_list_count.doc_count,
        total_read:      a.read_count.doc_count,
        total_value:     a.total_value.value,
        gifted_to:       a.gifted_to_count.total.value,
        gifted_by:       a.gifted_by_person.buckets.reduce((s, b) => s + b.doc_count, 0),
      },
      tags: {
        bluechip:       a.bluechip.doc_count,
        sleeper:        a.sleeper.doc_count,
        excellent_read: a.excellent_read.doc_count,
        tradable:       a.tradable.doc_count,
      },
      publishers:  a.publishers.buckets,
      genres:      a.genres.buckets,
      by_decade:   a.by_decade.buckets,
      all_tags:    a.tags.buckets,
      bluechip_by_publisher: a.bluechip_by_publisher.publishers.buckets,
      gifted_to: {
        total:       a.gifted_to_count.total.value,
        by_person:   a.gifted_to_count.by_person.buckets,
        by_occasion: a.gifted_to_count.by_occasion.buckets,
      },
      gifted_by: {
        by_person:   a.gifted_by_person.buckets,
        by_occasion: a.gifted_by_occasion.buckets,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err.meta?.body?.error || err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Gifts list ─────────────────────────────────────────────────────────────
app.get("/api/gifts", async (req, res) => {
  try {
    const [givenRes, receivedRes] = await Promise.all([
      es.search({
        index: INDEX,
        body: {
          query: { nested: { path: "gifted_to", query: { match_all: {} } } },
          _source: ["title", "series", "publisher", "year", "coverImage", "gifted_to"],
          size: 200,
        },
      }),
      es.search({
        index: INDEX,
        body: {
          query: { exists: { field: "gifted_by.person" } },
          _source: ["title", "series", "publisher", "year", "coverImage", "gifted_by"],
          size: 200,
        },
      }),
    ]);
    res.json({
      given:    givenRes.body.hits.hits.map(h => ({ id: h._id, ...h._source })),
      received: receivedRes.body.hits.hits.map(h => ({ id: h._id, ...h._source })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Single comic ───────────────────────────────────────────────────────────
app.get("/api/comics/:id", async (req, res) => {
  try {
    const doc = await es.get({ index: INDEX, id: req.params.id });
    res.json({ id: doc.body._id, ...doc.body._source });
  } catch (err) {
    if (err.meta?.statusCode === 404) return res.status(404).json({ error: "Not found" });
    res.status(500).json({ error: err.message });
  }
});

// ── Add comic ──────────────────────────────────────────────────────────────
app.post("/api/comics", async (req, res) => {
  try {
    const comic = { ...req.body, createdAt: new Date().toISOString(), gifted_to: req.body.gifted_to || [], gifted_by: req.body.gifted_by || null };
    const r = await es.index({ index: INDEX, body: comic });
    await es.indices.refresh({ index: INDEX });
    res.status(201).json({ id: r.body._id, ...comic });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update comic ───────────────────────────────────────────────────────────
app.put("/api/comics/:id", async (req, res) => {
  try {
    await es.update({ index: INDEX, id: req.params.id, body: { doc: req.body } });
    await es.indices.refresh({ index: INDEX });
    const updated = await es.get({ index: INDEX, id: req.params.id });
    res.json({ id: updated.body._id, ...updated.body._source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Add gift record ────────────────────────────────────────────────────────
app.patch("/api/comics/:id/gift", async (req, res) => {
  try {
    const { direction, person, date, occasion, notes } = req.body;
    const doc = await es.get({ index: INDEX, id: req.params.id });
    const comic = doc.body._source;

    if (direction === "to") {
      const gifted_to = [...(comic.gifted_to || []), { person, date, occasion, notes }];
      await es.update({ index: INDEX, id: req.params.id, body: { doc: { gifted_to } } });
    } else if (direction === "by") {
      await es.update({ index: INDEX, id: req.params.id, body: { doc: { gifted_by: { person, date, occasion, notes } } } });
    }

    await es.indices.refresh({ index: INDEX });
    const updated = await es.get({ index: INDEX, id: req.params.id });
    res.json({ id: updated.body._id, ...updated.body._source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Similar ────────────────────────────────────────────────────────────────
app.get("/api/comics/:id/similar", async (req, res) => {
  try {
    const response = await es.search({
      index: INDEX,
      body: {
        query: {
          more_like_this: {
            fields: ["genre", "writer", "tags", "description"],
            like: [{ _index: INDEX, _id: req.params.id }],
            min_term_freq: 1, min_doc_freq: 1, max_query_terms: 12,
          },
        },
        size: 4,
      },
    });
    res.json(response.body.hits.hits.map(h => ({ id: h._id, ...h._source })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Suggestions ────────────────────────────────────────────────────────────
app.get("/api/suggest/:prefix", async (req, res) => {
  try {
    const response = await es.search({
      index: INDEX,
      body: {
        query: { match_phrase_prefix: { title: { query: req.params.prefix } } },
        _source: ["title", "series", "writer"],
        size: 6,
      },
    });
    res.json(response.body.hits.hits.map(h => ({ id: h._id, ...h._source })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Jacob's Comic Books API running on port ${PORT}`));

// ── Analysis results endpoint ──────────────────────────────────────────────
// Returns the full ranked trade list for the analysis view
app.get("/api/analysis", async (req, res) => {
  try {
    const response = await es.search({
      index: INDEX,
      body: {
        query: {
          bool: {
            filter: [
              { term: { owned: true } },
              { exists: { field: "recommendation" } },
            ]
          }
        },
        sort: [{ trade_rank: "asc" }],
        size: 500,
        _source: [
          "title", "series", "publisher", "year", "tags", "coverImage",
          "recommendation", "trade_score", "keep_score", "trade_rank",
          "analysis_confidence", "analysis_summary", "value_factors", "market_note",
          "analyzed_at",
        ],
      }
    });

    const hits = response.body.hits.hits.map(h => ({ id: h._id, ...h._source }));

    const byRecommendation = {
      keep_long:  hits.filter(h => h.recommendation === "Keep Long Term"),
      keep_short: hits.filter(h => h.recommendation === "Keep Short Term"),
      trade:      hits.filter(h => h.recommendation === "Trade"),
    };

    res.json({
      total: hits.length,
      analyzed_at: hits[0]?.analyzed_at || null,
      by_recommendation: byRecommendation,
      all: hits,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
