/**
 * seed.js — Index mapping + real GreyWarden247 collection data
 *
 * MAPPING DECISIONS:
 * - gift objects are nested (not flattened) so we can query inside them
 * - tags are keyword arrays — fast aggregations, no analysis needed
 * - locg_id stores the League of Comic Geeks series ID for deep-linking
 */

import { Client } from "@opensearch-project/opensearch";
import dotenv from "dotenv";
dotenv.config();

const esConfig = process.env.ELASTIC_CLOUD_ID
  ? {
      cloud: { id: process.env.ELASTIC_CLOUD_ID },
      auth: { username: process.env.ELASTIC_USERNAME || "elastic", password: process.env.ELASTIC_PASSWORD },
    }
  : { node: process.env.ELASTICSEARCH_URL || "http://localhost:9200" };

const es = new Client(esConfig);
const INDEX = "comics";

const mapping = {
  mappings: {
    properties: {
      // ── Core identity ──────────────────────────────────────────────
      title:        { type: "text", analyzer: "english", fields: { keyword: { type: "keyword" } } },
      series:       { type: "text", fields: { keyword: { type: "keyword" } } },
      issue:        { type: "integer" },
      year:         { type: "integer" },
      publisher:    { type: "text", fields: { keyword: { type: "keyword" } } },
      genre:        { type: "text", fields: { keyword: { type: "keyword" } } },
      writer:       { type: "text", fields: { keyword: { type: "keyword" } } },
      artist:       { type: "text", fields: { keyword: { type: "keyword" } } },
      characters:   { type: "text", analyzer: "english" },
      description:  { type: "text", analyzer: "english" },
      coverImage:   { type: "keyword" },

      // ── LoCG integration ──────────────────────────────────────────
      locg_id:      { type: "keyword" },   // series ID from LoCG URL
      locg_url:     { type: "keyword" },   // deep link to LoCG series page

      // ── Collection status ─────────────────────────────────────────
      owned:        { type: "boolean" },
      read:         { type: "boolean" },
      on_wish_list: { type: "boolean" },
      condition:    { type: "keyword" },   // Near Mint, Very Fine, Fine, Good, Poor
      storage_box:  { type: "keyword" },   // e.g. "Box A", "Box 1", "Shelf"

      // ── Your tags (LoCG-style) ────────────────────────────────────
      // keyword array: ["Bluechip", "Excellent Read"] etc.
      tags:         { type: "keyword" },

      // ── Ratings & value ───────────────────────────────────────────
      rating:       { type: "integer" },   // 1–10 personal
      cover_price:  { type: "float" },
      est_value:    { type: "float" },

      // ── Gifting provenance ────────────────────────────────────────
      // gifted_to: comics you bought and gave away
      gifted_to: {
        type: "nested",
        properties: {
          person:    { type: "keyword" },
          date:      { type: "date", format: "yyyy-MM-dd" },
          occasion:  { type: "keyword" },  // Birthday, Christmas, Just Because, etc.
          notes:     { type: "text" },
        },
      },
      // gifted_by: comics someone gave you
      gifted_by: {
        properties: {
          person:    { type: "keyword" },
          date:      { type: "date", format: "yyyy-MM-dd" },
          occasion:  { type: "keyword" },
          notes:     { type: "text" },
        },
      },

      notes:        { type: "text" },
      added_date:   { type: "date", format: "yyyy-MM-dd" },
      createdAt:    { type: "date" },
    },
  },
  settings: { number_of_shards: 1, number_of_replicas: 0 },
};

// ── Real collection data from GreyWarden247's LoCG profile ───────────────────
// 58 issues across 50 series. Tags, wish list, and gifting data pre-populated
// where known from profile. Fill in gifting/condition/storage as you go.

const collection = [
  // ── DC Comics ────────────────────────────────────────────────────────────
  {
    series: "Absolute Batman", issue: 1, year: 2024, publisher: "DC Comics",
    genre: "Superhero", writer: "Scott Snyder", artist: "Nick Dragotta",
    tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "178012", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/178012",
    title: "Absolute Batman #1",
  },
  {
    series: "The Adventures of Superman", issue: null, year: 1987, publisher: "DC Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "111743", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/111743",
    title: "The Adventures of Superman",
  },
  {
    series: "Batman and Robin", issue: null, year: 2009, publisher: "DC Comics",
    genre: "Superhero", writer: "Grant Morrison", tags: ["Excellent Read"],
    owned: true, read: true, on_wish_list: false,
    locg_id: "110416", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/110416",
    title: "Batman and Robin",
  },
  {
    series: "Batman Day 2022: Batman's Mystery Casebook – Special Edition", issue: 1, year: 2022, publisher: "DC Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "159739", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/159739",
    title: "Batman Day 2022: Batman's Mystery Casebook – Special Edition",
  },
  {
    series: "Camelot 3000", issue: null, year: 1982, publisher: "DC Comics",
    genre: "Fantasy", writer: "Mike W. Barr", artist: "Brian Bolland",
    tags: ["Bluechip", "Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "101454", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/101454",
    title: "Camelot 3000",
    description: "A prestige 12-issue limited series set in the far future where King Arthur and his knights are reincarnated to face an alien invasion. Brian Bolland's art is stunning throughout.",
  },
  {
    series: "Catwoman", issue: null, year: 2018, publisher: "DC Comics",
    genre: "Superhero", writer: "Tom King", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "137529", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/137529",
    title: "Catwoman",
  },
  {
    series: "DC / Marvel: Batman / Deadpool", issue: 1, year: 2025, publisher: "DC Comics",
    genre: "Superhero", tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "190068", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/190068",
    title: "DC / Marvel: Batman / Deadpool #1",
  },
  {
    series: "DC / Marvel: Superman / Spider-Man", issue: 1, year: 2026, publisher: "DC Comics",
    genre: "Superhero", tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "197943", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/197943",
    title: "DC / Marvel: Superman / Spider-Man #1",
  },
  {
    series: "DC's Year of the Villain Special", issue: 1, year: 2019, publisher: "DC Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "141506", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/141506",
    title: "DC's Year of the Villain Special #1",
  },
  {
    series: "Detective Comics", issue: null, year: 1937, publisher: "DC Comics",
    genre: "Superhero", tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "102374", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/102374",
    title: "Detective Comics",
  },
  {
    series: "The Fury of Firestorm", issue: null, year: 1982, publisher: "DC Comics",
    genre: "Superhero", tags: ["Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "113664", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/113664",
    title: "The Fury of Firestorm",
  },
  {
    series: "Justice League America", issue: null, year: 1989, publisher: "DC Comics",
    genre: "Superhero", writer: "Keith Giffen", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "113358", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/113358",
    title: "Justice League America",
  },
  {
    series: "Preacher Special: One Man's War", issue: 1, year: 1998, publisher: "DC Comics",
    genre: "Horror", writer: "Garth Ennis", artist: "Steve Dillon",
    tags: ["Excellent Read"], owned: true, read: true, on_wish_list: false,
    locg_id: "112434", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/112434",
    title: "Preacher Special: One Man's War",
  },
  {
    series: "Secret History of The Authority: Hawksmoor", issue: null, year: 2008, publisher: "DC Comics",
    genre: "Superhero", tags: ["Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "108168", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/108168",
    title: "Secret History of The Authority: Hawksmoor",
  },
  {
    series: "Starman", issue: null, year: 1994, publisher: "DC Comics",
    genre: "Superhero", writer: "James Robinson", tags: ["Sleeper", "Excellent Read"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "107188", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/107188",
    title: "Starman",
    description: "James Robinson's acclaimed run about Jack Knight, an antique dealer reluctantly inheriting his father's role as the cosmic-powered Starman. One of DC's most literary series.",
  },
  {
    series: "Superman: Son of Kal-El", issue: null, year: 2021, publisher: "DC Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "151238", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/151238",
    title: "Superman: Son of Kal-El",
  },
  {
    series: "The World of Krypton", issue: null, year: 1979, publisher: "DC Comics",
    genre: "Superhero", tags: ["Bluechip", "Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "115086", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/115086",
    title: "The World of Krypton",
  },

  // ── Marvel Comics ────────────────────────────────────────────────────────
  {
    series: "The Amazing Spider-Man", issue: null, year: 2015, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Dan Slott", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "119456", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/119456",
    title: "The Amazing Spider-Man",
  },
  {
    series: "Edge of Spider-Verse", issue: null, year: 2014, publisher: "Marvel Comics",
    genre: "Superhero", tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "113950", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/113950",
    title: "Edge of Spider-Verse",
  },
  {
    series: "Generation Next", issue: null, year: 1995, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Scott Lobdell", artist: "Chris Bachalo",
    tags: ["Sleeper", "Bluechip"], owned: true, read: false, on_wish_list: false,
    issue_count: 4,
    locg_id: "114624", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/114624",
    title: "Generation Next",
    description: "Age of Apocalypse tie-in following Generation X in a darkly reimagined world under Apocalypse's rule. Chris Bachalo's art is some of the most distinctive of the era.",
  },
  {
    series: "Hallows' Eve", issue: null, year: 2023, publisher: "Marvel Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "162202", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/162202",
    title: "Hallows' Eve",
  },
  {
    series: "House of X / Powers of X", issue: null, year: 2019, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Jonathan Hickman", tags: ["Bluechip", "Excellent Read"],
    owned: true, read: true, on_wish_list: false,
    locg_id: "144149", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/144149",
    title: "House of X / Powers of X",
    description: "Jonathan Hickman's landmark reinvention of the X-Men. Two interlocking series that rewrote mutant history and launched the Krakoa era.",
  },
  {
    series: "Immoral X-Men", issue: null, year: 2023, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Kieron Gillen", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "162117", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/162117",
    title: "Immoral X-Men",
  },
  {
    series: "Immortal X-Men", issue: null, year: 2022, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Kieron Gillen", tags: ["Excellent Read", "Sleeper"],
    owned: true, read: true, on_wish_list: false,
    locg_id: "154830", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/154830",
    title: "Immortal X-Men",
  },
  {
    series: "Midnight Suns", issue: null, year: 2022, publisher: "Marvel Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "159063", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/159063",
    title: "Midnight Suns",
  },
  {
    series: "Moon Knight: Black, White & Blood", issue: null, year: 2022, publisher: "Marvel Comics",
    genre: "Superhero", tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "155565", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/155565",
    title: "Moon Knight: Black, White & Blood",
  },
  {
    series: "Patsy Walker, AKA Hellcat!", issue: null, year: 2015, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Kate Leth", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "120403", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/120403",
    title: "Patsy Walker, AKA Hellcat!",
  },
  {
    series: "Spider-Gwen: Gwenverse", issue: null, year: 2022, publisher: "Marvel Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "154544", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/154544",
    title: "Spider-Gwen: Gwenverse",
  },
  {
    series: "Spider-Gwen: Shadow Clones", issue: null, year: 2023, publisher: "Marvel Comics",
    genre: "Superhero", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "162762", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/162762",
    title: "Spider-Gwen: Shadow Clones",
  },
  {
    series: "Spider-Man: India", issue: null, year: 2023, publisher: "Marvel Comics",
    genre: "Superhero", tags: ["Bluechip", "Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "166100", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/166100",
    title: "Spider-Man: India",
  },
  {
    series: "Star Wars: Darth Maul – Black, White & Red", issue: null, year: 2024, publisher: "Marvel Comics",
    genre: "Science Fiction", tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "173529", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/173529",
    title: "Star Wars: Darth Maul – Black, White & Red",
  },
  {
    series: "Star Wars: Darth Vader – Black, White & Red", issue: null, year: 2023, publisher: "Marvel Comics",
    genre: "Science Fiction", tags: ["Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "163828", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/163828",
    title: "Star Wars: Darth Vader – Black, White & Red",
  },
  {
    series: "Star Wars: The Mandalorian", issue: null, year: 2022, publisher: "Marvel Comics",
    genre: "Science Fiction", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "156535", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/156535",
    title: "Star Wars: The Mandalorian",
  },
  {
    series: "Tomorrow Knights", issue: null, year: 1990, publisher: "Marvel Comics",
    genre: "Science Fiction", tags: ["Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "141487", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/141487",
    title: "Tomorrow Knights",
  },
  {
    series: "Ultimate Spider-Man", issue: null, year: 2024, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Jonathan Hickman", tags: ["Bluechip", "Excellent Read"],
    owned: true, read: true, on_wish_list: false,
    locg_id: "170890", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/170890",
    title: "Ultimate Spider-Man",
  },
  {
    series: "Weapon X", issue: null, year: 1995, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Larry Hama", tags: ["Sleeper", "Bluechip"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "114703", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/114703",
    title: "Weapon X",
  },
  {
    series: "Wild Cards", issue: null, year: 1990, publisher: "Marvel Comics",
    genre: "Superhero", tags: ["Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "142632", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/142632",
    title: "Wild Cards",
  },
  {
    series: "X-Man", issue: null, year: 1995, publisher: "Marvel Comics",
    genre: "Superhero", tags: ["Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "114684", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/114684",
    title: "X-Man",
  },
  {
    series: "X-Men", issue: null, year: 2019, publisher: "Marvel Comics",
    genre: "Superhero", writer: "Jonathan Hickman", tags: ["Excellent Read"],
    owned: true, read: true, on_wish_list: false,
    locg_id: "143658", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/143658",
    title: "X-Men (Hickman)",
  },

  // ── Image Comics ─────────────────────────────────────────────────────────
  {
    series: "BRZRKR", issue: null, year: 2021, publisher: "BOOM! Studios",
    genre: "Action", writer: "Keanu Reeves", tags: ["Bluechip"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "148143", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/148143",
    title: "BRZRKR",
  },
  {
    series: "Decorum", issue: null, year: 2020, publisher: "Image Comics",
    genre: "Science Fiction", writer: "Jonathan Hickman", artist: "Mike Huddleston",
    tags: ["Bluechip", "Sleeper"], owned: true, read: false, on_wish_list: false,
    locg_id: "145404", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/145404",
    title: "Decorum",
    description: "Jonathan Hickman and Mike Huddleston's gorgeous science fiction epic about a galactic assassin. Structurally and visually unlike anything else in comics.",
  },
  {
    series: "Edenwood", issue: null, year: 2023, publisher: "Image Comics",
    genre: "Fantasy", writer: "Tony S. Daniel", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "167294", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/167294",
    title: "Edenwood",
  },
  {
    series: "Injection", issue: null, year: 2015, publisher: "Image Comics",
    genre: "Science Fiction", writer: "Warren Ellis", artist: "Declan Shalvey",
    tags: ["Excellent Read", "Sleeper"], owned: true, read: true, on_wish_list: false,
    locg_id: "114396", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/114396",
    title: "Injection",
    description: "Warren Ellis and Declan Shalvey's weird fiction horror series about a group of specialists who infected the modern world with an artificial intelligence and must now deal with the consequences.",
  },
  {
    series: "King Spawn", issue: null, year: 2021, publisher: "Image Comics",
    genre: "Horror", tags: [], owned: true, read: false, on_wish_list: false,
    locg_id: "151629", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/151629",
    title: "King Spawn",
  },
  {
    series: "Napalm Lullaby", issue: null, year: 2024, publisher: "Image Comics",
    genre: "Science Fiction", writer: "Rick Remender", tags: ["Bluechip", "Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "171549", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/171549",
    title: "Napalm Lullaby",
  },
  {
    series: "Radiant Black", issue: null, year: 2021, publisher: "Image Comics",
    genre: "Superhero", writer: "Kyle Higgins", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "149704", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/149704",
    title: "Radiant Black",
  },
  {
    series: "Savage Dragon", issue: null, year: 1993, publisher: "Image Comics",
    genre: "Superhero", writer: "Erik Larsen", tags: ["Sleeper"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "106399", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/106399",
    title: "Savage Dragon",
  },
  {
    series: "Spawn", issue: null, year: 1992, publisher: "Image Comics",
    genre: "Horror", writer: "Todd McFarlane", tags: ["Bluechip"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "106822", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/106822",
    title: "Spawn",
  },
  {
    series: "StormWatch", issue: null, year: 1993, publisher: "Image Comics",
    genre: "Superhero", writer: "Warren Ellis", tags: ["Sleeper", "Bluechip"],
    owned: true, read: false, on_wish_list: false,
    locg_id: "148906", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/148906",
    title: "StormWatch",
  },
  {
    series: "SuperPatriot", issue: null, year: 1993, publisher: "Image Comics",
    genre: "Superhero", writer: "Erik Larsen", tags: [],
    owned: true, read: false, on_wish_list: false,
    locg_id: "112517", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/112517",
    title: "SuperPatriot",
  },

  // ── Archie Comics ─────────────────────────────────────────────────────────
  {
    series: "Sonic the Hedgehog", issue: null, year: 1993, publisher: "Archie Comics",
    genre: "Action", tags: [], owned: true, read: false, on_wish_list: false,
    issue_count: 3,
    locg_id: "106771", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/106771",
    title: "Sonic the Hedgehog",
  },

  // ── BOOM! Studios ─────────────────────────────────────────────────────────
  {
    series: "Once & Future", issue: null, year: 2019, publisher: "BOOM! Studios",
    genre: "Fantasy", writer: "Kieron Gillen", artist: "Dan Mora",
    tags: ["Excellent Read", "Bluechip"], owned: true, read: true, on_wish_list: false,
    locg_id: "142996", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/142996",
    title: "Once & Future",
    description: "A retired monster hunter and her grandson battle the return of King Arthur and the forces of Arthurian legend in modern Britain. Gillen at his mythology-remixing best.",
  },

  // ── Valiant ───────────────────────────────────────────────────────────────
  {
    series: "Eternal Warrior", issue: null, year: 1992, publisher: "Valiant",
    genre: "Action", tags: ["Sleeper", "Bluechip"], owned: true, read: false, on_wish_list: false,
    locg_id: "102767", locg_url: "https://leagueofcomicgeeks.com/profile/greywarden247/collection/102767",
    title: "Eternal Warrior",
  },
];

// ── Wish list items (separate from owned collection) ─────────────────────────
const wishList = [
  { title: "Saga", series: "Saga", publisher: "Image Comics", year: 2012, genre: "Science Fiction", writer: "Brian K. Vaughan", on_wish_list: true, owned: false, tags: ["Bluechip"] },
  { title: "Lazarus", series: "Lazarus", publisher: "Image Comics", year: 2013, genre: "Science Fiction", writer: "Greg Rucka", on_wish_list: true, owned: false, tags: ["Bluechip"] },
  { title: "Prophet", series: "Prophet", publisher: "Image Comics", year: 2012, genre: "Science Fiction", writer: "Brandon Graham", on_wish_list: true, owned: false, tags: ["Sleeper"] },
  { title: "East of West", series: "East of West", publisher: "Image Comics", year: 2013, genre: "Science Fiction", writer: "Jonathan Hickman", on_wish_list: true, owned: false, tags: ["Bluechip"] },
  { title: "Low", series: "Low", publisher: "Image Comics", year: 2014, genre: "Science Fiction", writer: "Rick Remender", on_wish_list: true, owned: false, tags: [] },
  { title: "Black Science", series: "Black Science", publisher: "Image Comics", year: 2013, genre: "Science Fiction", writer: "Rick Remender", on_wish_list: true, owned: false, tags: ["Bluechip"] },
  { title: "Sex Criminals", series: "Sex Criminals", publisher: "Image Comics", year: 2013, genre: "Comedy", writer: "Matt Fraction", on_wish_list: true, owned: false, tags: [] },
  { title: "The Walking Dead", series: "The Walking Dead", publisher: "Image Comics", year: 2003, genre: "Horror", writer: "Robert Kirkman", on_wish_list: true, owned: false, tags: ["Bluechip"] },
  { title: "Planetary", series: "Planetary", publisher: "DC Comics / Wildstorm", year: 1999, genre: "Science Fiction", writer: "Warren Ellis", on_wish_list: true, owned: false, tags: ["Bluechip", "Sleeper"] },
  { title: "The Authority", series: "The Authority", publisher: "DC Comics / Wildstorm", year: 1999, genre: "Superhero", writer: "Warren Ellis", on_wish_list: true, owned: false, tags: ["Bluechip"] },
  { title: "Seven Soldiers of Victory", series: "Seven Soldiers of Victory", publisher: "DC Comics", year: 2005, genre: "Superhero", writer: "Grant Morrison", on_wish_list: true, owned: false, tags: ["Sleeper"] },
  { title: "Flex Mentallo", series: "Flex Mentallo", publisher: "DC Comics / Vertigo", year: 1996, genre: "Superhero", writer: "Grant Morrison", on_wish_list: true, owned: false, tags: ["Bluechip", "Sleeper"] },
];

async function setup() {
  console.log("🔌 Connecting to Elasticsearch...");
  try {
    const info = await es.info();
    console.log(`✅ Connected! ES version: ${info.body?.version?.number || info.version?.number || 'unknown'}`);
  } catch (err) {
    console.error("❌ Cannot connect:", err.message);
    process.exit(1);
  }

    const exists = await es.indices.exists({ index: INDEX });
    if (exists.body) {
        console.log(`🗑️  Deleting existing '${INDEX}' index...`);
        await es.indices.delete({ index: INDEX });
    }

  console.log(`📦 Creating '${INDEX}' index with mapping...`);
  await es.indices.create({ index: INDEX, body: mapping });

  const allDocs = [...collection, ...wishList].map(doc => ({
    ...doc,
    createdAt: new Date().toISOString(),
    gifted_to: doc.gifted_to || [],
    gifted_by: doc.gifted_by || null,
  }));

  console.log(`📚 Indexing ${allDocs.length} documents (${collection.length} owned + ${wishList.length} wish list)...`);

  //const operations = allDocs.flatMap(doc => [{ index: { _index: INDEX } }, doc]);
  //const result = await es.bulk({ refresh: true, body: operations });
  
  //if (result.errors) {
  //  const errors = result.items.filter(i => i.index?.error);
  //  console.error("❌ Errors:", errors.slice(0, 3));
  //} else {
  //  console.log(`✅ Indexed ${allDocs.length} documents.`);
  //}

  const count = await es.count({ index: INDEX });
  console.log(`\n🎉 Index ready with ${count.body.count} documents.`);
}

setup().catch(console.error);
