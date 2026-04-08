import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parseCsvFile } from "../sync/csv-parser.js";
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
  IgdbCompany,
  IgdbGenre,
  IgdbGameMode,
  IgdbPlayerPerspective,
  IgdbKeyword,
  IgdbTheme,
  IgdbGameEngine,
  ResolvedGameData,
} from "../igdb/types.js";
import {
  writeGameMarkdown,
  writeStudioMarkdown,
  writePublisherMarkdown,
} from "./markdown-writer.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "data/game-journaling.db";
const MIN_FILE_SIZE = 50; // bytes — files smaller than this are considered stubs

interface SearchResult {
  slug: string;
  name: string;
  status: string | null;
  platform: string | null;
  igdbGame: IgdbGame;
}

/**
 * Generate markdown files for all games in games.csv.
 * Skips games that already have populated markdown files.
 */
export async function generateAll(): Promise<void> {
  console.log("=== Generate All ===\n");

  // ── Phase 1: Parse CSV ────────────────────────
  const csvGames = parseCsvFile("lib/games.csv");
  console.log(`Found ${csvGames.length} games in CSV\n`);

  // ── Phase 2: Filter — skip existing populated files ──
  const gamesToProcess = csvGames.filter(({ slug }) => {
    const filePath = path.resolve("lib/games", `${slug}.md`);
    if (!fs.existsSync(filePath)) return true;
    const stat = fs.statSync(filePath);
    return stat.size < MIN_FILE_SIZE;
  });

  console.log(
    `${csvGames.length - gamesToProcess.length} games already have files, ` +
      `${gamesToProcess.length} to generate\n`,
  );

  if (gamesToProcess.length === 0) {
    console.log("Nothing to generate. All games already have files.");
    return;
  }

  // ── Phase 3: Search IGDB ──────────────────────
  console.log("Searching IGDB for game data...\n");

  const searchResults: SearchResult[] = [];
  let notFound = 0;

  for (let i = 0; i < gamesToProcess.length; i++) {
    const { slug, row } = gamesToProcess[i];
    const name = slug.replace(/-/g, " "); // Convert slug back to search name

    if ((i + 1) % 10 === 0 || i === 0) {
      console.log(`  [${i + 1}/${gamesToProcess.length}] Searching...`);
    }

    try {
      const igdbGame = await searchGame(name);
      if (igdbGame) {
        searchResults.push({
          slug,
          name,
          status: row.status,
          platform: row.platform,
          igdbGame,
        });
      } else {
        notFound++;
      }
    } catch (err) {
      console.warn(`  [warn] Failed to search "${name}": ${err}`);
    }
  }

  console.log(
    `\nIGDB search complete: ${searchResults.length} found, ${notFound} not found\n`,
  );

  // ── Phase 4: Batch fetch entities ─────────────
  console.log("Fetching entity details from IGDB...\n");

  // Collect all unique IDs across all search results
  const allGenreIds = new Set<number>();
  const allGameModeIds = new Set<number>();
  const allPerspectiveIds = new Set<number>();
  const allKeywordIds = new Set<number>();
  const allThemeIds = new Set<number>();
  const allEngineIds = new Set<number>();
  const allInvolvedCompanyIds = new Set<number>();

  for (const { igdbGame } of searchResults) {
    igdbGame.genres?.forEach((id) => allGenreIds.add(id));
    igdbGame.game_modes?.forEach((id) => allGameModeIds.add(id));
    igdbGame.player_perspectives?.forEach((id) => allPerspectiveIds.add(id));
    igdbGame.keywords?.forEach((id) => allKeywordIds.add(id));
    igdbGame.themes?.forEach((id) => allThemeIds.add(id));
    igdbGame.game_engines?.forEach((id) => allEngineIds.add(id));
    igdbGame.involved_companies?.forEach((id) => allInvolvedCompanyIds.add(id));
  }

  // Batch fetch each entity type
  const [genres, gameModes, perspectives, keywords, themes, engines, involvedCompanies] =
    await Promise.all([
      fetchGenres([...allGenreIds]),
      fetchGameModes([...allGameModeIds]),
      fetchPlayerPerspectives([...allPerspectiveIds]),
      fetchKeywords([...allKeywordIds]),
      fetchThemes([...allThemeIds]),
      fetchGameEngines([...allEngineIds]),
      fetchInvolvedCompanies([...allInvolvedCompanyIds]),
    ]);

  // Fetch actual company names from involved_companies
  const allCompanyIds = new Set<number>();
  for (const ic of involvedCompanies) {
    allCompanyIds.add(ic.company);
  }
  const companies = await fetchCompanies([...allCompanyIds]);

  // Build lookup maps
  const genreMap = buildLookup(genres);
  const gameModeMap = buildLookup(gameModes);
  const perspectiveMap = buildLookup(perspectives);
  const keywordMap = buildLookup(keywords);
  const themeMap = buildLookup(themes);
  const engineMap = buildLookup(engines);
  const companyMap = buildLookup(companies);
  const involvedCompanyMap = new Map(involvedCompanies.map((ic) => [ic.id, ic]));

  console.log(
    `  Genres: ${genres.length}, Modes: ${gameModes.length}, ` +
      `Perspectives: ${perspectives.length}, Keywords: ${keywords.length}, ` +
      `Themes: ${themes.length}, Engines: ${engines.length}, Companies: ${companies.length}\n`,
  );

  // ── Phase 5: Resolve & write markdown files ───
  console.log("Writing markdown files...\n");

  // Track studio/publisher → game relationships for accumulation
  const studioGames = new Map<string, Set<string>>();
  const publisherGames = new Map<string, Set<string>>();
  const publisherStudios = new Map<string, Set<string>>();

  let gamesWritten = 0;

  for (const { slug, status, platform, igdbGame } of searchResults) {
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

    // Write game file
    writeGameMarkdown(slug, resolved, { status, platform });
    gamesWritten++;

    // Track developer relationships
    for (const devName of resolved.developers) {
      const devSlug = toSlug(devName);
      if (!studioGames.has(devSlug)) studioGames.set(devSlug, new Set());
      studioGames.get(devSlug)!.add(slug);
    }

    // Track publisher relationships
    for (const pubName of resolved.publishers) {
      const pubSlug = toSlug(pubName);
      if (!publisherGames.has(pubSlug)) publisherGames.set(pubSlug, new Set());
      publisherGames.get(pubSlug)!.add(slug);

      // Also track which studios this publisher is associated with
      for (const devName of resolved.developers) {
        const devSlug = toSlug(devName);
        if (!publisherStudios.has(pubSlug)) publisherStudios.set(pubSlug, new Set());
        publisherStudios.get(pubSlug)!.add(devSlug);
      }
    }
  }

  // Write studio files (accumulative)
  for (const [studioSlug, gameSlugs] of studioGames) {
    writeStudioMarkdown(studioSlug, [...gameSlugs]);
  }

  // Write publisher files (accumulative)
  for (const [pubSlug, gameSlugs] of publisherGames) {
    const studios = publisherStudios.get(pubSlug) ?? new Set();
    writePublisherMarkdown(pubSlug, [...gameSlugs], [...studios]);
  }

  console.log(
    `  Games: ${gamesWritten}, Studios: ${studioGames.size}, ` +
      `Publishers: ${publisherGames.size}\n`,
  );

  // ── Phase 6: Sync to database ─────────────────
  console.log("Syncing to database...\n");
  const report = syncAll(DATABASE_URL);

  console.log("\n=== Generation Complete ===\n");
  console.log(`  Games written:    ${gamesWritten}`);
  console.log(`  Studios written:  ${studioGames.size}`);
  console.log(`  Publishers written: ${publisherGames.size}`);
  console.log(`  IGDB not found:   ${notFound}`);
  console.log(`  DB created:       ${report.created}`);
  console.log(`  DB updated:       ${report.updated}`);

  if (report.errors.length > 0) {
    console.log(`\n  Errors (${report.errors.length}):`);
    for (const err of report.errors) {
      console.log(`    ${err}`);
    }
  }

  console.log();
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

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
  // Resolve involved companies into developer/publisher names
  // Use Sets to avoid duplicates (same company can appear multiple times)
  const developerSet = new Set<string>();
  const publisherSet = new Set<string>();

  for (const icId of igdbGame.involved_companies ?? []) {
    const ic = involvedCompanyMap.get(icId);
    if (!ic) continue;
    const companyName = companyMap.get(ic.company);
    if (!companyName) continue;

    if (ic.developer) developerSet.add(companyName);
    if (ic.publisher) publisherSet.add(companyName);
  }

  const developers = [...developerSet];
  const publishers = [...publisherSet];

  // Format release date from unix timestamp
  let releaseDate: string | null = null;
  if (igdbGame.first_release_date) {
    const d = new Date(igdbGame.first_release_date * 1000);
    releaseDate = d.toISOString().split("T")[0];
  }

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

function resolveNames(
  ids: number[] | undefined,
  lookup: Map<number, string>,
): string[] {
  if (!ids) return [];
  return ids.map((id) => lookup.get(id)).filter((n): n is string => n != null);
}

function buildLookup(
  items: { id: number; name: string }[],
): Map<number, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}
