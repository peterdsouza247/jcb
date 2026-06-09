# The Long Box

A personal comic catalogue built around [GreyWarden247's collection on League of Comic Geeks](https://leagueofcomicgeeks.com/profile/GreyWarden247/collection). Powered by Elasticsearch.

**Stack:** React + Vite (frontend, GitHub Pages) · Node.js + Express (backend, Railway/Render) · Elasticsearch (Elastic Cloud or Bonsai)

---

## Features

| Feature | Description |
|---|---|
| **Collection browser** | Full-text search, tag/publisher/genre filters, sort by year/title/value |
| **Your tags** | Bluechip, Sleeper, Excellent Read, Tradable — first-class filters and analytics |
| **Gift tracker** | Record comics you've given (to who, occasion, date) and received (from who) |
| **Analytics dashboard** | Publisher breakdown, decade timeline, tag counts, read rate, gift totals |
| **LoCG deep links** | Every comic links back to its LoCG series page |
| **Autocomplete** | Typeahead search powered by ES phrase-prefix queries |
| **Similar comics** | ES "More Like This" on genre/writer/tags |
| **CSV import** | One-command import from LoCG's export — preserves your custom data |
| **Gap analysis** | CLI report: priority wish list, unread sleepers, tradables |

---

## Quick Start

### 1. Get Elasticsearch (free)

**Bonsai** (easiest, no expiry, no credit card):
1. Sign up at [bonsai.io](https://bonsai.io)
2. Create a cluster — free tier is 125MB / 10k docs
3. Copy your cluster URL: `https://user:pass@yourcluster.bonsai.io`

**Elastic Cloud** (more features, 14-day trial):
1. Sign up at [cloud.elastic.co](https://cloud.elastic.co)
2. Create a deployment, note your Cloud ID + password

### 2. Backend

```bash
cd backend
cp .env.example .env
# Paste your Elasticsearch credentials into .env

npm install
npm run seed        # Creates index + loads your 58-issue collection
npm run dev         # API on http://localhost:3001
```

Verify:
```bash
curl http://localhost:3001/health
curl "http://localhost:3001/api/analytics"
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# VITE_API_URL=http://localhost:3001 is the default — fine for local dev

npm install
npm run dev         # Opens http://localhost:5173
```

---

## Importing from League of Comic Geeks

When you want to sync your real LoCG collection:

1. Go to your [LoCG collection stats page](https://leagueofcomicgeeks.com/profile/GreyWarden247/collection)
2. Scroll to **Export Collection** and download the CSV
3. Save it as `backend/locg-export.csv`
4. Run:

```bash
cd backend
npm run import-locg
# or with a custom path:
node src/import-locg.js /path/to/your-export.csv
```

The import is **non-destructive** — it preserves your custom data (gift history, condition, storage location, personal notes, ratings) and only updates the LoCG-sourced fields.

---

## Gap Analysis

Run this CLI report any time to see:
- Priority wish list items (overlap with your Bluechip publishers/writers)
- Unread Sleepers (your hidden gems)
- Tradable items

```bash
cd backend
npm run gap-analysis
```

---

## Deploying to GitHub

### Frontend → GitHub Pages

1. Push the repo to GitHub
2. **Settings → Pages → Source: GitHub Actions**
3. Add two Repository Variables (**Settings → Secrets and variables → Actions → Variables**):

| Variable | Example |
|---|---|
| `VITE_API_URL` | `https://comic-api.railway.app` |
| `VITE_BASE_PATH` | `/comic-catalogue` |

The workflow in `.github/workflows/deploy.yml` deploys automatically on every push to `main`.

### Backend → Railway (easiest)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Set root directory to `backend`
3. Add environment variables (copy from your `.env`)
4. Railway gives you a public URL — paste it into `VITE_API_URL` above

### Backend → Render (free tier)

1. [render.com](https://render.com) → New Web Service → connect repo
2. Root directory: `backend`, Build: `npm install`, Start: `npm start`
3. Add environment variables

---

## Project Structure

```
comic-catalogue/
├── .github/workflows/deploy.yml     ← GitHub Actions CI/CD
├── backend/
│   ├── src/
│   │   ├── server.js                ← Express API + all ES queries
│   │   ├── seed.js                  ← Index mapping + your real collection
│   │   ├── import-locg.js           ← LoCG CSV import (non-destructive)
│   │   └── gap-analysis.js          ← CLI gap/priority report
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  ← Three-page app shell + nav
│   │   ├── pages/
│   │   │   ├── CollectionPage.jsx   ← Search, filter, browse
│   │   │   ├── AnalyticsPage.jsx    ← Charts and stats
│   │   │   └── GiftsPage.jsx        ← Gift history tracker
│   │   ├── components/
│   │   │   ├── ComicCard.jsx        ← Grid card with tag ribbons
│   │   │   └── ComicModal.jsx       ← Detail view + gift form
│   │   ├── hooks/useApi.js          ← All API calls
│   │   └── styles.css               ← Pulp/inkprint design system
│   ├── .env.example
│   └── vite.config.js
└── README.md
```

---

## Adding Custom Data

### Add a gift record

Open any comic in the UI → scroll to **Gift History** → **Record a Gift**.

Or via API:
```bash
# You gave Injection to someone for their birthday
curl -X PATCH http://localhost:3001/api/comics/{id}/gift \
  -H "Content-Type: application/json" \
  -d '{"direction":"to","person":"Reuben","date":"2024-12-25","occasion":"Christmas","notes":"He loves Warren Ellis"}'

# Someone gave you Once & Future
curl -X PATCH http://localhost:3001/api/comics/{id}/gift \
  -H "Content-Type: application/json" \
  -d '{"direction":"by","person":"Sarah","date":"2023-08-15","occasion":"Birthday"}'
```

### Add a new comic manually

```bash
curl -X POST http://localhost:3001/api/comics \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Planetary #1",
    "series": "Planetary",
    "issue": 1,
    "year": 1999,
    "publisher": "DC Comics / Wildstorm",
    "genre": "Science Fiction",
    "writer": "Warren Ellis",
    "artist": "John Cassaday",
    "owned": true,
    "read": false,
    "tags": ["Bluechip", "Sleeper"]
  }'
```
