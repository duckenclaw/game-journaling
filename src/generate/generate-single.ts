import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { toSlug } from "../sync/wiki-link.js";
import { syncAll } from "../sync/sync-engine.js";
import {
  searchGame,
  fetchGenres,
  fetchGameModes,
  fetchPlayerPerspectives,
  fetchKeywords,
  fetchThemes,
  fetchGameEngines,
  fetchInvolvedCompanies,
  fetchCompanies,
} from "../igdb/client.js";
import type {
  IgdbGame,
  IgdbInvolvedCompany,
  ResolvedGameData,
} from "../igdb/types.js";
import {
  writeGameMarkdown,
  writeStudioMarkdown,
  writePublisherMarkdown,
} from "./markdown-writer.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "data/game-journaling.db";
const CSV_PATH = path.resolve("lib/games.csv");

/**
 * Generate markdown for a single game.
 * Adds to CSV if not present. Always overwrites the game .md file.
 */
export async function generateSingle(gameName: string): Promise<void> {
  if (!gameName || gameName.trim() === "") {
    console.error("Error: Please provide a game name.");
    console.log('Usage: npm run generate:single "Game Name"');
    process.exit(1);
  }

  const slug = toSlug(gameName.trim());
  console.log(`=== Generate Single: ${gameName} ===\n`);
  console.log(`  Slug: ${slug}`);

  // ── Step 1: Check/update CSV ──────────────────
  ensureInCsv(gameName.trim(), slug);

  // ── Step 2: Search IGDB ───────────────────────
  console.log("\n  Searching IGDB...");
  const igdbGame = await searchGame(gameName.trim());

  if (!igdbGame) {
    console.log(`  [warn] "${gameName}" not found on IGDB. Writing empty template.`);

    // Read CSV to get status/platform
    const csvData = readCsvEntry(slug);

    writeGameMarkdown(slug, {
      igdbId: 0,
      name: gameName.trim(),
      genres: [],
      gameModes: [],
      playerPerspectives: [],
      keywords: [],
      themes: [],
      engine: null,
      developers: [],
      publishers: [],
      summary: null,
      storyline: null,
      releaseDate: null,
    }, {
      status: csvData?.status ?? "not started",
      platform: csvData?.platform ?? "PC",
    });

    console.log(`\n  Wrote: lib/games/${slug}.md (empty template)`);
    syncAndReport();
    return;
  }

  console.log(`  Found: "${igdbGame.name}" (IGDB ID: ${igdbGame.id})`);

  // ── Step 3: Fetch all related entities ────────
  console.log("  Fetching entity details...");

  const [genres, gameModes, perspectives, keywords, themes, engines, involvedCompanies] =
    await Promise.all([
      fetchGenres(igdbGame.genres ?? []),
      fetchGameModes(igdbGame.game_modes ?? []),
      fetchPlayerPerspectives(igdbGame.player_perspectives ?? []),
      fetchKeywords(igdbGame.keywords ?? []),
      fetchThemes(igdbGame.themes ?? []),
      fetchGameEngines(igdbGame.game_engines ?? []),
      fetchInvolvedCompanies(igdbGame.involved_companies ?? []),
    ]);

  // Fetch company names
  const companyIds = involvedCompanies.map((ic) => ic.company);
  const companies = await fetchCompanies(companyIds);

  // Build lookup maps
  const genreMap = new Map(genres.map((g) => [g.id, g.name]));
  const gameModeMap = new Map(gameModes.map((m) => [m.id, m.name]));
  const perspectiveMap = new Map(perspectives.map((p) => [p.id, p.name]));
  const keywordMap = new Map(keywords.map((k) => [k.id, k.name]));
  const themeMap = new Map(themes.map((t) => [t.id, t.name]));
  const engineMap = new Map(engines.map((e) => [e.id, e.name]));
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const involvedCompanyMap = new Map(involvedCompanies.map((ic) => [ic.id, ic]));

  // ── Step 4: Resolve and write files ───────────
  const resolved = resolveGameData(
    igdbGame,
    genreMap,
    gameModeMap,
    perspectiveMap,
    keywordMap,
    themeMap,
    engineMap,
    companyMap,
    involvedCompanyMap,
  );

  // Read CSV to get status/platform
  const csvData = readCsvEntry(slug);

  writeGameMarkdown(slug, resolved, {
    status: csvData?.status ?? "not started",
    platform: csvData?.platform ?? "PC",
  });
  console.log(`\n  Wrote: lib/games/${slug}.md`);

  // Write studio files
  for (const devName of resolved.developers) {
    const devSlug = toSlug(devName);
    writeStudioMarkdown(devSlug, [slug]);
    console.log(`  Wrote: lib/studios/${devSlug}.md`);
  }

  // Write publisher files
  const devSlugs = resolved.developers.map(toSlug);
  for (const pubName of resolved.publishers) {
    const pubSlug = toSlug(pubName);
    writePublisherMarkdown(pubSlug, [slug], devSlugs);
    console.log(`  Wrote: lib/publishers/${pubSlug}.md`);
  }

  // ── Step 5: Sync DB ───────────────────────────
  syncAndReport();
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function syncAndReport(): void {
  console.log("\n  Syncing database...");
  const report = syncAll(DATABASE_URL);
  console.log(`  DB: ${report.created} created, ${report.updated} updated\n`);
}

/**
 * Ensure the game is present in games.csv.
 * If not, appends a new row with "not started" status and "PC" platform.
 */
function ensureInCsv(gameName: string, slug: string): void {
  if (!fs.existsSync(CSV_PATH)) {
    console.log("  [warn] games.csv not found, creating...");
    fs.writeFileSync(CSV_PATH, "name,status,platform,notes\n", "utf-8");
  }

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim() !== "");

  // Check if game already exists (case-insensitive name match)
  const nameLC = gameName.toLowerCase();
  const exists = lines.some((line, idx) => {
    if (idx === 0) return false; // skip header
    const firstName = line.split(",")[0]?.trim().toLowerCase();
    return firstName === nameLC;
  });

  if (exists) {
    console.log("  Already in CSV");
  } else {
    // Append new row
    const newLine = `${gameName},not started,PC,`;
    const csvContent = raw.endsWith("\n") ? raw + newLine + "\n" : raw + "\n" + newLine + "\n";
    fs.writeFileSync(CSV_PATH, csvContent, "utf-8");
    console.log("  Added to CSV (status: not started, platform: PC)");
  }
}

/**
 * Read a game's CSV entry by slug to get status/platform.
 */
function readCsvEntry(slug: string): { status: string | null; platform: string | null } | null {
  try {
    const raw = fs.readFileSync(CSV_PATH, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim());
      const name = parts[0] ?? "";
      if (toSlug(name) === slug) {
        return {
          status: normalizeStatus(parts[1] ?? null),
          platform: parts[2] || "PC",
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeStatus(val: string | null): string | null {
  if (!val) return null;
  const n = val.trim().toLowerCase();
  if (n === "finished") return "finished";
  if (n === "started") return "started";
  if (n === "bought") return "bought";
  if (n.startsWith("not start")) return "not started";
  if (n === "not finished") return "started";
  return null;
}

function resolveGameData(
  igdbGame: IgdbGame,
  genreMap: Map<number, string>,
  gameModeMap: Map<number, string>,
  perspectiveMap: Map<number, string>,
  keywordMap: Map<number, string>,
  themeMap: Map<number, string>,
  engineMap: Map<number, string>,
  companyMap: Map<number, string>,
  involvedCompanyMap: Map<number, IgdbInvolvedCompany>,
): ResolvedGameData {
  const developers: string[] = [];
  const publishers: string[] = [];

  for (const icId of igdbGame.involved_companies ?? []) {
    const ic = involvedCompanyMap.get(icId);
    if (!ic) continue;
    const companyName = companyMap.get(ic.company);
    if (!companyName) continue;

    if (ic.developer) developers.push(companyName);
    if (ic.publisher) publishers.push(companyName);
  }

  let releaseDate: string | null = null;
  if (igdbGame.first_release_date) {
    const d = new Date(igdbGame.first_release_date * 1000);
    releaseDate = d.toISOString().split("T")[0];
  }

  const resolveNames = (ids: number[] | undefined, map: Map<number, string>) =>
    ids?.map((id) => map.get(id)).filter((n): n is string => n != null) ?? [];

  return {
    igdbId: igdbGame.id,
    name: igdbGame.name,
    genres: resolveNames(igdbGame.genres, genreMap),
    gameModes: resolveNames(igdbGame.game_modes, gameModeMap),
    playerPerspectives: resolveNames(igdbGame.player_perspectives, perspectiveMap),
    keywords: resolveNames(igdbGame.keywords, keywordMap),
    themes: resolveNames(igdbGame.themes, themeMap),
    engine: igdbGame.game_engines?.length
      ? (engineMap.get(igdbGame.game_engines[0]) ?? null)
      : null,
    developers,
    publishers,
    summary: igdbGame.summary ?? null,
    storyline: igdbGame.storyline ?? null,
    releaseDate,
  };
}
