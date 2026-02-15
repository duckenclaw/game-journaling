import { globSync } from "glob";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import * as relations from "../db/relations.js";
import { parseMarkdownFile } from "./parser.js";
import { parseCsvFile } from "./csv-parser.js";
import { slugFromPath } from "./wiki-link.js";
import {
  gameFrontmatterSchema,
  studioFrontmatterSchema,
  publisherFrontmatterSchema,
  designerFrontmatterSchema,
  type GameFrontmatter,
  type StudioFrontmatter,
  type PublisherFrontmatter,
} from "./validators.js";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface Change {
  entity: string;
  entityType: "game" | "studio" | "publisher" | "designer";
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface SyncReport {
  gamesProcessed: number;
  studiosProcessed: number;
  publishersProcessed: number;
  designersProcessed: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: string[];
  changes: Change[];
}

// ──────────────────────────────────────────────
// Sync engine
// ──────────────────────────────────────────────

export function syncAll(databaseUrl: string): SyncReport {
  const sqlite = new Database(databaseUrl);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle({
    client: sqlite,
    schema: { ...schema, ...relations },
  });

  const report: SyncReport = {
    gamesProcessed: 0,
    studiosProcessed: 0,
    publishersProcessed: 0,
    designersProcessed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    changes: [],
  };

  // Track all referenced slugs to create stubs for missing entities
  const referencedStudios = new Set<string>();
  const referencedPublishers = new Set<string>();
  const referencedDesigners = new Set<string>();

  // ── Phase 1: Discover files ─────────────────

  const gameFiles = globSync("lib/games/*.md");
  const studioFiles = globSync("lib/studios/*.md");
  const publisherFiles = globSync("lib/publishers/*.md");
  const designerFiles = globSync("lib/designers/*.md");

  console.log(
    `Found: ${gameFiles.length} games, ${studioFiles.length} studios, ` +
      `${publisherFiles.length} publishers, ${designerFiles.length} designers`,
  );

  // Parse CSV for games that may not have markdown files
  let csvGames: ReturnType<typeof parseCsvFile> = [];
  try {
    csvGames = parseCsvFile("lib/games.csv");
    console.log(`Parsed ${csvGames.length} games from CSV`);
  } catch (err) {
    report.errors.push(`CSV parse error: ${err}`);
  }

  // ── Phase 2-5: All within a transaction ─────

  const transact = sqlite.transaction(() => {
    // ── Sync game markdown files ──────────────

    for (const filePath of gameFiles) {
      try {
        const slug = slugFromPath(filePath);
        const parsed = parseMarkdownFile(filePath);
        const result = gameFrontmatterSchema.safeParse(parsed.frontmatter);

        if (!result.success) {
          // Try treating it as a stub file (empty or minimal frontmatter)
          syncStubGame(db, slug, filePath, report);
          continue;
        }

        const fm = result.data;

        // Track references
        fm.developer.forEach((s) => referencedStudios.add(s));
        fm.publisher.forEach((p) => referencedPublishers.add(p));
        if (fm.director) referencedDesigners.add(fm.director);

        // Check for existing record
        const existing = db.select().from(schema.games).where(eq(schema.games.slug, slug)).get();

        const gameRow = {
          slug,
          status: fm.status,
          platform: fm.platform,
          engine: fm.engine,
          release: fm.release,
          director: fm.director ?? null,
          gameGenre: fm["game-genre"],
          gameModes: fm["game-modes"],
          gameGenreTags: fm["game-genre-tags"],
          playerPerspective: fm["player-perspective"],
          gameplayText: parsed.sections.gameplay ?? null,
          synopsisText: parsed.sections.synopsis ?? null,
          reviewText: parsed.sections.review ?? null,
          notesText: parsed.sections.notes ?? null,
          sourceFile: filePath,
          lastSyncedAt: new Date(),
        };

        if (existing) {
          const changesBefore = report.changes.length;
          detectChanges(report, slug, "game", existing, gameRow);
          if (report.changes.length > changesBefore) {
            db.update(schema.games).set(gameRow).where(eq(schema.games.slug, slug)).run();
            report.updated++;
          } else {
            report.unchanged++;
          }
        } else {
          db.insert(schema.games).values(gameRow).run();
          report.created++;
        }

        // Upsert junction rows: delete old, insert new
        db.delete(schema.gameDevelopers).where(eq(schema.gameDevelopers.gameSlug, slug)).run();
        for (const studioSlug of fm.developer) {
          db.insert(schema.gameDevelopers).values({ gameSlug: slug, studioSlug }).run();
        }

        db.delete(schema.gamePublishers).where(eq(schema.gamePublishers.gameSlug, slug)).run();
        for (const publisherSlug of fm.publisher) {
          db.insert(schema.gamePublishers).values({ gameSlug: slug, publisherSlug }).run();
        }

        report.gamesProcessed++;
      } catch (err) {
        report.errors.push(`Error syncing game ${filePath}: ${err}`);
      }
    }

    // ── Sync CSV games (create stubs for games without .md files) ──

    for (const { slug, row } of csvGames) {
      const existing = db.select().from(schema.games).where(eq(schema.games.slug, slug)).get();
      if (existing) continue; // markdown file already synced this game

      const gameRow = {
        slug,
        status: row.status,
        platform: row.platform,
        engine: null,
        release: null,
        director: null,
        gameGenre: null,
        gameModes: null,
        gameGenreTags: null,
        playerPerspective: null,
        gameplayText: null,
        synopsisText: null,
        reviewText: null,
        notesText: null,
        sourceFile: "lib/games.csv",
        lastSyncedAt: new Date(),
      };

      db.insert(schema.games).values(gameRow).run();
      report.created++;
      report.gamesProcessed++;
    }

    // ── Sync studios ──────────────────────────

    for (const filePath of studioFiles) {
      try {
        const slug = slugFromPath(filePath);
        const parsed = parseMarkdownFile(filePath);
        const result = studioFrontmatterSchema.safeParse(parsed.frontmatter);

        let fm: StudioFrontmatter | null = null;
        if (result.success) {
          fm = result.data;
          if (fm.director) referencedDesigners.add(fm.director);
        }

        const studioRow = {
          slug,
          director: fm?.director ?? null,
          overviewText: parsed.sections.overview ?? null,
          sourceFile: filePath,
          lastSyncedAt: new Date(),
        };

        const existing = db.select().from(schema.studios).where(eq(schema.studios.slug, slug)).get();
        if (existing) {
          const changesBefore = report.changes.length;
          detectChanges(report, slug, "studio", existing, studioRow);
          if (report.changes.length > changesBefore) {
            db.update(schema.studios).set(studioRow).where(eq(schema.studios.slug, slug)).run();
            report.updated++;
          } else {
            report.unchanged++;
          }
        } else {
          db.insert(schema.studios).values(studioRow).run();
          report.created++;
        }

        // Junction: studio.games → gameDevelopers (reverse direction)
        if (fm?.games.length) {
          for (const gameSlug of fm.games) {
            // Insert only if not already present
            const existingJunction = db
              .select()
              .from(schema.gameDevelopers)
              .where(eq(schema.gameDevelopers.gameSlug, gameSlug))
              .all()
              .find((r) => r.studioSlug === slug);

            if (!existingJunction) {
              db.insert(schema.gameDevelopers).values({ gameSlug, studioSlug: slug }).run();
            }
          }
        }

        // Junction: studio.studios → relatedStudios
        if (fm?.studios.length) {
          db.delete(schema.relatedStudios).where(eq(schema.relatedStudios.studioSlug, slug)).run();
          for (const relatedSlug of fm.studios) {
            db.insert(schema.relatedStudios).values({ studioSlug: slug, relatedStudioSlug: relatedSlug }).run();
            referencedStudios.add(relatedSlug);
          }
        }

        report.studiosProcessed++;
      } catch (err) {
        report.errors.push(`Error syncing studio ${filePath}: ${err}`);
      }
    }

    // ── Sync publishers ───────────────────────

    for (const filePath of publisherFiles) {
      try {
        const slug = slugFromPath(filePath);
        const parsed = parseMarkdownFile(filePath);
        const result = publisherFrontmatterSchema.safeParse(parsed.frontmatter);

        let fm: PublisherFrontmatter | null = null;
        if (result.success) {
          fm = result.data;
        }

        const pubRow = {
          slug,
          overviewText: parsed.sections.overview ?? null,
          sourceFile: filePath,
          lastSyncedAt: new Date(),
        };

        const existing = db.select().from(schema.publishers).where(eq(schema.publishers.slug, slug)).get();
        if (existing) {
          const changesBefore = report.changes.length;
          detectChanges(report, slug, "publisher", existing, pubRow);
          if (report.changes.length > changesBefore) {
            db.update(schema.publishers).set(pubRow).where(eq(schema.publishers.slug, slug)).run();
            report.updated++;
          } else {
            report.unchanged++;
          }
        } else {
          db.insert(schema.publishers).values(pubRow).run();
          report.created++;
        }

        // Junction: publisher.games → gamePublishers (reverse direction)
        if (fm?.games.length) {
          for (const gameSlug of fm.games) {
            const existingJunction = db
              .select()
              .from(schema.gamePublishers)
              .where(eq(schema.gamePublishers.gameSlug, gameSlug))
              .all()
              .find((r) => r.publisherSlug === slug);

            if (!existingJunction) {
              db.insert(schema.gamePublishers).values({ gameSlug, publisherSlug: slug }).run();
            }
          }
        }

        // Junction: publisher.studios → publisherStudios
        if (fm?.studios.length) {
          db.delete(schema.publisherStudios).where(eq(schema.publisherStudios.publisherSlug, slug)).run();
          for (const studioSlug of fm.studios) {
            db.insert(schema.publisherStudios).values({ publisherSlug: slug, studioSlug }).run();
            referencedStudios.add(studioSlug);
          }
        }

        report.publishersProcessed++;
      } catch (err) {
        report.errors.push(`Error syncing publisher ${filePath}: ${err}`);
      }
    }

    // ── Sync designers ────────────────────────

    for (const filePath of designerFiles) {
      try {
        const slug = slugFromPath(filePath);
        const parsed = parseMarkdownFile(filePath);

        // Designers don't have a full template yet, so just grab whatever frontmatter exists
        const designerRow = {
          slug,
          overviewText: parsed.sections.overview ?? null,
          sourceFile: filePath,
          lastSyncedAt: new Date(),
        };

        const existing = db.select().from(schema.designers).where(eq(schema.designers.slug, slug)).get();
        if (existing) {
          const changesBefore = report.changes.length;
          detectChanges(report, slug, "designer", existing, designerRow);
          if (report.changes.length > changesBefore) {
            db.update(schema.designers).set(designerRow).where(eq(schema.designers.slug, slug)).run();
            report.updated++;
          } else {
            report.unchanged++;
          }
        } else {
          db.insert(schema.designers).values(designerRow).run();
          report.created++;
        }

        report.designersProcessed++;
      } catch (err) {
        report.errors.push(`Error syncing designer ${filePath}: ${err}`);
      }
    }

    // ── Create stub rows for referenced-but-missing entities ──

    for (const studioSlug of referencedStudios) {
      const exists = db.select().from(schema.studios).where(eq(schema.studios.slug, studioSlug)).get();
      if (!exists) {
        db.insert(schema.studios)
          .values({
            slug: studioSlug,
            director: null,
            overviewText: null,
            sourceFile: "(referenced)",
            lastSyncedAt: new Date(),
          })
          .run();
      }
    }

    for (const pubSlug of referencedPublishers) {
      const exists = db.select().from(schema.publishers).where(eq(schema.publishers.slug, pubSlug)).get();
      if (!exists) {
        db.insert(schema.publishers)
          .values({
            slug: pubSlug,
            overviewText: null,
            sourceFile: "(referenced)",
            lastSyncedAt: new Date(),
          })
          .run();
      }
    }

    for (const designerSlug of referencedDesigners) {
      const exists = db.select().from(schema.designers).where(eq(schema.designers.slug, designerSlug)).get();
      if (!exists) {
        db.insert(schema.designers)
          .values({
            slug: designerSlug,
            overviewText: null,
            sourceFile: "(referenced)",
            lastSyncedAt: new Date(),
          })
          .run();
      }
    }
  });

  transact();
  sqlite.close();

  return report;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function syncStubGame(
  db: ReturnType<typeof drizzle>,
  slug: string,
  filePath: string,
  report: SyncReport,
): void {
  const existing = db.select().from(schema.games).where(eq(schema.games.slug, slug)).get();
  if (!existing) {
    db.insert(schema.games)
      .values({
        slug,
        sourceFile: filePath,
        lastSyncedAt: new Date(),
      })
      .run();
    report.created++;
  }
  report.gamesProcessed++;
}

function detectChanges(
  report: SyncReport,
  slug: string,
  entityType: Change["entityType"],
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): void {
  const fieldsToCompare = Object.keys(incoming).filter(
    (k) => k !== "lastSyncedAt" && k !== "sourceFile" && k !== "slug",
  );

  for (const field of fieldsToCompare) {
    const oldVal = serialize(existing[field]);
    const newVal = serialize(incoming[field]);

    if (oldVal !== newVal) {
      report.changes.push({
        entity: slug,
        entityType,
        field,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }
}

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
