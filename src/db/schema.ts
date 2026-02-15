import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ──────────────────────────────────────────────
// Entity tables
// ──────────────────────────────────────────────

export const games = sqliteTable(
  "games",
  {
    slug: text("slug").primaryKey(), // filename stem, e.g. "Atomic-Heart"

    // Frontmatter scalars
    status: text("status"), // "finished" | "started" | "bought" | "not started"
    platform: text("platform"),
    engine: text("engine"),
    release: text("release"), // YYYY-MM-DD
    director: text("director"), // designer slug, e.g. "Robert-Bagratuni"

    // Frontmatter arrays (stored as JSON text)
    gameGenre: text("game_genre", { mode: "json" }).$type<string[]>(),
    gameModes: text("game_modes", { mode: "json" }).$type<string[]>(),
    gameGenreTags: text("game_genre_tags", { mode: "json" }).$type<string[]>(),
    playerPerspective: text("player_perspective", { mode: "json" }).$type<string[]>(),

    // Content sections
    gameplayText: text("gameplay_text"),
    synopsisText: text("synopsis_text"),
    reviewText: text("review_text"),
    notesText: text("notes_text"),

    // Sync metadata
    sourceFile: text("source_file").notNull(),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("games_status_idx").on(table.status),
    index("games_platform_idx").on(table.platform),
    index("games_release_idx").on(table.release),
  ],
);

export const studios = sqliteTable("studios", {
  slug: text("slug").primaryKey(),
  director: text("director"), // designer slug

  overviewText: text("overview_text"),

  sourceFile: text("source_file").notNull(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const publishers = sqliteTable("publishers", {
  slug: text("slug").primaryKey(),

  overviewText: text("overview_text"),

  sourceFile: text("source_file").notNull(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const designers = sqliteTable("designers", {
  slug: text("slug").primaryKey(),

  overviewText: text("overview_text"),

  sourceFile: text("source_file").notNull(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ──────────────────────────────────────────────
// Junction tables (many-to-many relationships)
// ──────────────────────────────────────────────

/** game <-> studio (from game.developer AND studio.games) */
export const gameDevelopers = sqliteTable(
  "game_developers",
  {
    gameSlug: text("game_slug").notNull(),
    studioSlug: text("studio_slug").notNull(),
  },
  (table) => [primaryKey({ columns: [table.gameSlug, table.studioSlug] })],
);

/** game <-> publisher (from game.publisher AND publisher.games) */
export const gamePublishers = sqliteTable(
  "game_publishers",
  {
    gameSlug: text("game_slug").notNull(),
    publisherSlug: text("publisher_slug").notNull(),
  },
  (table) => [primaryKey({ columns: [table.gameSlug, table.publisherSlug] })],
);

/** publisher <-> studio (from publisher.studios) */
export const publisherStudios = sqliteTable(
  "publisher_studios",
  {
    publisherSlug: text("publisher_slug").notNull(),
    studioSlug: text("studio_slug").notNull(),
  },
  (table) => [primaryKey({ columns: [table.publisherSlug, table.studioSlug] })],
);

/** studio <-> studio (from studio.studios — subsidiaries/related) */
export const relatedStudios = sqliteTable(
  "related_studios",
  {
    studioSlug: text("studio_slug").notNull(),
    relatedStudioSlug: text("related_studio_slug").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studioSlug, table.relatedStudioSlug] })],
);
