import { getAccessToken } from "./token-manager.js";
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
} from "./types.js";

const IGDB_BASE_URL = "https://api.igdb.com/v4";
const RATE_LIMIT_MS = 260; // ~3.8 req/sec (IGDB limit is 4/sec)
const BATCH_SIZE = 500; // IGDB max IDs per query

let lastRequestTime = 0;

// ──────────────────────────────────────────────
// Core query function
// ──────────────────────────────────────────────

/**
 * Execute an IGDB Apicalypse query.
 * Handles rate limiting and authentication automatically.
 */
async function query<T>(endpoint: string, body: string): Promise<T[]> {
  // Rate limiting
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }

  const token = await getAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID;

  if (!clientId) {
    throw new Error("Missing TWITCH_CLIENT_ID in .env");
  }

  lastRequestTime = Date.now();

  const res = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IGDB ${endpoint} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitize a name to remove problematic characters for YAML.
 * Removes quotes and other special characters that cause YAML parsing issues.
 */
function sanitizeName(name: string): string {
  return name
    .replace(/["'`]/g, "")  // remove quotes
    .replace(/[.]/g, "")    // remove periods
    .trim();
}

// ──────────────────────────────────────────────
// Game search
// ──────────────────────────────────────────────

const GAME_FIELDS = [
  "name",
  "genres",
  "game_modes",
  "player_perspectives",
  "keywords",
  "themes",
  "game_engines",
  "involved_companies",
  "summary",
  "storyline",
  "first_release_date",
  "game_type",
].join(",");

/**
 * Search for games by name. Returns up to `limit` matches, best first.
 */
export async function searchGames(
  name: string,
  limit = 10,
): Promise<IgdbGame[]> {
  // Escape double quotes in game name
  const escaped = name.replace(/"/g, '\\"');
  return query<IgdbGame>(
    "games",
    `search "${escaped}"; fields ${GAME_FIELDS}; limit ${limit};`,
  );
}

/**
 * Search for a game by name. Returns the best match or null.
 */
export async function searchGame(
  name: string,
): Promise<IgdbGame | null> {
  const results = await searchGames(name, 1);
  return results[0] ?? null;
}

// ──────────────────────────────────────────────
// Batch entity fetchers
// ──────────────────────────────────────────────

/**
 * Helper to batch-fetch entities by ID array.
 * Splits into chunks of BATCH_SIZE if needed.
 * Sanitizes name fields to remove problematic characters.
 */
async function batchFetchById<T extends { name: string }>(
  endpoint: string,
  ids: number[],
  fields: string = "name",
): Promise<T[]> {
  if (ids.length === 0) return [];

  const unique = [...new Set(ids)];
  const results: T[] = [];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const idList = chunk.join(",");
    const items = await query<T>(
      endpoint,
      `fields ${fields}; where id = (${idList}); limit ${chunk.length};`,
    );
    // Sanitize names in the results
    results.push(...items.map(item => ({ ...item, name: sanitizeName(item.name) })));
  }

  return results;
}

export async function fetchGenres(ids: number[]): Promise<IgdbGenre[]> {
  return batchFetchById<IgdbGenre>("genres", ids);
}

export async function fetchGameModes(ids: number[]): Promise<IgdbGameMode[]> {
  return batchFetchById<IgdbGameMode>("game_modes", ids);
}

export async function fetchPlayerPerspectives(
  ids: number[],
): Promise<IgdbPlayerPerspective[]> {
  return batchFetchById<IgdbPlayerPerspective>("player_perspectives", ids);
}

export async function fetchKeywords(ids: number[]): Promise<IgdbKeyword[]> {
  return batchFetchById<IgdbKeyword>("keywords", ids);
}

export async function fetchThemes(ids: number[]): Promise<IgdbTheme[]> {
  return batchFetchById<IgdbTheme>("themes", ids);
}

export async function fetchGameEngines(
  ids: number[],
): Promise<IgdbGameEngine[]> {
  return batchFetchById<IgdbGameEngine>("game_engines", ids);
}

export async function fetchCompanies(ids: number[]): Promise<IgdbCompany[]> {
  return batchFetchById<IgdbCompany>("companies", ids);
}

export async function fetchInvolvedCompanies(
  ids: number[],
): Promise<IgdbInvolvedCompany[]> {
  // IgdbInvolvedCompany doesn't have a name field, so we can't use the generic helper
  if (ids.length === 0) return [];

  const unique = [...new Set(ids)];
  const results: IgdbInvolvedCompany[] = [];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const idList = chunk.join(",");
    const items = await query<IgdbInvolvedCompany>(
      "involved_companies",
      `fields company,developer,publisher; where id = (${idList}); limit ${chunk.length};`,
    );
    results.push(...items);
  }

  return results;
}
