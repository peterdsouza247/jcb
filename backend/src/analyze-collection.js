/**
 * analyze-collection.js — Multi-dimensional collection analysis
 *
 * Four scoring dimensions per comic:
 *   1. Intrinsic Value  — key issue status, age, print run era, creative team
 *   2. Personal Value   — your tags, reading history, gift provenance, run completion
 *   3. Market Timing    — peak/rising/cooling signals for this specific title
 *   4. Replaceability   — how hard would it be to get this back if you sold it
 *
 * Recommendation derived from dimension combination, not a single blended score.
 * Each comic also gets: confidence tier, urgency note, and actionable reason.
 *
 * Run: npm run analyze
 * Flags: --force (re-analyze everything), --report (print only, don't save)
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
// KNOWLEDGE BASE
// Each entry covers a series with rich per-dimension signals.
//
// intrinsic:     0–40  (objective worth — key issues, age, creative team)
// market:        "peak" | "rising" | "stable" | "cooling" | "dead"
// replaceability: "very_hard" | "hard" | "moderate" | "easy" | "very_easy"
// issue_notes:   specific notes about key issues within the run
// confidence:    "high" | "medium" | "low"
// ─────────────────────────────────────────────────────────────────────────────

const SERIES_KB = [

  // ── DC/Marvel crossovers ─────────────────────────────────────────────────
  {
    match: ["dc / marvel", "batman / deadpool", "superman / spider-man"],
    intrinsic: 28,
    market: "peak",
    replaceability: "very_hard",
    confidence: "high",
    issue_notes: "First DC/Marvel crossover in 30+ years. All issues are keys by definition.",
    market_detail: "Event premium is at absolute peak right now. These typically correct 40–60% within 18 months of release as hype normalises.",
    factors: ["Only DC/Marvel crossover since 1996", "Historic publishing event", "Both publishers' flagship characters", "Speculator demand at maximum"],
  },

  // ── Modern Marvel keys ───────────────────────────────────────────────────
  {
    match: ["house of x", "powers of x"],
    intrinsic: 40,
    market: "stable",
    replaceability: "moderate",
    confidence: "high",
    issue_notes: "HOX #1 and POX #1 are the strongest keys. Both series function as one story — complete sets command premium over individual issues.",
    market_detail: "Krakoa era ended but HOX/POX are the origin story — demand is durable, not speculative. Already entering 'back-issue staple' territory.",
    factors: ["Rewrote X-Men continuity", "Hickman landmark — studied by collectors", "Complete story arc — no loose ends", "CGC submission rate high — validates collector interest"],
  },
  {
    match: ["ultimate spider-man"],
    intrinsic: 32,
    market: "rising",
    replaceability: "moderate",
    confidence: "high",
    issue_notes: "Issue #1 is the key. Hickman's Ultimate Universe is generating sustained interest — early issues likely to appreciate further.",
    market_detail: "Still in the rising phase. Hickman completionists, Ultimate Universe collectors, and Spider-Man collectors all want this.",
    factors: ["Hickman relaunch of Ultimate Universe", "New Peter Parker reimagined", "Strong critical reception", "Early in potential long run"],
  },
  {
    match: ["edge of spider-verse"],
    intrinsic: 35,
    market: "stable",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "The issue containing Spider-Gwen's first appearance (#2 in the original run) is the key. If you have that specific issue, it's a strong long-term hold.",
    market_detail: "Gwen Stacy as Ghost-Spider is a permanently established character post-MCU. Demand is durable.",
    factors: ["Spider-Gwen first appearance context", "MCU character — permanent demand", "Event series — finite supply", "Film franchise appearance"],
  },
  {
    match: ["spider-man: india"],
    intrinsic: 30,
    market: "rising",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "First solo series for Pavitr Prabhakar after his Spider-Verse film appearance. Issue #1 is the key modern issue.",
    market_detail: "Pavitr appeared in Across the Spider-Verse. Solo series for a film-featured character is a reliable value driver. Still early in appreciation curve.",
    factors: ["Spider-Verse film appearance", "Culturally significant diverse character", "First solo series", "India market interest adds international demand"],
  },
  {
    match: ["immortal x-men"],
    intrinsic: 22,
    market: "stable",
    replaceability: "easy",
    confidence: "medium",
    issue_notes: "Issues featuring Sinister's schemes are the keys within this run. Issue #1 is modest as a key but Gillen's Sinister issues within the run have collector interest.",
    market_detail: "Krakoa era is complete — full run now collectible as a unit. Individual issues are mid-tier. The run as a whole is the value play.",
    factors: ["Kieron Gillen Krakoa era centrepiece", "Mr Sinister featured heavily — character demand", "Complete run now possible", "Pairs with Immoral X-Men"],
  },
  {
    match: ["immoral x-men"],
    intrinsic: 18,
    market: "stable",
    replaceability: "easy",
    confidence: "medium",
    issue_notes: "Companion to Immortal X-Men. Collectors who want one tend to want both.",
    market_detail: "Lower intrinsic value than Immortal X-Men but the pairing creates set demand.",
    factors: ["Krakoa era tie-in", "Gillen connection", "Short series — complete run accessible"],
  },
  {
    match: ["absolute batman"],
    intrinsic: 22,
    market: "rising",
    replaceability: "moderate",
    confidence: "medium",
    issue_notes: "Issue #1 is the key. Snyder/Dragotta prestige format. Watch for key issue developments as the story introduces new characters or reimagines existing ones.",
    market_detail: "New prestige format run — still in rising phase. Snyder Batman has strong collector history (Batman #1 New 52, Death of the Family).",
    factors: ["Scott Snyder Batman return", "Nick Dragotta — distinctive artist", "Absolute imprint prestige format", "Early issues of potential long run"],
  },
  {
    match: ["moon knight"],
    intrinsic: 22,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Black White & Blood format is limited print — all issues carry premium over standard Moon Knight issues.",
    market_detail: "MCU series drove the character surge. Premium format issues in limited print are holding value well post-hype.",
    factors: ["MCU character surge", "Black White & Blood — limited prestige format", "Moon Knight collector base is loyal and active"],
  },
  {
    match: ["hallows' eve"],
    intrinsic: 12,
    market: "cooling",
    replaceability: "very_easy",
    confidence: "medium",
    issue_notes: "New character — market is unproven. Value entirely dependent on future appearances and story importance.",
    market_detail: "New characters need 2–3 years of consistent use before collector market establishes. No urgency either way.",
    factors: ["New character — unproven market", "Spider-Man adjacent helps", "Short series — wait and see"],
  },
  {
    match: ["midnight suns"],
    intrinsic: 8,
    market: "dead",
    replaceability: "very_easy",
    confidence: "high",
    issue_notes: "Game tie-in series. The game underperformed commercially and critically.",
    market_detail: "Game tie-ins almost never appreciate unless the game becomes a cult classic. Midnight Suns is not on that trajectory.",
    factors: ["Game tie-in", "Game underperformed", "High print run", "No ongoing character development"],
  },
  {
    match: ["spider-gwen"],
    intrinsic: 15,
    market: "cooling",
    replaceability: "easy",
    confidence: "medium",
    issue_notes: "Gwenverse and Shadow Clones are event/mini series with high supply. The original Ghost-Spider series has more collector value than these.",
    market_detail: "Gwen's popularity is real but these specific series are not the key issues. Core Gwen material outperforms event spin-offs.",
    factors: ["Character demand is real", "These specific series are not key chapters", "High supply from event status"],
  },
  {
    match: ["patsy walker", "hellcat"],
    intrinsic: 22,
    market: "stable",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "Kate Leth run was genuinely undersold at publication — low print run. MCU Jessica Jones series lifted Hellcat's profile permanently.",
    market_detail: "Low print run + MCU profile = durable demand. This is a sleeper that's already partially woken up.",
    factors: ["Kate Leth — cult run", "Genuinely low print run", "MCU Hellcat appearance", "Undersold at publication — supply is constrained"],
  },
  {
    match: ["amazing spider-man"],
    intrinsic: 18,
    market: "stable",
    replaceability: "easy",
    confidence: "low",
    issue_notes: "Flagship title — value is entirely issue-dependent. Key appearances within a run vastly outperform the run average. Need to know specific issues.",
    market_detail: "Perpetual demand but perpetual supply. Key issues are the play — non-key modern Amazing Spider-Man is abundant.",
    factors: ["Flagship Marvel title — perpetual demand", "Issue-specific value — need to identify keys", "High print run on most modern issues"],
  },
  {
    match: ["star wars: darth vader black, white & red", "star wars: darth vader – black, white & red"],
    intrinsic: 18,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Prestige format anthology — all issues carry a premium over standard Star Wars comics. Vader is the most collectible SW character.",
    market_detail: "Star Wars collector base is enormous and consistent. Prestige format with Vader is a reliable hold.",
    factors: ["Darth Vader — most collectible SW character", "Black White Red prestige format", "Limited print run vs standard SW titles"],
  },
  {
    match: ["star wars: darth maul black, white & red", "star wars: darth maul – black, white & red"],
    intrinsic: 16,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Same format premium as Darth Vader BWR. Maul has a cult following that drives consistent demand.",
    market_detail: "Similar trajectory to Vader BWR. Slightly lower demand than Vader but still a solid hold.",
    factors: ["Maul cult following", "Black White Red prestige format", "Limited print run"],
  },
  {
    match: ["star wars: the mandalorian"],
    intrinsic: 12,
    market: "cooling",
    replaceability: "very_easy",
    confidence: "high",
    issue_notes: "High print run capitalising on show hype. Grogu-focused issues are the exception — anything else is mid-tier at best.",
    market_detail: "Mandalorian show hype has cooled significantly. High print run means supply is heavy. Not a priority hold.",
    factors: ["Show hype has cooled", "High print run — heavy supply", "Not a key chapter for SW comics history"],
  },
  {
    match: ["napalm lullaby"],
    intrinsic: 20,
    market: "rising",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Rick Remender return to creator-owned Image work. Low print run likely — Image first issues in this format are collector targets.",
    market_detail: "Remender's creator-owned Image work (Black Science, Low) has strong back-issue demand years after publication. Early adopter opportunity.",
    factors: ["Remender creator-owned Image", "Likely low print run", "Image first issues collect well", "Still early in publication — supply window"],
  },
  {
    match: ["decorum"],
    intrinsic: 24,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Hickman + Huddleston. Structurally unique — the visual design is unlike anything else in comics. Limited issues published.",
    market_detail: "Hickman completionists are a reliable collector base. Decorum is a genuine sleeper — undersold at publication, limited supply.",
    factors: ["Hickman + Huddleston unique pairing", "Structurally unlike anything else", "Limited issues — finite supply", "Hickman completionist demand"],
  },
  {
    match: ["radiant black"],
    intrinsic: 14,
    market: "stable",
    replaceability: "easy",
    confidence: "medium",
    issue_notes: "Kyle Higgins creator-owned. Small but devoted readership. Modest appreciation trajectory.",
    market_detail: "Indie superhero with a loyal audience but limited crossover appeal. Slow burner.",
    factors: ["Kyle Higgins creator-owned", "Image Comics — indie collector interest", "Limited mainstream crossover"],
  },
  {
    match: ["edenwood"],
    intrinsic: 12,
    market: "rising",
    replaceability: "moderate",
    confidence: "low",
    issue_notes: "Tony S. Daniel creator-owned Image debut. Too early to assess — monitor first arc reception.",
    market_detail: "New series — entirely unproven. Daniel's name carries some weight. Monitor before committing.",
    factors: ["Tony S. Daniel creator-owned", "Image debut series", "Market completely unproven"],
  },
  {
    match: ["brzrkr"],
    intrinsic: 12,
    market: "cooling",
    replaceability: "very_easy",
    confidence: "high",
    issue_notes: "Celebrity comic by Keanu Reeves. High print run due to launch hype. Celebrity comics almost never age well.",
    market_detail: "Celebrity comics peak at launch and correct hard. BRZRKR had enormous print runs. The correction has already begun.",
    factors: ["Celebrity comic — historically poor long-term performance", "High print run from hype", "No ongoing story engine"],
  },

  // ── DC back catalogue ─────────────────────────────────────────────────────
  {
    match: ["camelot 3000"],
    intrinsic: 38,
    market: "stable",
    replaceability: "very_hard",
    confidence: "high",
    issue_notes: "All 12 issues are desirable — this is a complete limited series with Brian Bolland pencils throughout, not just covers. Issue #1 commands a premium but the full run is the collector's prize.",
    market_detail: "Genuinely undervalued by most collector metrics. Bolland pencilled interiors are exceptionally rare — most Bolland work is covers only. Pre-Crisis DC prestige is a slow-burn appreciation story.",
    factors: ["Brian Bolland full interior pencils — extremely rare", "1982 prestige format pioneer", "Complete 12-issue limited series", "Pre-Crisis DC — dwindling supply of high-grade copies", "Collected in omnibus — drives back-issue interest"],
  },
  {
    match: ["starman"],
    intrinsic: 35,
    market: "stable",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "Issue #0 and #1 are the keys. James Robinson's full run is what collectors want — individual issues from the run trade well but the complete run commands a significant premium.",
    market_detail: "Omnibus editions drove renewed interest and highlighted how underpriced individual issues are. One of DC's most literary runs — studied and recommended constantly. The appreciation is slow but consistent.",
    factors: ["James Robinson's career-defining work", "Complete run premium is substantial", "Critically acclaimed — studied by serious collectors", "Omnibus publication validated collector interest", "Jack Knight — beloved unique character"],
  },
  {
    match: ["detective comics"],
    intrinsic: 22,
    market: "stable",
    replaceability: "moderate",
    confidence: "low",
    issue_notes: "Value is entirely issue and run dependent. Tec has 1000+ issues — knowing which run and issues you have is essential. Some runs are keys, most aren't.",
    market_detail: "Batman collector base is enormous and consistent. Perpetual demand but need issue-level detail.",
    factors: ["Longest-running DC title", "Batman brand — perpetual collector demand", "Issue-specific value — which run matters enormously"],
  },
  {
    match: ["batman and robin"],
    intrinsic: 20,
    market: "stable",
    replaceability: "moderate",
    confidence: "medium",
    issue_notes: "Grant Morrison's run (vol 1, 2009). Issue #1 is the key — Dick Grayson as Batman is a unique era. Professor Pyg first appearance is within this run.",
    market_detail: "Morrison's Batman saga is studied and collected as a complete work. This series is a key chapter. Modest but consistent demand.",
    factors: ["Grant Morrison Batman era", "Dick Grayson as Batman — unique period", "Professor Pyg first appearance in this run", "Morrison completionist demand"],
  },
  {
    match: ["catwoman"],
    intrinsic: 14,
    market: "stable",
    replaceability: "easy",
    confidence: "medium",
    issue_notes: "Tom King run (2018). Critically praised but commercially abundant. Key Selina/Bruce wedding arc issues have slightly elevated demand.",
    market_detail: "King's Catwoman is well-regarded but heavily stocked. Not a standout performer. Character is perpetually relevant but this run doesn't have the key issue density of his Batman run.",
    factors: ["Tom King — acclaimed writer", "Catwoman perpetually relevant", "High supply — heavy print run", "No standout key issues"],
  },
  {
    match: ["superman: son of kal-el"],
    intrinsic: 18,
    market: "stable",
    replaceability: "easy",
    confidence: "medium",
    issue_notes: "Jon Kent as Superman. Issue #18 (Jon's coming out) is the key issue — that specific issue commands a premium. Other issues are standard modern.",
    market_detail: "Jon Kent Superman is an established character. If you have #18 specifically that's the hold. Other issues have modest collector interest.",
    factors: ["Jon Kent — established DCU character", "Coming out issue #18 is a genuine key", "Character has ongoing DCU relevance"],
  },
  {
    match: ["world of krypton"],
    intrinsic: 26,
    market: "stable",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "1979 DC — first Superman limited series in DC history. All 3 issues are collectible. Age premium is significant.",
    market_detail: "Pre-Crisis DC limited series are genuinely scarce in high grade. Superman collectors hunt these. Slow appreciation but durable.",
    factors: ["1979 DC — age premium substantial", "First Superman limited series in DC history", "Pre-Crisis collector appeal", "Scarce in high grade"],
  },
  {
    match: ["fury of firestorm"],
    intrinsic: 14,
    market: "stable",
    replaceability: "moderate",
    confidence: "low",
    issue_notes: "1980s DC — age premium applies. Value depends heavily on which issues. Early Conway/Broderick issues are the most collectible.",
    market_detail: "Firestorm has a cult following that keeps demand steady at a low level. Not a mainstream mover.",
    factors: ["1980s DC age premium", "Firestorm cult character", "Conway/Broderick creative team noted"],
  },
  {
    match: ["justice league america"],
    intrinsic: 18,
    market: "stable",
    replaceability: "moderate",
    confidence: "medium",
    issue_notes: "Giffen/DeMatteis 'Bwahahaha' era (roughly #1–60). Key issues include the debut of this era's roster and the Fire/Ice storylines. The comedic tone makes this run unique.",
    market_detail: "Cult classic run with a devoted following. Convention staple. Key issues from this run trade consistently well.",
    factors: ["Giffen/DeMatteis 'Bwahahaha' era — cult classic", "Booster Gold/Blue Beetle — beloved characters", "Unique comedic tone in DC history", "Convention demand consistent"],
  },
  {
    match: ["dc's year of the villain"],
    intrinsic: 2,
    market: "dead",
    replaceability: "very_easy",
    confidence: "high",
    issue_notes: "Promotional/giveaway issue. Essentially no secondary market value.",
    market_detail: "Promotional giveaway. Not a collectible by any metric.",
    factors: ["Promotional giveaway — unlimited supply", "No scarcity", "No key issue status"],
  },
  {
    match: ["batman day"],
    intrinsic: 2,
    market: "dead",
    replaceability: "very_easy",
    confidence: "high",
    issue_notes: "Batman Day promotional giveaway. No secondary market value.",
    market_detail: "Free promotional issue. Not a collectible.",
    factors: ["Free promotional giveaway", "Unlimited supply", "No collectible status"],
  },
  {
    match: ["secret history of the authority"],
    intrinsic: 16,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Limited series in the Wildstorm/Authority universe. Hawksmoor-focused.",
    market_detail: "Wildstorm completionists collect everything Authority-adjacent. Modest but real demand.",
    factors: ["Wildstorm/Authority universe", "Limited series — finite supply", "Authority collector premium"],
  },
  {
    match: ["adventures of superman"],
    intrinsic: 14,
    market: "stable",
    replaceability: "moderate",
    confidence: "low",
    issue_notes: "1987 series — Byrne/Ordway era. Value depends entirely on which issues. Post-Crisis Superman collector interest is niche.",
    market_detail: "General Superman titles from this era are affordable and abundant. Key issues within the run are the value play.",
    factors: ["Post-Crisis era — age premium moderate", "Byrne/Ordway era noted", "Issue-specific value"],
  },
  {
    match: ["preacher special"],
    intrinsic: 20,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Preacher specials are harder to find than the main series. One Man's War specifically is a significant chapter in the Preacher mythology.",
    market_detail: "Vertigo specials trade at a premium over equivalent main series issues due to scarcity. TV series legacy keeps demand alive.",
    factors: ["Vertigo special — scarcer than main series", "Garth Ennis/Steve Dillon peak work", "TV series legacy", "One Man's War is significant in the canon"],
  },

  // ── Early Image Comics ────────────────────────────────────────────────────
  {
    match: ["spawn"],
    intrinsic: 30,
    market: "stable",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "Issue #1 is the key — one of the most printed #1s of the 90s but demand keeps pace. Early issues (#1–10) all have collector interest. Later issues (#100, #200, #300) are modern milestones.",
    market_detail: "Longest-running creator-owned superhero series. Todd McFarlane brand is durable. Early issues consistently perform at auction. The character has survived 30+ years — that's unusual for independent comics.",
    factors: ["Longest-running creator-owned superhero series", "Todd McFarlane — founding Image creator", "30+ year publication history", "Film and animation history", "Early issues in high grade are genuinely scarce"],
  },
  {
    match: ["savage dragon"],
    intrinsic: 22,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Erik Larsen's creator-owned run. Issue #1 is the key. Early issues (#1–10) have founder-era premium. The series is still ongoing which keeps interest alive.",
    market_detail: "Less mainstream than Spawn but Image founder era is a consistent collector segment. Original issues have steady demand.",
    factors: ["Erik Larsen creator-owned", "Image founder era", "Still ongoing — collector interest maintained", "Original issues genuinely hard to find in high grade"],
  },
  {
    match: ["superpatriot"],
    intrinsic: 14,
    market: "stable",
    replaceability: "hard",
    confidence: "low",
    issue_notes: "Early Image tie-in series. Low original print run makes these genuinely scarce despite the low profile.",
    market_detail: "Too obscure for mainstream demand but low print run creates real scarcity. Image completionists are the buyer.",
    factors: ["Early Image — low print run", "Larsen/Valentino era connection", "Genuine scarcity despite low profile"],
  },
  {
    match: ["king spawn"],
    intrinsic: 10,
    market: "cooling",
    replaceability: "easy",
    confidence: "medium",
    issue_notes: "Modern Spawn spin-off. Higher print run than the original series. Less iconic than McFarlane-era issues.",
    market_detail: "Spawn brand is strong but King Spawn doesn't carry the same weight as early McFarlane work.",
    factors: ["Modern Spawn spin-off", "Higher print run than original", "Less iconic than McFarlane era"],
  },
  {
    match: ["stormwatch"],
    intrinsic: 28,
    market: "stable",
    replaceability: "very_hard",
    confidence: "high",
    issue_notes: "Warren Ellis's run on Stormwatch (vol 2) is where the Authority was born. The bridge issues leading to the Authority launch are the most valuable. These are extremely hard to find.",
    market_detail: "Ellis's Authority is the most influential superhero comic of the late 90s. Stormwatch is where it started. Authority collector demand spills directly into these issues. Very hard to find in high grade.",
    factors: ["Authority precursor — Warren Ellis launch", "Most influential late-90s superhero comic origin", "Extremely hard to find in high grade", "Ellis completionist demand", "Wildstorm collector premium"],
  },
  {
    match: ["injection"],
    intrinsic: 22,
    market: "stable",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Warren Ellis + Declan Shalvey. Series was never completed — only 15 issues. Complete run collectors are the target market.",
    market_detail: "Incomplete series but Ellis/Shalvey creative pairing has strong demand. Shalvey's stock has risen — Moon Knight, Inferno. Hard to find complete run.",
    factors: ["Warren Ellis + Declan Shalvey", "Only 15 issues — series ended", "Shalvey's rising profile", "Complete run is the collector target"],
  },
  {
    match: ["once & future"],
    intrinsic: 20,
    market: "rising",
    replaceability: "moderate",
    confidence: "medium",
    issue_notes: "Kieron Gillen + Dan Mora. Issue #1 is the key. Dan Mora's profile has risen significantly — his work now commands serious collector attention.",
    market_detail: "Dan Mora has become one of the most in-demand artists in comics. Early issues of his runs are being revisited by collectors. Still in rising phase.",
    factors: ["Kieron Gillen — acclaimed writer", "Dan Mora — superstar artist in demand", "BOOM! Studios strong collector following", "Still in rising appreciation phase"],
  },

  // ── Valiant ───────────────────────────────────────────────────────────────
  {
    match: ["eternal warrior"],
    intrinsic: 26,
    market: "rising",
    replaceability: "hard",
    confidence: "medium",
    issue_notes: "Original Valiant Universe (1992). Low original print run. Gilad Anni-Padda is central to the VU — collector demand for original run is real and rising.",
    market_detail: "Original Valiant Universe books are a slow-burn appreciation story. Bloodshot and X-O Manowar film options have raised the entire original VU. Eternal Warrior is undervalued relative to other VU titles.",
    factors: ["Original Valiant Universe 1992", "Low original print run", "Valiant originals rising with film option interest", "Gilad is central to VU mythology", "Undervalued relative to VU peers"],
  },

  // ── Age of Apocalypse ─────────────────────────────────────────────────────
  {
    match: ["generation next"],
    intrinsic: 28,
    market: "stable",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "Complete 4-issue limited series. Chris Bachalo art — his most distinctive work. AoA complete set value: collectors pay a premium for the complete crossover over individual titles.",
    market_detail: "AoA is one of the most significant X-Men events — it rewrote the universe. Complete set commands premium. Generation Next has the additional appeal of Bachalo's art at his peak.",
    factors: ["Age of Apocalypse — landmark X-Men event", "Complete 4-issue run", "Chris Bachalo peak art", "AoA complete set premium", "X-Men collector base is enormous"],
  },
  {
    match: ["weapon x"],
    intrinsic: 24,
    market: "stable",
    replaceability: "hard",
    confidence: "high",
    issue_notes: "Barry Windsor-Smith original Weapon X (Marvel Comics Presents) is the key — if this is that, it's very valuable. If it's the AoA Weapon X, it's strong but different. AoA Weapon X is a key chapter in that crossover.",
    market_detail: "Wolverine collector demand is one of the deepest in comics. Any Weapon X material is sought. AoA version has crossover premium.",
    factors: ["Weapon X — Wolverine centrepiece", "AoA crossover chapter — set completion value", "Wolverine collector demand is deep and consistent"],
  },
  {
    match: ["x-man"],
    intrinsic: 20,
    market: "stable",
    replaceability: "moderate",
    confidence: "medium",
    issue_notes: "AoA origin issues are the keys — early X-Man issues from the AoA event. The ongoing series that followed has more supply and less collector interest.",
    market_detail: "AoA origin issues carry the event premium. Later X-Man ongoing is mid-tier. If you have the original AoA issues specifically, those are the hold.",
    factors: ["AoA origin — event premium applies", "Nate Grey character has cult following", "AoA vs ongoing — big difference in value"],
  },

  // ── BOOM! Studios ─────────────────────────────────────────────────────────
  {
    match: ["once & future"],
    intrinsic: 20,
    market: "rising",
    replaceability: "moderate",
    confidence: "medium",
    issue_notes: "Gillen + Mora. Dan Mora's stock has risen significantly since this launched.",
    market_detail: "Dan Mora is now one of the most in-demand artists. Early issues are being revisited.",
    factors: ["Kieron Gillen + Dan Mora", "BOOM! Studios collector following", "Rising appreciation"],
  },

  // ── Archie ────────────────────────────────────────────────────────────────
  {
    match: ["sonic the hedgehog"],
    intrinsic: 10,
    market: "cooling",
    replaceability: "very_easy",
    confidence: "medium",
    issue_notes: "Archie Sonic continuity was wiped when IDW took over the license. Archie Sonic exists in a nostalgic bubble — specific issues matter a lot (early issues, key story arcs).",
    market_detail: "Archie Sonic has nostalgia value but the continuity was permanently ended. Niche collector market exists but is shrinking.",
    factors: ["Archie continuity ended — no new material", "Nostalgia-driven market", "Specific early issues have more value than later run"],
  },

  // ── Misc Marvel ──────────────────────────────────────────────────────────
  {
    match: ["wild cards"],
    intrinsic: 22,
    market: "stable",
    replaceability: "very_hard",
    confidence: "medium",
    issue_notes: "Marvel/Epic Comics 1990 adaptation of George R.R. Martin's shared universe anthology. Pre-Game of Thrones GRRM publication — extremely obscure.",
    market_detail: "Pre-fame GRRM material is actively sought by GRRM collectors. This is genuinely obscure — most collectors don't know it exists. That creates real scarcity.",
    factors: ["George R.R. Martin IP", "Pre-Game of Thrones publication", "Extremely obscure — genuine scarcity", "GRRM collector base is active"],
  },
  {
    match: ["tomorrow knights"],
    intrinsic: 12,
    market: "stable",
    replaceability: "very_hard",
    confidence: "low",
    issue_notes: "1990 Marvel — obscure cyberpunk mini-series. Low print run but also low demand. A slow burner at best.",
    market_detail: "Too obscure for mainstream demand. Low print run creates real scarcity but demand hasn't developed. Possibly never will.",
    factors: ["1990 Marvel — low print run era", "Obscure cyberpunk concept", "Genuine scarcity", "Demand has not materialised"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RUN COMPLETION DETECTION
// Detects series where you own multiple issues — complete sets command premium
// ─────────────────────────────────────────────────────────────────────────────

function detectRunCompletion(comics) {
  const bySeries = {};
  comics.forEach(c => {
    if (!c.series) return;
    if (!bySeries[c.series]) bySeries[c.series] = [];
    bySeries[c.series].push(c);
  });

  const runSignals = {};
  Object.entries(bySeries).forEach(([series, issues]) => {
    if (issues.length >= 2) {
      runSignals[series] = {
        count: issues.length,
        bonus: Math.min(15, issues.length * 3), // up to +15 for a full run
        note: `You own ${issues.length} issues of this series — complete run premium applies`,
      };
    }
  });

  return runSignals;
}

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION SCORING
// ─────────────────────────────────────────────────────────────────────────────

function scoreIntrinsic(comic, kb) {
  let score  = kb ? kb.intrinsic : 15; // default 15 for unknowns
  const notes = [...(kb?.factors || [])];

  // Age bonuses (stacked on top of KB score)
  if (comic.year) {
    if      (comic.year < 1975) { score += 20; notes.push("Pre-1975 — substantial age premium"); }
    else if (comic.year < 1980) { score += 15; notes.push("Late 1970s — strong age premium"); }
    else if (comic.year < 1985) { score += 12; notes.push("Early 1980s — age premium"); }
    else if (comic.year < 1990) { score += 8;  notes.push("Mid-to-late 1980s — age premium"); }
    else if (comic.year < 1993) { score += 5;  notes.push("Early 1990s — modest age premium"); }
  }

  // Publisher era bonuses
  const pub = (comic.publisher || "").toLowerCase();
  if (pub.includes("valiant")   && comic.year && comic.year < 1997) { score += 10; notes.push("Original Valiant Universe"); }
  if (pub.includes("vertigo"))                                        { score += 6;  notes.push("Vertigo imprint premium"); }
  if (pub.includes("wildstorm"))                                      { score += 6;  notes.push("Wildstorm collector premium"); }
  if (pub.includes("image")     && comic.year && comic.year < 1996) { score += 8;  notes.push("Early Image founder era"); }
  if (pub.includes("dark horse") && comic.year && comic.year < 1998) { score += 5;  notes.push("Dark Horse 1990s independent"); }

  // Condition bonus
  if (comic.condition) {
    const c = comic.condition.toLowerCase();
    if      (c.includes("near mint") || c.includes("nm-")) { score += 8; notes.push("Near Mint condition — grade premium"); }
    else if (c.includes("very fine") || c.includes("vf"))  { score += 4; notes.push("Very Fine condition"); }
    else if (c.includes("good") || c.includes("poor"))     { score -= 5; notes.push("Lower grade — limits value ceiling"); }
  }

  return { score: Math.max(0, Math.min(100, score)), notes };
}

function scorePersonal(comic, runSignals) {
  let score   = 30; // start at 30 for owned comics
  const notes = [];

  const tags = comic.tags || [];
  if (tags.includes("Bluechip"))        { score += 30; notes.push("Your Bluechip tag — highest personal value signal"); }
  if (tags.includes("Sleeper"))         { score += 15; notes.push("Your Sleeper tag — potential upside flagged"); }
  if (tags.includes("Excellent Read"))  { score += 10; notes.push("Your Excellent Read tag — strong personal value"); }
  if (tags.includes("Tradable"))        { score -= 25; notes.push("Your Tradable tag — you've already decided to move this"); }

  if (!comic.read) { score += 8;  notes.push("Unread — reading value not yet realised"); }
  else             { score -= 5;  notes.push("Already read — experience captured"); }

  if ((comic.gifted_to || []).length > 0) {
    score += 10;
    const people = [...new Set(comic.gifted_to.map(g => g.person))].join(", ");
    notes.push(`Gifted to ${people} — provenance and sentimental value`);
  }
  if (comic.gifted_by?.person) {
    score += 18;
    notes.push(`Gift from ${comic.gifted_by.person} — strong sentimental keep`);
  }

  const run = runSignals[comic.series];
  if (run) {
    score += run.bonus;
    notes.push(run.note);
  }

  return { score: Math.max(0, Math.min(100, score)), notes };
}

function scoreMarketTiming(kb) {
  if (!kb) return { score: 50, notes: ["Unknown series — market timing unassessed"], urgency: "none" };

  const MAP = {
    peak:     { score: 75, notes: ["Market timing: AT PEAK — strong sell signal"], urgency: "high" },
    rising:   { score: 35, notes: ["Market timing: RISING — let it appreciate further"], urgency: "low" },
    stable:   { score: 45, notes: ["Market timing: STABLE — no urgency either way"], urgency: "none" },
    cooling:  { score: 60, notes: ["Market timing: COOLING — consider selling before further correction"], urgency: "medium" },
    dead:     { score: 85, notes: ["Market timing: DEAD — this is not appreciating"], urgency: "high" },
  };

  const result = MAP[kb.market] || MAP.stable;
  if (kb.market_detail) result.notes.push(kb.market_detail);
  return result;
}

function scoreReplaceability(kb) {
  if (!kb) return { score: 50, notes: ["Replaceability unknown"] };

  const MAP = {
    very_hard: { score: 10, notes: ["Extremely hard to replace — once sold, unlikely to find again at reasonable price"] },
    hard:      { score: 25, notes: ["Hard to replace — limited supply in secondary market"] },
    moderate:  { score: 50, notes: ["Moderate replaceability — available but requires searching"] },
    easy:      { score: 75, notes: ["Easy to replace — abundant supply in secondary market"] },
    very_easy: { score: 90, notes: ["Very easy to replace — highly available, no scarcity"] },
  };

  return MAP[kb?.replaceability] || MAP.moderate;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATION ENGINE
// Derives recommendation from four dimensions — not a blended score
// ─────────────────────────────────────────────────────────────────────────────

function deriveRecommendation(intrinsic, personal, marketTiming, replaceability, kb, comic) {
  const tags = comic.tags || [];

  // Hard overrides first
  if (tags.includes("Tradable") && personal.score < 40) {
    return { recommendation: "Trade", urgency: "low", reason: "Your own Tradable tag combined with low personal value — trust your instinct." };
  }
  if (comic.gifted_by?.person && personal.score >= 60) {
    return { recommendation: "Keep Long Term", urgency: "none", reason: `Gift from ${comic.gifted_by.person} — sentimental value overrides market signals.` };
  }
  if (kb?.market === "dead" && intrinsic.score < 20) {
    return { recommendation: "Trade", urgency: "high", reason: kb.market_detail || "No appreciation potential and market is dead." };
  }

  // Core decision matrix
  const highIntrinsic  = intrinsic.score  >= 55;
  const highPersonal   = personal.score   >= 55;
  const marketPeak     = marketTiming.score >= 70;
  const hardToReplace  = replaceability.score <= 30;
  const easyToReplace  = replaceability.score >= 65;

  if (highIntrinsic && highPersonal) {
    return { recommendation: "Keep Long Term", urgency: "none", reason: "Strong intrinsic value combined with high personal value — a core collection piece." };
  }
  if (highIntrinsic && !highPersonal && marketPeak && easyToReplace) {
    return { recommendation: "Trade", urgency: "high", reason: "Peak market timing, low personal attachment, and easy to replace if you change your mind. Optimal sell window." };
  }
  if (highIntrinsic && !highPersonal && marketPeak && !easyToReplace) {
    return { recommendation: "Keep Short Term", urgency: "none", reason: "Peak market but hard to replace — hold a little longer and monitor before deciding." };
  }
  if (highIntrinsic && !highPersonal && !marketPeak) {
    return { recommendation: "Keep Short Term", urgency: "none", reason: "Good intrinsic value but personal attachment is low. Hold and reassess — market may improve." };
  }
  if (!highIntrinsic && highPersonal) {
    return { recommendation: "Keep Short Term", urgency: "none", reason: "Personal value is the primary driver here. Keep while it matters to you." };
  }
  if (!highIntrinsic && !highPersonal && hardToReplace) {
    return { recommendation: "Keep Short Term", urgency: "none", reason: "Low value signals but hard to replace — hold until you're sure before trading." };
  }
  if (!highIntrinsic && !highPersonal) {
    return { recommendation: "Trade", urgency: marketPeak ? "high" : "low", reason: "Low intrinsic and personal value. No strong case for holding." };
  }

  return { recommendation: "Keep Short Term", urgency: "none", reason: "Mixed signals — default to holding and monitoring." };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCORING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

function scoreComic(comic, runSignals) {
  // Find KB entry
  const tl  = (comic.title  || "").toLowerCase();
  const sl  = (comic.series || "").toLowerCase();
  const kb  = SERIES_KB.find(e => e.match.some(m => tl.includes(m) || sl.includes(m)));

  const intrinsic      = scoreIntrinsic(comic, kb);
  const personal       = scorePersonal(comic, runSignals);
  const marketTiming   = scoreMarketTiming(kb);
  const replaceability = scoreReplaceability(kb);
  const { recommendation, urgency, reason } = deriveRecommendation(intrinsic, personal, marketTiming, replaceability, kb, comic);

  // Trade score: how urgently should you consider trading?
  // High market timing + low intrinsic/personal + easy replace = high trade score
  const tradeScore = Math.round(
    (marketTiming.score   * 0.35) +
    ((100 - intrinsic.score) * 0.25) +
    ((100 - personal.score)  * 0.25) +
    (replaceability.score    * 0.15)
  );

  // Keep score: how strongly should you hold?
  const keepScore = Math.round(
    (intrinsic.score      * 0.40) +
    (personal.score       * 0.30) +
    ((100 - marketTiming.score)  * 0.15) +
    ((100 - replaceability.score) * 0.15)
  );

  // Collect all factor notes
  const allFactors = [
    ...intrinsic.notes.slice(0, 3),
    ...personal.notes.slice(0, 2),
    ...marketTiming.notes.slice(0, 2),
    ...replaceability.notes.slice(0, 1),
  ];

  const summary = kb?.issue_notes
    ? `${reason} ${kb.issue_notes}`
    : reason;

  return {
    recommendation,
    trade_score:          Math.max(0, Math.min(100, tradeScore)),
    keep_score:           Math.max(0, Math.min(100, keepScore)),
    analysis_confidence:  kb?.confidence || "low",
    analysis_summary:     summary,
    value_factors:        [...new Set(allFactors)].slice(0, 8),
    market_note:          kb?.market_detail || "No specific market data for this series.",
    trade_urgency:        urgency,
    // Store dimension scores for the UI
    dim_intrinsic:        intrinsic.score,
    dim_personal:         personal.score,
    dim_market:           marketTiming.score,
    dim_replaceability:   replaceability.score,
    analyzed_at:          new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function analyzeCollection() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Jacob's Comic Books — Multi-Dimensional Collection Analysis");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const query = FORCE
    ? { term: { owned: true } }
    : { bool: { filter: [{ term: { owned: true } }], must_not: [{ exists: { field: "recommendation" } }] } };

  const esRes = await es.search({
    index: INDEX,
    body: {
      query,
      _source: ["title", "series", "publisher", "year", "tags", "read", "gifted_to", "gifted_by", "condition", "genre", "writer"],
      size: 500,
    }
  });

  const comics = esRes.body.hits.hits.map(h => ({ id: h._id, ...h._source }));

  if (comics.length === 0) {
    console.log(FORCE ? "No owned comics found." : "✅ All comics already analyzed. Use --force to re-analyze.");
    return;
  }

  console.log(`📚 Scoring ${comics.length} comic${comics.length !== 1 ? "s" : ""}${FORCE ? " (forced re-analysis)" : ""}...`);

  // Build run completion signals across the whole collection
  const allOwnedRes = await es.search({
    index: INDEX,
    body: { query: { term: { owned: true } }, _source: ["series"], size: 500 }
  });
  const allOwned   = allOwnedRes.body.hits.hits.map(h => h._source);
  const runSignals = detectRunCompletion(allOwned);

  if (Object.keys(runSignals).length > 0) {
    console.log(`\n📖 Run completion detected in ${Object.keys(runSignals).length} series:`);
    Object.entries(runSignals).forEach(([s, r]) => console.log(`   ${s}: ${r.count} issues (+${r.bonus} personal score bonus)`));
  }

  // Score all comics
  const scored = comics.map(c => ({ comic: c, result: scoreComic(c, runSignals) }));

  // Assign trade ranks (1 = most urgent to trade)
  const sorted = [...scored].sort((a, b) => {
    // Primary: urgency (high > medium > low > none)
    const urgencyOrder = { high: 0, medium: 1, low: 2, none: 3 };
    const uDiff = (urgencyOrder[a.result.trade_urgency] || 3) - (urgencyOrder[b.result.trade_urgency] || 3);
    if (uDiff !== 0) return uDiff;
    // Secondary: trade score
    return b.result.trade_score - a.result.trade_score;
  });
  sorted.forEach((item, i) => { item.result.trade_rank = i + 1; });

  if (!REPORT) {
    console.log(`\n💾 Saving to Elasticsearch...`);
    for (const { comic, result } of scored) {
      await es.update({ index: INDEX, id: comic.id, body: { doc: result } });
    }
    await es.indices.refresh({ index: INDEX });
    console.log(`✅ Saved ${scored.length} analyses.`);
  }

  // ── Print report ─────────────────────────────────────────────────────────
  const keepLong  = scored.filter(s => s.result.recommendation === "Keep Long Term");
  const keepShort = scored.filter(s => s.result.recommendation === "Keep Short Term");
  const trade     = scored.filter(s => s.result.recommendation === "Trade");

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  🏆 Keep Long Term:    ${keepLong.length}`);
  console.log(`  📦 Keep Short Term:   ${keepShort.length}`);
  console.log(`  ♻️  Recommended Trade: ${trade.length}`);

  const urgent = scored.filter(s => s.result.trade_urgency === "high" && s.result.recommendation === "Trade");
  if (urgent.length > 0) {
    console.log("\n─── ⚡ HIGH URGENCY TRADES (act now) ────────────────────────────");
    urgent.sort((a, b) => a.result.trade_rank - b.result.trade_rank).forEach(({ comic, result }) => {
      console.log(`  [Trade Score: ${result.trade_score}] ${(comic.series||comic.title).padEnd(35).slice(0,35)} ${comic.year||""}`);
      console.log(`  → ${result.market_note}`);
    });
  }

  if (trade.length > 0) {
    console.log("\n─── TRADE CANDIDATES (ranked by urgency + score) ───────────────");
    sorted.filter(s => s.result.recommendation === "Trade").forEach(({ comic, result }) => {
      const u = result.trade_urgency === "high" ? "⚡" : result.trade_urgency === "medium" ? "⚠️ " : "  ";
      console.log(`  ${u} #${String(result.trade_rank).padStart(2)} [${result.trade_score}] ${(comic.series||comic.title).padEnd(35).slice(0,35)} ${comic.year||""}`);
    });
  }

  console.log("\n─── LONG-TERM KEEPS (by keep score) ────────────────────────────");
  keepLong.sort((a, b) => b.result.keep_score - a.result.keep_score).forEach(({ comic, result }) => {
    console.log(`  [${result.keep_score}] ${(comic.series||comic.title).padEnd(35).slice(0,35)} ${comic.year||""}`);
    if (result.value_factors[0]) console.log(`       → ${result.value_factors[0]}`);
  });

  if (!REPORT) {
    console.log("\n💡 Results visible in the Analysis tab. Use --force to refresh.");
  }
}

analyzeCollection().catch(console.error);
