/**
 * analyze-collection.js — Rule-based collection analysis and trade recommendations
 *
 * No API key required. Uses a comprehensive local rules engine based on
 * known comic book value factors: key issues, creative teams, print run era,
 * publisher premiums, your personal tags, and market signals.
 *
 * RUN:
 *   npm run analyze
 *
 * FLAGS:
 *   --force    Re-analyze everything, even if already analyzed
 *   --report   Print full report to console without saving
 */

import { Client } from "@opensearch-project/opensearch";
import dotenv from "dotenv";
dotenv.config();

const esConfig = process.env.ELASTIC_CLOUD_ID
  ? { cloud: { id: process.env.ELASTIC_CLOUD_ID }, auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD } }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es     = new Client(esConfig);
const INDEX  = "comics";
const FORCE  = process.argv.includes("--force");
const REPORT = process.argv.includes("--report");

// ─────────────────────────────────────────────────────────────────────────────
// SCORING KNOWLEDGE BASE
// Each entry matches against series/title (case-insensitive substring)
// score: keep bonus (positive = keep, negative = lean trade)
// ─────────────────────────────────────────────────────────────────────────────

const SERIES_KNOWLEDGE = [

  // ── DC/Marvel crossovers — extremely rare, short-term spike ──────────────
  { match: "dc / marvel",            keep: -5,  trade: 35, confidence: "High",
    factors: ["Only DC/Marvel crossover in 30+ years", "Historic event book", "High short-term demand — but event premiums fade"],
    market: "Peak demand right now. Event books typically correct 6–18 months post-release. Sell while hot." },
  { match: "batman / deadpool",      keep: -5,  trade: 35, confidence: "High",
    factors: ["DC/Marvel crossover", "Batman + Deadpool = mass-market appeal", "Short-term speculator magnet"],
    market: "Will command a premium immediately. Long-term uncertain — event fatigue is real." },
  { match: "superman / spider-man",  keep: -5,  trade: 32, confidence: "High",
    factors: ["DC/Marvel crossover", "Flagship characters", "Nostalgia + novelty premium"],
    market: "Similar trajectory to Batman/Deadpool. Flip window is short." },

  // ── Modern keys — keep long ───────────────────────────────────────────────
  { match: "house of x",             keep: 40, trade: -10, confidence: "High",
    factors: ["Redefined X-Men continuity", "Hickman landmark", "Modern key — already in CGC slabs"],
    market: "Krakoa era ended but HOX/POX are the origin — demand remains strong among collectors." },
  { match: "powers of x",            keep: 38, trade: -10, confidence: "High",
    factors: ["Paired with House of X", "Hickman two-part structure", "Complete story — standalone value"],
    market: "Inseparable from HOX in collector perception. Both or neither." },
  { match: "absolute batman",        keep: 20, trade: 5,  confidence: "Medium",
    factors: ["New Snyder/Dragotta run", "#1 issue", "Absolute imprint — prestige format premium"],
    market: "Early issues of prestige runs tend to hold. Watch for key issue developments within the run." },
  { match: "edge of spider-verse",   keep: 30, trade: -5, confidence: "High",
    factors: ["Spider-Gwen first appearance context", "Multiverse character explosion", "Film tie-in value"],
    market: "Gwen Stacy as Spider-Woman is firmly established in MCU. Event issues from this era hold well." },
  { match: "ultimate spider-man",    keep: 28, trade: -5, confidence: "High",
    factors: ["Hickman relaunch", "New #1 in high-demand era", "Miles/Peter dynamic — cultural moment"],
    market: "Hickman Ultimate Universe generating strong collector interest. Early issues likely to appreciate." },
  { match: "spider-man: india",      keep: 30, trade: -5, confidence: "High",
    factors: ["Pavitr Prabhakar — culturally significant character", "Spider-Verse film appearance", "Undervalued vs importance"],
    market: "Pavitr appeared in Spider-Man: Across the Spider-Verse. First solo series issues should hold well." },
  { match: "napalm lullaby",         keep: 22, trade: 0,  confidence: "Medium",
    factors: ["Rick Remender return to creator-owned", "Image first issues", "Likely low print run"],
    market: "Remender creator-owned Image work (Black Science, Low) has strong back-issue demand. Early adopter opportunity." },
  { match: "decorum",                keep: 25, trade: -5, confidence: "Medium",
    factors: ["Hickman + Huddleston — unique visual structure", "Limited issues published", "Collector's book not casual read"],
    market: "Niche but devoted audience. Hickman completionists will want this. Undervalued sleeper." },

  // ── Classic/legacy — strong keep ─────────────────────────────────────────
  { match: "camelot 3000",           keep: 35, trade: -10, confidence: "High",
    factors: ["Brian Bolland art throughout", "1982 DC — age premium", "Prestige format pioneer (pre-dates the term)", "Complete 12-issue limited run"],
    market: "Bolland's pencilled work (not just covers) is rare. This full run is genuinely undervalued by most metrics." },
  { match: "starman",                keep: 32, trade: -8,  confidence: "High",
    factors: ["James Robinson's masterwork", "Jack Knight — beloved character", "Critically acclaimed, collector undervalued", "Omnibus demand signals back-issue interest"],
    market: "One of the most praised DC runs of the 90s. Omnibus editions drove renewed interest. Still underpriced." },
  { match: "stormwatch",             keep: 28, trade: -5, confidence: "High",
    factors: ["Warren Ellis Authority precursor", "Ellis run launches here", "Wildstorm collector premium", "Low original print run"],
    market: "Ellis's Authority is collected endlessly. The Stormwatch bridge issues have disproportionate collector appeal." },
  { match: "injection",              keep: 22, trade: 0,  confidence: "Medium",
    factors: ["Warren Ellis + Declan Shalvey", "Unfinished series — complete run rare", "Ellis work holds value post-controversy"],
    market: "Incomplete series but Ellis/Shalvey creative pairing has strong demand. Collectors want the complete run." },
  { match: "once & future",          keep: 20, trade: 0,  confidence: "Medium",
    factors: ["Gillen + Dan Mora — superstar artist team", "BOOM! Studios collector favourite", "Mythology hook with ongoing appeal"],
    market: "Dan Mora's stock has risen significantly. Early issues of his runs now attract premium." },
  { match: "immortal x-men",        keep: 18, trade: 5,  confidence: "Medium",
    factors: ["Gillen Krakoa era", "Contains Sinister key issues", "End of era — complete run now possible"],
    market: "Krakoa era is over. Full run collectors will drive some demand. Sinister issues are the prize." },
  { match: "preacher special",       keep: 18, trade: 5,  confidence: "Medium",
    factors: ["Garth Ennis/Steve Dillon", "Vertigo era — literary collector premium", "TV series legacy"],
    market: "Preacher specials are harder to find than the main series. Modest but steady demand." },
  { match: "batman and robin",       keep: 18, trade: 5,  confidence: "Medium",
    factors: ["Grant Morrison run", "Dick Grayson as Batman — unique era", "Morrison Batman saga completionists"],
    market: "Morrison's full Batman run is collected and studied. This series is a key chapter." },

  // ── Early Image — founder era ─────────────────────────────────────────────
  { match: "spawn",                  keep: 25, trade: -5, confidence: "High",
    factors: ["Early Image Comics", "Todd McFarlane creator-owned icon", "Issue #1 is a genuine key", "Longest-running creator-owned series"],
    market: "Spawn #1 remains a staple. Early issues in good condition consistently perform at auction." },
  { match: "savage dragon",          keep: 20, trade: 0,  confidence: "Medium",
    factors: ["Erik Larsen creator-owned", "Early Image founder era", "Continuous run since 1993 — original issues scarce"],
    market: "Less mainstream than Spawn but original issues have steady collector base." },
  { match: "superpatriot",           keep: 15, trade: 8,  confidence: "Low",
    factors: ["Early Image — Larsen/Valentino era", "Obscure tie-in series", "Low print run likely"],
    market: "Curiosity value for Image completionists. Not a mainstream pickup but low supply." },
  { match: "king spawn",             keep: 5,  trade: 18, confidence: "Medium",
    factors: ["Modern Spawn spin-off", "High print run", "Less iconic than original series"],
    market: "Spawn brand is strong but King Spawn doesn't carry the same weight as early McFarlane issues." },

  // ── Valiant originals ─────────────────────────────────────────────────────
  { match: "eternal warrior",        keep: 25, trade: -5, confidence: "Medium",
    factors: ["Original Valiant Universe — early 1990s", "Low original print run", "Valiant originals rising steadily", "Bloodshot/X-O demand spilling to full VU"],
    market: "Original Valiant Universe books are a slow burn appreciation story. Original run issues undervalued." },

  // ── Age of Apocalypse — collector set value ───────────────────────────────
  { match: "generation next",        keep: 28, trade: -5, confidence: "High",
    factors: ["Age of Apocalypse tie-in", "Complete 4-issue run", "Chris Bachalo art — distinctive and collected", "AoA complete set commands premium over individual issues"],
    market: "AoA complete set collectors pay more than sum of parts. Keep alongside other AoA issues you own." },
  { match: "weapon x",               keep: 22, trade: 0,  confidence: "High",
    factors: ["Age of Apocalypse", "Wolverine variant — character demand carries over", "AoA set completion value"],
    market: "Weapon X within AoA is a key chapter. Wolverine collectors pick these up separately from AoA completionists." },
  { match: "x-man",                  keep: 18, trade: 5,  confidence: "Medium",
    factors: ["Age of Apocalypse — Nate Grey origin", "Longer ongoing series — more supply", "AoA origin issues vs later run"],
    market: "Origin issues worth more than the ongoing. If you have early issues, those carry the AoA premium." },

  // ── DC back catalogue ─────────────────────────────────────────────────────
  { match: "detective comics",       keep: 20, trade: 0,  confidence: "Medium",
    factors: ["Longest-running DC title", "Key issue potential in any given run", "Batman brand = perpetual demand"],
    market: "Depends entirely on which issues/run. Batman collector base is enormous and consistent." },
  { match: "world of krypton",       keep: 22, trade: 0,  confidence: "Medium",
    factors: ["1979 DC limited series", "First Superman limited series in DC history", "Age premium", "Pre-Crisis collector appeal"],
    market: "Pre-Crisis DC limited series are genuinely scarce. Superman collectors hunt these down." },
  { match: "fury of firestorm",      keep: 12, trade: 8,  confidence: "Low",
    factors: ["1980s DC — age premium", "Firestorm character has cult following", "Conway/Broderick early run notable"],
    market: "Niche character with dedicated fans. Not a mainstream mover but steady low-level demand." },
  { match: "justice league america", keep: 15, trade: 5,  confidence: "Medium",
    factors: ["Giffen/DeMatteis 'Bwahahaha' era", "Cult classic run — genuinely beloved", "Key issues within run (Booster/Beetle era)"],
    market: "The comedic JLA era has a devoted following. Key issues from this run trade well at conventions." },
  { match: "catwoman",               keep: 10, trade: 10, confidence: "Medium",
    factors: ["Tom King run — critically noted", "Catwoman character perpetually relevant", "Modern run with many issues — supply is high"],
    market: "King's Catwoman is well-regarded but heavily collected. Supply is high. Not a standout performer." },
  { match: "superman: son of kal-el", keep: 15, trade: 8, confidence: "Medium",
    factors: ["Jonathan Kent as Superman — landmark", "Coming out issue (#18) is a genuine key", "Character has ongoing relevance in DCU"],
    market: "Jon Kent Superman is here to stay. If you have the coming out issue specifically, that's the keeper." },
  { match: "adventures of superman",  keep: 12, trade: 8, confidence: "Low",
    factors: ["1987 series — age premium", "Byrne/Ordway era", "Depends heavily on which issues"],
    market: "General Superman titles from this era are affordable. Key issues within the run are the value play." },
  { match: "secret history of the authority", keep: 15, trade: 8, confidence: "Medium",
    factors: ["Wildstorm collector interest", "Authority universe — Ellis legacy", "Limited series — lower supply"],
    market: "Wildstorm completionists collect everything Authority-adjacent. Modest but real demand." },

  // ── Marvel misc ───────────────────────────────────────────────────────────
  { match: "amazing spider-man",     keep: 15, trade: 8,  confidence: "Medium",
    factors: ["Flagship Marvel title — perpetual demand", "Key issues within run are the prize", "High print run modern issues — supply heavy"],
    market: "Everything depends on which issues. Key appearances within a run outperform the run average significantly." },
  { match: "hallows' eve",           keep: 10, trade: 15, confidence: "Medium",
    factors: ["New character — market unproven", "Spider-Man adjacent", "Short series — see how character is used"],
    market: "New characters need time to establish value. Hallows' Eve needs more appearances before collector demand builds." },
  { match: "immoral x-men",          keep: 12, trade: 12, confidence: "Medium",
    factors: ["Krakoa era tie-in", "Gillen Sinister focus", "End of era — run is complete"],
    market: "Companion to Immortal X-Men. Collectors who want one want both. Individual issues mid-tier." },
  { match: "midnight suns",          keep: 8,  trade: 18, confidence: "Medium",
    factors: ["Game tie-in series", "Game underperformed commercially", "Limited lasting appeal"],
    market: "Game tie-in series rarely age well when the game itself underperforms. Trade candidate." },
  { match: "spider-gwen: gwenverse",  keep: 10, trade: 15, confidence: "Medium",
    factors: ["Event series — supply is high", "Gwen Stacy character demand is real", "Gwenverse concept is niche"],
    market: "Gwen's popularity is genuine but event/variant series have high supply. Core Gwen issues outperform." },
  { match: "spider-gwen: shadow clones", keep: 10, trade: 15, confidence: "Medium",
    factors: ["Mini-series — limited issues but limited appeal", "Gwen character demand helps", "Not a key chapter for the character"],
    market: "Character demand carries it somewhat. Not a priority hold vs core Spider-Gwen issues." },
  { match: "patsy walker",           keep: 18, trade: 5,  confidence: "Medium",
    factors: ["Kate Leth run — beloved by readers", "Hellcat MCU appearance", "Low print run — undersold at time of publication"],
    market: "Patsy Walker's MCU profile from Jessica Jones lifted demand. Low print run Kate Leth issues are genuinely scarce." },
  { match: "moon knight",            keep: 18, trade: 5,  confidence: "Medium",
    factors: ["Moon Knight MCU surge", "Black White Blood format — limited prestige", "Character at peak recognition"],
    market: "MCU series drove massive back-issue demand. Premium format issues in limited print runs hold well." },
  { match: "star wars: darth vader", keep: 15, trade: 8,  confidence: "Medium",
    factors: ["Star Wars brand — evergreen", "Black White Red prestige format", "Vader — most popular SW character"],
    market: "Star Wars books have a massive buyer base. Prestige format variants trade above standard issues." },
  { match: "star wars: darth maul",  keep: 14, trade: 8,  confidence: "Medium",
    factors: ["Maul character demand — cult favourite", "Black White Red prestige format", "Limited print run"],
    market: "Similar to Darth Vader BWR. Maul has devoted following. Prestige format helps." },
  { match: "star wars: the mandalorian", keep: 10, trade: 15, confidence: "Medium",
    factors: ["High print run — oversupply", "Show past peak popularity", "Grogu issues are the exception"],
    market: "Mandalorian show hype has cooled. High print run = supply heavy. Not a strong hold unless key Grogu issues." },
  { match: "wild cards",             keep: 20, trade: 0,  confidence: "Medium",
    factors: ["George R.R. Martin IP", "Pre-fame GRRM publication", "Niche but intensely sought by GRRM collectors"],
    market: "GRRM anything pre-Game of Thrones recognition has collector appeal. This is genuinely obscure." },
  { match: "tomorrow knights",       keep: 12, trade: 10, confidence: "Low",
    factors: ["1990 Marvel — low print run", "Obscure series — few collectors know it", "Curiosity value"],
    market: "Too obscure for mainstream demand but low print run. A slow burner at best." },

  // ── BOOM! Studios ─────────────────────────────────────────────────────────
  { match: "brzrkr",                 keep: 12, trade: 15, confidence: "Medium",
    factors: ["Keanu Reeves celebrity comic", "Celebrity comics rarely age well", "High print run due to hype"],
    market: "Celebrity comics peak at launch and correct. BRZRKR had enormous print runs. Not a hold." },

  // ── Archie ────────────────────────────────────────────────────────────────
  { match: "sonic the hedgehog",     keep: 8,  trade: 18, confidence: "Medium",
    factors: ["Long-running licensed comic", "New Sega series replaced Archie continuity", "Archie Sonic is nostalgic but not a major value play"],
    market: "Archie Sonic has nostalgia value but the continuity was wiped. Collectors exist but market is niche." },

  // ── Edenwood ─────────────────────────────────────────────────────────────
  { match: "edenwood",               keep: 12, trade: 10, confidence: "Low",
    factors: ["Tony S. Daniel creator-owned", "Image debut series", "Too early to assess long-term"],
    market: "New series — market unproven. Daniel's name carries some weight. Monitor first arc reception." },

  // ── DC Year of the Villain ────────────────────────────────────────────────
  { match: "dc's year of the villain", keep: 5, trade: 20, confidence: "High",
    factors: ["Promotional giveaway issue", "Free Comic Book Day / promotional tier", "High supply — no scarcity"],
    market: "Promotional issue. Essentially no secondary market value. Move on." },
  { match: "batman day",             keep: 5,  trade: 20, confidence: "High",
    factors: ["Batman Day promotional issue", "Free giveaway — unlimited supply", "No scarcity = no value"],
    market: "Promotional giveaway. Not a collectible by any metric." },

  // ── Radiant Black ────────────────────────────────────────────────────────
  { match: "radiant black",          keep: 15, trade: 8,  confidence: "Medium",
    factors: ["Kyle Higgins creator-owned Image", "Kirby-influenced modern superhero", "Small but devoted readership"],
    market: "Indie superhero with a loyal audience. Modest appreciation trajectory rather than spike potential." },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCORING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function scoreComic(comic) {
  let keepScore  = 50; // start neutral
  let tradeScore = 50;
  const factors  = [];
  let confidence = "Medium";
  let marketNote = "";
  let seriesMatch = null;

  const titleLower  = (comic.title  || "").toLowerCase();
  const seriesLower = (comic.series || "").toLowerCase();

  // ── 1. Series knowledge base ──────────────────────────────────────────────
  for (const entry of SERIES_KNOWLEDGE) {
    if (titleLower.includes(entry.match) || seriesLower.includes(entry.match)) {
      keepScore  += entry.keep;
      tradeScore += entry.trade;
      factors.push(...entry.factors);
      confidence  = entry.confidence;
      marketNote  = entry.market;
      seriesMatch = entry;
      break;
    }
  }

  // ── 2. Age premium ────────────────────────────────────────────────────────
  if (comic.year) {
    if (comic.year < 1980) {
      keepScore += 25; tradeScore -= 10;
      factors.push("Pre-1980 — strong age premium, natural scarcity");
    } else if (comic.year < 1990) {
      keepScore += 18; tradeScore -= 8;
      factors.push("1980s publication — age premium, dwindling supply of high-grade copies");
    } else if (comic.year < 1995) {
      keepScore += 10; tradeScore -= 3;
      factors.push("Early 1990s — post-speculation era, but early Image/Valiant an exception");
    } else if (comic.year >= 2022) {
      tradeScore += 5;
      factors.push("Very recent — value still establishing, market still reactive");
    }
  }

  // ── 3. Publisher era bonuses ──────────────────────────────────────────────
  const pub = (comic.publisher || "").toLowerCase();
  if (pub.includes("valiant") && comic.year && comic.year < 1997) {
    keepScore += 12; factors.push("Original Valiant Universe — undervalued, slow appreciation");
  }
  if (pub.includes("image") && comic.year && comic.year < 1996) {
    keepScore += 10; factors.push("Early Image Comics founder era — historically significant");
  }
  if (pub.includes("vertigo")) {
    keepScore += 8; factors.push("Vertigo imprint — literary/mature readers premium");
  }
  if (pub.includes("wildstorm")) {
    keepScore += 8; factors.push("Wildstorm — Ellis era specifically commands collector premium");
  }
  if (pub.includes("dark horse") && comic.year && comic.year < 2000) {
    keepScore += 6; factors.push("Dark Horse 1990s — independent collector premium");
  }

  // ── 4. Your personal tags ─────────────────────────────────────────────────
  const tags = comic.tags || [];
  if (tags.includes("Bluechip")) {
    keepScore += 20; tradeScore -= 10;
    factors.push("Your Bluechip tag — your strongest personal keep signal");
  }
  if (tags.includes("Sleeper")) {
    keepScore += 10;
    factors.push("Your Sleeper tag — potential upside not yet realized");
  }
  if (tags.includes("Excellent Read")) {
    keepScore += 5;
    factors.push("Your Excellent Read tag — personal value beyond market value");
  }
  if (tags.includes("Tradable")) {
    tradeScore += 25; keepScore -= 10;
    factors.push("Your Tradable tag — your own instinct says move this on");
  }

  // ── 5. Read status ────────────────────────────────────────────────────────
  if (comic.read) {
    tradeScore += 4;
    factors.push("Already read — you've had the experience");
  } else {
    keepScore += 3;
    factors.push("Unread — still has personal reading value");
  }

  // ── 6. Gifting provenance ─────────────────────────────────────────────────
  if ((comic.gifted_to || []).length > 0) {
    keepScore += 8;
    factors.push("Has gifting history — sentimental/provenance value");
  }
  if (comic.gifted_by?.person) {
    keepScore += 12;
    factors.push(`Gift from ${comic.gifted_by.person} — sentimental keep`);
  }

  // ── 7. Condition adjustment ───────────────────────────────────────────────
  if (comic.condition) {
    const cond = comic.condition.toLowerCase();
    if (cond.includes("near mint") || cond.includes("nm")) {
      keepScore += 8; factors.push("Near Mint condition — grade premium");
    } else if (cond.includes("good") || cond.includes("fair") || cond.includes("poor")) {
      tradeScore += 10; keepScore -= 5;
      factors.push("Lower grade condition — affects value ceiling");
    }
  }

  // ── Clamp scores to 0–100 ─────────────────────────────────────────────────
  keepScore  = Math.max(0, Math.min(100, keepScore));
  tradeScore = Math.max(0, Math.min(100, tradeScore));

  // ── Derive recommendation ─────────────────────────────────────────────────
  let recommendation;
  const gap = keepScore - tradeScore;

  if (tradeScore >= 65 || (tags.includes("Tradable") && tradeScore >= 50)) {
    recommendation = "Trade";
  } else if (keepScore >= 70 || gap >= 25) {
    recommendation = "Keep Long Term";
  } else {
    recommendation = "Keep Short Term";
  }

  // Default market note if none from series knowledge
  if (!marketNote) {
    if (recommendation === "Trade")           marketNote = "Trade value exceeds long-term appreciation potential based on available factors.";
    else if (recommendation === "Keep Long Term") marketNote = "Strong long-term appreciation potential based on key factors.";
    else                                       marketNote = "Hold and monitor — value factors are mixed.";
  }

  // Deduplicate factors
  const uniqueFactors = [...new Set(factors)].slice(0, 8);

  return {
    recommendation,
    keep_score:          Math.round(keepScore),
    trade_score:         Math.round(tradeScore),
    analysis_confidence: confidence,
    analysis_summary:    buildSummary(comic, recommendation, uniqueFactors, keepScore, tradeScore),
    value_factors:       uniqueFactors,
    market_note:         marketNote,
    analyzed_at:         new Date().toISOString(),
  };
}

function buildSummary(comic, recommendation, factors, keepScore, tradeScore) {
  const title = comic.series || comic.title;
  const year  = comic.year ? ` (${comic.year})` : "";

  if (recommendation === "Trade") {
    return `${title}${year} scores higher on trade potential (${tradeScore}) than long-term keep value (${keepScore}). ${factors[0] || "Market conditions favour selling now over holding."}`;
  }
  if (recommendation === "Keep Long Term") {
    return `${title}${year} is a strong long-term hold (keep score: ${keepScore}). ${factors[0] || "Multiple positive value signals."} ${factors[1] ? factors[1] + "." : ""}`;
  }
  return `${title}${year} has mixed signals (keep: ${keepScore}, trade: ${tradeScore}). Worth holding short-term while monitoring the market. ${factors[0] || ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function analyzeCollection() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Jacob's Comic Books — Collection Analysis");
  console.log("  Rule-based engine · No API key required");
  console.log("═══════════════════════════════════════════════════════════\n");

  const query = FORCE
    ? { term: { owned: true } }
    : { bool: { filter: [{ term: { owned: true } }], must_not: [{ exists: { field: "recommendation" } }] } };

  const res = await es.search({
    index: INDEX,
    body: {
      query,
      _source: ["title", "series", "publisher", "year", "tags", "read", "gifted_to", "gifted_by", "condition", "genre", "writer"],
      size: 500,
    }
  });

  const comics = res.body.hits.hits.map(h => ({ id: h._id, ...h._source }));

  if (comics.length === 0) {
    console.log(FORCE
      ? "No owned comics found."
      : "✅ All comics already analyzed. Use --force to re-analyze everything.");
    return;
  }

  console.log(`📚 Analyzing ${comics.length} comic${comics.length !== 1 ? "s" : ""}${FORCE ? " (forced re-analysis)" : ""}...\n`);

  // Score all comics
  const scored = comics.map(c => ({ comic: c, result: scoreComic(c) }));

  // Assign trade ranks (1 = most tradeable)
  const tradeRanked = [...scored].sort((a, b) => b.result.trade_score - a.result.trade_score);
  tradeRanked.forEach((item, i) => { item.result.trade_rank = i + 1; });

  if (!REPORT) {
    // Save to Elasticsearch
    console.log("💾 Saving to Elasticsearch...");
    for (const { comic, result } of scored) {
      await es.update({
        index: INDEX,
        id: comic.id,
        body: { doc: result }
      });
    }
    await es.indices.refresh({ index: INDEX });
    console.log(`✅ Saved ${scored.length} analyses.\n`);
  }

  // ── Print report ────────────────────────────────────────────────────────
  const keepLong  = scored.filter(s => s.result.recommendation === "Keep Long Term");
  const keepShort = scored.filter(s => s.result.recommendation === "Keep Short Term");
  const trade     = scored.filter(s => s.result.recommendation === "Trade");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  🏆 Keep Long Term:   ${keepLong.length}`);
  console.log(`  📦 Keep Short Term:  ${keepShort.length}`);
  console.log(`  ♻️  Recommended Trade: ${trade.length}`);

  if (trade.length > 0) {
    console.log("\n─── TRADE CANDIDATES (most → least tradeable) ───────────────");
    trade
      .sort((a, b) => a.result.trade_rank - b.result.trade_rank)
      .forEach(({ comic, result }) => {
        const title = (comic.series || comic.title || "").padEnd(35).slice(0,35);
        console.log(`  #${String(result.trade_rank).padStart(2)} [${result.trade_score}] ${title} ${comic.year || ""}`);
        console.log(`       ${result.market_note}`);
      });
  }

  if (keepLong.length > 0) {
    console.log("\n─── LONG-TERM KEEPS (strongest first) ───────────────────────");
    keepLong
      .sort((a, b) => b.result.keep_score - a.result.keep_score)
      .forEach(({ comic, result }) => {
        const title = (comic.series || comic.title || "").padEnd(35).slice(0,35);
        console.log(`  [${result.keep_score}] ${title} ${comic.year || ""}`);
        if (result.value_factors[0]) console.log(`       ${result.value_factors[0]}`);
      });
  }

  if (!REPORT) {
    console.log("\n💡 View results in the app under the Analysis tab.");
    console.log("   Re-run with --force to update all recommendations.");
  }
}

analyzeCollection().catch(console.error);
