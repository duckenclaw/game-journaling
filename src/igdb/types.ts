// ──────────────────────────────────────────────
// IGDB API response types
// https://api-docs.igdb.com/
// ──────────────────────────────────────────────

export interface IgdbGame {
  id: number;
  name: string;
  genres?: number[];
  game_modes?: number[];
  player_perspectives?: number[];
  keywords?: number[];
  themes?: number[];
  game_engines?: number[];
  involved_companies?: number[];
  summary?: string;
  storyline?: string;
  /** Unix timestamp (seconds) */
  first_release_date?: number;
  /** Game type: 0 main game, 1 DLC, 2 expansion, 3 bundle, 13 pack, etc. */
  game_type?: number;
}

export interface IgdbInvolvedCompany {
  id: number;
  company: number;
  developer: boolean;
  publisher: boolean;
}

export interface IgdbCompany {
  id: number;
  name: string;
}

export interface IgdbGenre {
  id: number;
  name: string;
}

export interface IgdbGameMode {
  id: number;
  name: string;
}

export interface IgdbPlayerPerspective {
  id: number;
  name: string;
}

export interface IgdbKeyword {
  id: number;
  name: string;
}

export interface IgdbTheme {
  id: number;
  name: string;
}

export interface IgdbGameEngine {
  id: number;
  name: string;
}

// ──────────────────────────────────────────────
// Resolved game data (after entity ID lookups)
// ──────────────────────────────────────────────

export interface ResolvedGameData {
  igdbId: number;
  name: string;
  genres: string[];
  gameModes: string[];
  playerPerspectives: string[];
  keywords: string[];
  themes: string[];
  engine: string | null;
  developers: string[];   // company names
  publishers: string[];   // company names
  summary: string | null;
  storyline: string | null;
  releaseDate: string | null; // "YYYY-MM-DD"
}
