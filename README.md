# Jacob's Comic Books — An Elasticsearch Learning Project

A personal comic book catalogue built on top of [GreyWarden247's collection on League of Comic Geeks](https://leagueofcomicgeeks.com/profile/GreyWarden247/collection).
This README doubles as a hands-on Elasticsearch tutorial — every concept is explained
in the context of real code you can find in this project.

**Live app:** https://peterdsouza247.github.io/jcb/
**Backend API:** https://jcb-kjal.onrender.com

---

## What is Elasticsearch (and why are we using OpenSearch)?

Elasticsearch is a **search and analytics engine**. Instead of storing data in rows and
columns like a regular database, it stores documents (JSON objects) and makes them
instantly searchable across every field at once.

When you type "Alan Moore" into the collection browser, Elasticsearch searches across
title, writer, description, and characters simultaneously, ranks results by relevance,
highlights the matching text, and returns facet counts for the sidebar filters — all
in a single query.

**OpenSearch** is what we're actually running. It's an open-source fork of Elasticsearch
maintained by Amazon. The API is identical — every concept in this tutorial applies to
both. We're using it because Bonsai (our free host) runs OpenSearch under the hood.

---

## Core Concepts

Before touching any code, here are the five ideas that underpin everything:

### 1. Index
An index is like a database table — it's a named collection of documents.
We have one index called `comics`. All your comics live in it, whether they're
owned, on your wish list, or have gift history attached.

### 2. Document
A document is a single JSON record — one comic. It has fields like `title`,
`publisher`, `year`, `tags`, `gifted_to`. Documents don't need to have
identical fields — some have `gifted_by`, some don't. That's fine.

### 3. Mapping
The mapping is the schema — it tells Elasticsearch what type each field is.
This matters because a `text` field is analysed for full-text search,
while a `keyword` field is used for exact matching, filtering, and aggregations.
Getting your mapping right is the most important design decision in any ES project.

### 4. Query
A query is how you ask Elasticsearch for documents. Queries can be simple
(give me everything) or complex (full-text search across five fields, filtered
by publisher, sorted by year, with aggregation counts per genre).

### 5. Aggregation
An aggregation is like a GROUP BY in SQL. It counts, sums, or buckets documents
alongside a search query. The publisher filter sidebar is powered entirely by
aggregations — ES counts how many comics match each publisher in one go.

---

## Project Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  React + Vite       │     │  Node.js + Express   │     │  Bonsai          │
│  (GitHub Pages)     │────▶│  (Render)            │────▶│  (OpenSearch)    │
│                     │     │  backend/src/        │     │  index: comics   │
└─────────────────────┘     └──────────────────────┘     └──────────────────┘
```

The frontend never talks to OpenSearch directly. The backend is the only thing
that constructs and executes queries. This is correct architecture — it keeps
your credentials secure and lets you control exactly what queries are allowed.

---

## Lesson 1: The Mapping — Defining Your Schema

**File:** `backend/src/seed.js`

The mapping is the first thing we create. Look at how we define the `title` field:

```javascript
title: {
  type: "text",
  analyzer: "english",
  fields: {
    keyword: { type: "keyword" }
  }
}
```

This one field actually creates two versions of itself:

- `title` — analysed as full-text. The English analyser lowercases it, removes stop words
  ("the", "of", "a"), and stems words (so "running" and "run" both match). This is what
  you search against.

- `title.keyword` — stored as-is, untouched. Used for exact matching, sorting A–Z,
  and aggregations. You can't sort on a `text` field because it's been tokenised.

**This dual-field pattern (`text` + `keyword`) is one of the most common patterns
in Elasticsearch.** You'll see it on `publisher`, `series`, `genre`, and `writer` too.

Compare that to `year`, which is just:

```javascript
year: { type: "integer" }
```

No dual field needed — numbers sort and filter naturally.

And `tags`, which is just:

```javascript
tags: { type: "keyword" }
```

Tags are always exact strings ("Bluechip", "Sleeper"). We never do fuzzy search on them.
Pure keyword — fast, exact, perfect for filters and aggregations.

**The gifted_to field is special:**

```javascript
gifted_to: {
  type: "nested",
  properties: {
    person:   { type: "keyword" },
    date:     { type: "date", format: "yyyy-MM-dd" },
    occasion: { type: "keyword" },
    notes:    { type: "text" },
  }
}
```

`nested` is used when a field contains an array of objects and you need to query
*inside* those objects while keeping each object's fields together. Without `nested`,
a query for `gifted_to.person: "Luca"` could accidentally match a document where
Luca is the person but a different occasion than you filtered for.

---

## Lesson 2: Indexing Documents — Writing Data

**File:** `backend/src/seed.js`

The **bulk API** is how you write many documents at once. It's far more efficient
than indexing one document at a time:

```javascript
const operations = allDocs.flatMap(doc => [
  { index: { _index: INDEX } },  // action line
  doc                             // the document
]);

const result = await es.bulk({ refresh: true, body: operations });
```

Every bulk operation alternates: one action line, then one document.
The action `{ index: { _index: INDEX } }` means "index this document".
Other actions exist: `update`, `delete`, `create`.

`refresh: true` makes the documents immediately searchable after the bulk call.
In production you'd omit this (let ES refresh on its own schedule) — it's expensive
to force a refresh, but useful during seeding when you want to query immediately.

**Single document indexing** is in `server.js`:

```javascript
const response = await es.index({ index: INDEX, body: comic });
```

ES generates a unique `_id` for each document automatically. That ID is what you
see in the URL when you click a comic — it's the ES document ID.

---

## Lesson 3: The Search Query — Asking Questions

**File:** `backend/src/server.js` → `GET /api/comics/search`

This is the most important lesson. The search endpoint shows you how a real
production query is built up in layers.

### The bool query — the backbone of everything

Almost every non-trivial ES query uses a `bool` query. It has four clauses:

```javascript
{
  query: {
    bool: {
      must:     [],  // MUST match — affects relevance score
      filter:   [],  // MUST match — does NOT affect score (faster)
      should:   [],  // NICE to match — boosts score if present
      must_not: []   // MUST NOT match
    }
  }
}
```

The critical distinction is **must vs filter**:
- `must` — participates in scoring. Use for full-text search where you want
  the best matches to float to the top.
- `filter` — binary yes/no. Use for exact matches (publisher = "DC Comics"),
  booleans (owned = true), tag filters. Much faster because ES can cache them.

In our search endpoint, the full-text search goes in `must`:

```javascript
if (q) {
  must.push({
    multi_match: {
      query: q,
      fields: ["title^3", "series^2", "writer^2", "artist", "description", "characters"],
      fuzziness: "AUTO",
    }
  });
}
```

`multi_match` searches across multiple fields at once. The `^3` after `title`
is a **boost** — a title match is three times more relevant than a description match.
`fuzziness: "AUTO"` enables typo tolerance — "batamn" still finds Batman.

Filters go in `filter`:

```javascript
if (publisher) filter.push({ term: { "publisher.keyword": publisher } });
if (tag)       filter.push({ term: { tags: tag } });
if (owned !== undefined) filter.push({ term: { owned: owned === "true" } });
```

`term` is an exact match query — it doesn't analyse the input. Note that we use
`publisher.keyword` (the keyword sub-field) not `publisher` (the text field).
If you used the text field, "DC Comics" might not match because it would be
tokenised into "dc" and "comics".

### Querying inside nested objects

Filtering by gift person requires a `nested` query because `gifted_to` is a nested type:

```javascript
if (gift_person && gifted === "given") {
  filter.push({
    nested: {
      path: "gifted_to",
      query: { term: { "gifted_to.person": gift_person } }
    }
  });
}
```

The `path` tells ES which nested field to look inside. Without this wrapper,
the query wouldn't work correctly on nested objects.

---

## Lesson 4: Aggregations — Powering the Sidebar

**File:** `backend/src/server.js` → the `aggs` section of the search body

Aggregations run alongside the search query and return counts and statistics.
The entire filter sidebar — publisher counts, genre counts, tag counts — is
built from a single aggregations object that runs with every search.

```javascript
aggs: {
  publishers: { terms: { field: "publisher.keyword", size: 20 } },
  genres:     { terms: { field: "genre.keyword",     size: 20 } },
  tags:       { terms: { field: "tags",              size: 20 } },
  owned_count: { filter: { term: { owned: true } } },
  total_value: { sum: { field: "est_value" } },
  by_decade:   { histogram: { field: "year", interval: 10, min_doc_count: 1 } },
}
```

- `terms` — counts documents per unique value. Returns buckets like
  `[{ key: "DC Comics", doc_count: 17 }, { key: "Marvel Comics", doc_count: 25 }]`

- `filter` — counts how many documents match a condition. Used for the
  "Owned: 82" summary stat.

- `sum` — adds up a numeric field. Used for estimated collection value.

- `histogram` — groups numeric values into fixed intervals. Used for the
  decade timeline chart. `interval: 10` means group by 10-year buckets.

**Important:** aggregations respect the current query. If you filter to DC Comics,
the genre aggregation will only count genres within DC Comics. This is what makes
the sidebar filter counts update dynamically as you apply filters.

**Nested aggregations** are used to count gift recipients:

```javascript
gifted_to_people: {
  nested: { path: "gifted_to" },
  aggs: {
    people: { terms: { field: "gifted_to.person", size: 50 } }
  }
}
```

You must wrap aggregations on nested fields in a `nested` aggregation first.
The inner `terms` aggregation then runs inside the nested context.

---

## Lesson 5: Sorting and Pagination

**File:** `backend/src/server.js`

```javascript
const sortOptions = {
  relevance: ["_score"],
  year_desc: [{ year: "desc" }],
  title:     [{ "title.keyword": "asc" }],
  value:     [{ est_value: { order: "desc", missing: "_last" } }],
};
```

`_score` sorts by relevance (default when there's a search query).
For field sorting, note that we sort on `title.keyword` not `title` —
you can only sort on `keyword` fields, not `text` fields.
`missing: "_last"` puts documents without an `est_value` at the end.

Pagination uses `from` and `size`:

```javascript
const from = (parseInt(page) - 1) * parseInt(size);
// ...
from,
size: parseInt(size),
```

This is offset pagination — `from: 24, size: 24` means "skip the first 24,
give me the next 24". Simple and effective for small collections. For very large
datasets (millions of documents), ES recommends `search_after` instead,
but offset pagination is fine for personal collections.

---

## Lesson 6: Highlighting — Showing Why a Result Matched

**File:** `backend/src/server.js`

```javascript
highlight: {
  fields: {
    description: { number_of_fragments: 1, fragment_size: 150 },
    title: {},
  },
  pre_tags:  ["<mark>"],
  post_tags: ["</mark>"],
},
```

Highlighting tells ES to return snippets of the matching fields with the
matched terms wrapped in your chosen tags. The frontend renders these with
`dangerouslySetInnerHTML` — the `<mark>` tags become yellow highlights.

`number_of_fragments: 1` means return only the best matching excerpt.
`fragment_size: 150` limits each excerpt to 150 characters.

---

## Lesson 7: More Like This — Similarity Search

**File:** `backend/src/server.js` → `GET /api/comics/:id/similar`

```javascript
{
  query: {
    more_like_this: {
      fields: ["genre", "writer", "tags", "description"],
      like: [{ _index: INDEX, _id: req.params.id }],
      min_term_freq: 1,
      min_doc_freq: 1,
      max_query_terms: 12,
    }
  }
}
```

More Like This (MLT) finds documents similar to a given one. ES extracts the
most significant terms from the source document's specified fields, then searches
for other documents that share those terms. This powers the "Similar Comics"
section at the bottom of every comic modal.

`min_term_freq: 1` — a term only needs to appear once in the source document.
`min_doc_freq: 1` — a term only needs to appear in one other document.
These low thresholds work well for small collections. With millions of documents
you'd raise them to avoid noise.

---

## Lesson 8: The Update API — Modifying Documents

**File:** `backend/src/server.js` → `PATCH /api/comics/:id/gift`

ES documents are immutable — you can't edit them in place. Instead you use
the Update API, which retrieves the document, applies your changes, and
re-indexes it:

```javascript
await es.update({
  index: INDEX,
  id: comic.id,
  body: { doc: { gifted_to: updatedGiftArray } }
});
```

The `doc` key means "merge these fields into the existing document".
Only the fields you specify are changed — everything else stays as-is.

For the gift tracker, we first fetch the existing document, append the new
gift entry to the array, then write the whole array back:

```javascript
const doc = await es.get({ index: INDEX, id: req.params.id });
const comic = doc.body._source;
const gifted_to = [...(comic.gifted_to || []), newGiftEntry];
await es.update({ index: INDEX, id: req.params.id, body: { doc: { gifted_to } } });
```

---

## Lesson 9: Why OpenSearch Wraps Responses in `.body`

If you look through the backend scripts you'll see `.body` everywhere:

```javascript
const hits  = response.body.hits.hits;
const aggs  = response.body.aggregations;
const count = countResponse.body.count;
```

The v7/v8 Elasticsearch client returns the response directly at the top level.
The OpenSearch JS client wraps everything inside a `.body` property. This is
a client library difference, not an Elasticsearch concept — worth knowing if
you ever switch between the two clients.

---

## Lesson 10: Putting It Together — Reading a Full Query

Here's the complete search query from `server.js`, annotated:

```javascript
const response = await es.search({
  index: INDEX,           // which index to search
  body: {

    // The main query
    query: {
      bool: {
        // Full-text search (affects ranking)
        must: q ? [{
          multi_match: {
            query: q,
            fields: ["title^3", "series^2", "writer^2", "description"],
            fuzziness: "AUTO",
          }
        }] : [{ match_all: {} }],  // no query = return everything

        // Exact filters (binary, don't affect ranking)
        filter: [
          publisher && { term: { "publisher.keyword": publisher } },
          tag       && { term: { tags: tag } },
          // ... etc
        ].filter(Boolean),
      }
    },

    // Sorting
    sort: [{ year: "desc" }],

    // Pagination
    from: 0,
    size: 24,

    // Aggregations (run alongside the query)
    aggs: {
      publishers: { terms: { field: "publisher.keyword", size: 20 } },
      // ...
    },

    // Highlighted excerpts in results
    highlight: {
      fields: { description: {}, title: {} },
      pre_tags: ["<mark>"], post_tags: ["</mark>"],
    }
  }
});
```

One HTTP request. Returns: matching documents, their scores, highlighted excerpts,
pagination info, and all the aggregation counts for the sidebar. That's the power
of Elasticsearch — what would require multiple SQL queries and application-level
processing happens in a single, extremely fast call.

---

## Running the Scripts — in Order

All scripts run from the `backend/` folder.

### First-time setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Bonsai credentials
```

### Step 1 — Create the index

```bash
npm run seed
```

Creates the OpenSearch index with the correct field mapping and loads your
base collection data. Run once on setup, or again if you want a clean slate.

### Step 2 — Import your LoCG collection

Export your collection first:
1. Go to https://leagueofcomicgeeks.com/profile/greywarden247/stats/collection
2. Scroll to bottom → Export Collection → save as `backend/locg-export.csv`

```bash
npm run import-locg
```

Non-destructive — preserves gift history and custom data. Safe to re-run
whenever you add new comics to LoCG.

### Step 3 — Import gift lists

For each LoCG community list, export it as CSV then:

```bash
# Comics you gifted TO someone
node src/import-locg-list.js luca-list.csv "Luca" to
node src/import-locg-list.js luca-list.csv "Luca" to "Birthday" "2024-12-25"

# Comics gifted BY someone to you
node src/import-locg-list.js sarah-list.csv "Sarah" by "Christmas" "2025-12-25"
```

### Step 4 — Fetch cover art (optional)

Get a free Comic Vine API key at https://comicvine.gamespot.com/api/
Add `COMIC_VINE_API_KEY=your_key` to `backend/.env`, then:

```bash
npm run fetch-covers
```

Takes ~30 minutes for a full collection. Safe to re-run — skips existing covers.

### Step 5 — Analyze your collection

```bash
npm run analyze
```

Scores every comic on trade vs keep potential. Results appear in the Analysis tab.

```bash
node src/analyze-collection.js --report   # preview without saving
node src/analyze-collection.js --force    # re-analyze everything
```

### Step 6 — Gap analysis (optional)

```bash
npm run gap-analysis
```

Prints a terminal report: priority wish list, unread sleepers, tradable items.

---

## Ongoing sync workflow

```bash
cd backend
npm run import-locg                        # sync new LoCG additions
npm run fetch-covers                       # covers for new comics
node src/analyze-collection.js             # analyze new ones only
```

---

## Running locally

```bash
# Terminal 1
cd backend && npm run dev    # API on http://localhost:3001

# Terminal 2
cd frontend && npm run dev   # App on http://localhost:5173
```

---

## Deploying changes

```bash
git add .
git commit -m "your message"
git push
```

GitHub Actions automatically builds and deploys the frontend to GitHub Pages.
Render auto-deploys the backend when it detects a push to main.

Note: scripts run locally on your machine and write directly to Bonsai (the cloud
index). You don't need to redeploy anything after running a script — the live site
reflects changes immediately.

---

## Environment variables

### backend/.env (local only, never committed)
```
ELASTICSEARCH_URL=https://user:password@yourcluster.bonsai.io
PORT=3001
COMIC_VINE_API_KEY=your_key_here
```

### Render dashboard (Environment tab)
```
ELASTICSEARCH_URL=https://user:password@yourcluster.bonsai.io
PORT=3001
```

### GitHub Actions (Settings → Secrets and variables → Actions → Variables)
```
VITE_API_URL=https://jcb-kjal.onrender.com
VITE_BASE_PATH=/jcb
```

---

## Project structure

```
comic-catalogue/
├── .github/workflows/deploy.yml     GitHub Actions CI/CD
├── backend/
│   ├── src/
│   │   ├── server.js                Express API + all ES queries  ← read this
│   │   ├── seed.js                  Index mapping + base data     ← read this
│   │   ├── import-locg.js           LoCG collection CSV import
│   │   ├── import-locg-list.js      LoCG gift list import (to/by)
│   │   ├── fetch-covers.js          Comic Vine cover art fetcher
│   │   ├── analyze-collection.js    Rule-based trade/keep analysis
│   │   └── gap-analysis.js          CLI gap report
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  Nav + page routing
│   │   ├── pages/
│   │   │   ├── CollectionPage.jsx   Browse, search, filter
│   │   │   ├── AnalyticsPage.jsx    Charts and stats
│   │   │   ├── AnalysisPage.jsx     Trade/keep recommendations
│   │   │   └── GiftsPage.jsx        Gift history
│   │   ├── components/
│   │   │   ├── ComicCard.jsx        Grid card
│   │   │   └── ComicModal.jsx       Detail modal + gift form
│   │   ├── hooks/useApi.js          API calls
│   │   └── styles.css               Design system
│   └── vite.config.js
└── README.md                        ← you are here
```

The two files most worth reading to understand Elasticsearch are
`backend/src/seed.js` (mapping) and `backend/src/server.js` (queries).
Every concept in this tutorial has a live implementation in those two files.
