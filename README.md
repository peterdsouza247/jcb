# Jacob's Comic Books

A personal comic catalogue built around [GreyWarden247's collection on League of Comic Geeks](https://leagueofcomicgeeks.com/profile/GreyWarden247/collection).
Powered by OpenSearch (Bonsai), Node.js/Express, and React/Vite.

**Live frontend:** https://peterdsouza247.github.io/jcb/
**Backend API:** https://jcb-kjal.onrender.com

---

## Architecture

```
React + Vite          Node.js + Express       Bonsai (OpenSearch)
(GitHub Pages)   →    (Render)            →   (Free tier)
```

The frontend is static and deployed automatically via GitHub Actions on every push to main.
The backend runs on Render's free tier (spins down after 15 min inactivity — first request takes ~30s to wake it).
All scripts run locally on your machine against the Bonsai cloud index.

---

## One-time local setup

### Prerequisites
- Node.js installed (https://nodejs.org — download the LTS version)
- A terminal (PowerShell on Windows, Terminal on Mac)

### Install dependencies

```bash
# From the project root
cd backend
npm install

cd ../frontend
npm install
```

### Set up your .env file

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` in any text editor and fill in your Bonsai credentials:

```
ELASTICSEARCH_URL=https://youruser:yourpassword@yourcluster.bonsai.io
PORT=3001
```

Get your Bonsai URL from: bonsai.io → your cluster → Access → Credentials

---

## Running scripts locally

All scripts run from the `backend/` folder. Open a terminal, `cd backend`, then run in this order:

---

### Step 1 — Seed the index (first time only)

Creates the OpenSearch index with the correct field mapping.

```bash
npm run seed
```

Run this once when setting up fresh, or if you want to wipe and restart.
After seeding, the index will be empty — run the import next.

---

### Step 2 — Import your LoCG collection

Export your collection from League of Comic Geeks first:
1. Go to https://leagueofcomicgeeks.com/profile/greywarden247/stats/collection
2. Scroll to the bottom and click **Export Collection**
3. Save the CSV as `backend/locg-export.csv`

Then run:

```bash
npm run import-locg
```

This is non-destructive — it preserves any gift history, notes, or custom data
already in the index. Safe to re-run whenever you want to sync new additions from LoCG.

---

### Step 3 — Import gift lists

For each LoCG community list (e.g. "Gifted to Luca"), export it as CSV and run:

```bash
# Comics you gifted TO someone
node src/import-locg-list.js luca-list.csv "Luca" to
node src/import-locg-list.js luca-list.csv "Luca" to "Birthday" "2024-12-25"

# Comics gifted BY someone to you
node src/import-locg-list.js sarah-list.csv "Sarah" by
node src/import-locg-list.js sarah-list.csv "Sarah" by "Christmas" "2025-12-25"
```

The direction (`to` / `by`) controls whether it populates gifted_to or gifted_by.
Never duplicates — safe to re-run. Each person automatically appears as a filter in the sidebar.

---

### Step 4 — Fetch cover art (optional but recommended)

Gets cover images for every comic from the Comic Vine API (free).

Get your free API key first:
1. Go to https://comicvine.gamespot.com/api/
2. Create a free account and verify your email
3. Your API key appears on that page immediately
4. Add it to your `backend/.env`:

```
COMIC_VINE_API_KEY=your_key_here
```

Then run:

```bash
npm run fetch-covers
```

Takes about 30 minutes for a full collection (rate limited to 1 request per 20 seconds
to stay within Comic Vine's free tier of 200 requests/hour).
Safe to re-run — skips any comic that already has a cover image.

---

### Step 5 — Analyze your collection

Scores every owned comic on trade vs keep potential using a rule-based engine.
No API key required. Results appear in the Analysis tab in the app.

```bash
npm run analyze
```

To preview the report without saving:

```bash
node src/analyze-collection.js --report
```

To re-analyze everything (e.g. after adding new comics or changing tags):

```bash
node src/analyze-collection.js --force
```

---

### Step 6 — Gap analysis (optional CLI report)

Prints a report in your terminal showing:
- Priority wish list items (overlap with your Bluechip publishers/writers)
- Unread Sleepers (hidden gems waiting to be discovered)
- Tradable items

```bash
npm run gap-analysis
```

---

## Ongoing workflow

When you add new comics to LoCG:
```bash
cd backend
npm run import-locg           # sync new comics
npm run fetch-covers          # fetch covers for new ones
node src/analyze-collection.js  # analyze new ones only (no --force needed)
```

When you create a new gift list on LoCG:
```bash
node src/import-locg-list.js their-list.csv "PersonName" to
```

When you update tags in LoCG and want fresh recommendations:
```bash
npm run import-locg
node src/analyze-collection.js --force
```

---

## Running the app locally

```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
# Opens http://localhost:5173
```

---

## Deploying changes

Frontend — just push to GitHub. The Actions workflow builds and deploys automatically:
```bash
git add .
git commit -m "your message"
git push
```

Backend — Render auto-deploys when you push to GitHub (if connected).
Environment variables (ELASTICSEARCH_URL etc.) are set in Render's dashboard under Environment.

---

## Project structure

```
comic-catalogue/
├── .github/workflows/deploy.yml        GitHub Actions — deploys frontend to GitHub Pages
├── backend/
│   ├── src/
│   │   ├── server.js                   Express API — all endpoints
│   │   ├── seed.js                     Creates OpenSearch index + mapping
│   │   ├── import-locg.js              Imports main LoCG collection CSV
│   │   ├── import-locg-list.js         Imports LoCG gift lists (to/by direction)
│   │   ├── fetch-covers.js             Fetches cover art from Comic Vine API
│   │   ├── analyze-collection.js       Rule-based trade/keep analysis
│   │   └── gap-analysis.js             CLI gap report (wish list, sleepers, tradables)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     App shell — nav + page routing
│   │   ├── pages/
│   │   │   ├── CollectionPage.jsx      Browse + search + filter
│   │   │   ├── AnalyticsPage.jsx       Charts and collection stats
│   │   │   ├── AnalysisPage.jsx        AI trade/keep recommendations
│   │   │   └── GiftsPage.jsx           Gift history tracker
│   │   ├── components/
│   │   │   ├── ComicCard.jsx           Grid card
│   │   │   └── ComicModal.jsx          Detail modal + gift form
│   │   ├── hooks/useApi.js             All API calls
│   │   └── styles.css                  Design system
│   ├── .env.example
│   └── vite.config.js
└── README.md
```

---

## Environment variables

### backend/.env
```
ELASTICSEARCH_URL=https://user:password@yourcluster.bonsai.io
PORT=3001
COMIC_VINE_API_KEY=your_key_here        # optional — needed for fetch-covers
```

### Render environment variables (set in Render dashboard)
```
ELASTICSEARCH_URL=https://user:password@yourcluster.bonsai.io
PORT=3001
```

### GitHub Actions variables (Settings → Secrets and variables → Actions → Variables)
```
VITE_API_URL=https://jcb-kjal.onrender.com
VITE_BASE_PATH=/jcb
```
