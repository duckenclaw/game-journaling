import { z } from "zod/v4";
import { parseWikiLink } from "./wiki-link.js";

// ──────────────────────────────────────────────
// Shared transforms
// ──────────────────────────────────────────────

/** Parse a single wiki-link "[[Name]]" → "Name" */
const wikiLinkSchema = z.string().transform((val) => parseWikiLink(val));

/** Accept a single wiki-link string or an array; always return string[] */
const optionalWikiLinkArray = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .nullable()
  .transform((val) => {
    if (val == null) return [];
    const arr = Array.isArray(val) ? val : [val];
    return arr.map(parseWikiLink);
  });

/** Accept a string or string[]; always return string[] */
const optionalStringArray = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .nullable()
  .transform((val) => {
    if (val == null) return [];
    return Array.isArray(val) ? val : [val];
  });

/** Normalize status values, handling known typos from games.csv */
const statusSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return null;
    const n = val.trim().toLowerCase();
    if (n === "finished") return "finished";
    if (n === "started") return "started";
    if (n === "bought") return "bought";
    if (n.startsWith("not start")) return "not started"; // "not startedv", "not start"
    if (n === "not finished") return "started"; // reasonable mapping
    return null;
  });

/** Normalize platform values, handling known typos */
const platformSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return null;
    const trimmed = val.trim();
    if (trimmed === "Xbok 360") return "Xbox 360";
    return trimmed || null;
  });

// ──────────────────────────────────────────────
// Entity schemas
// ──────────────────────────────────────────────

export const gameFrontmatterSchema = z.object({
  class: z.literal("game"),
  status: statusSchema,
  "game-genre": optionalStringArray,
  "game-modes": optionalStringArray,
  "game-genre-tags": optionalStringArray,
  "player-perspective": optionalStringArray,
  platform: platformSchema,
  engine: z.string().optional().nullable().transform((v) => v?.trim() || null),
  developer: optionalWikiLinkArray,
  publisher: optionalWikiLinkArray,
  director: wikiLinkSchema.optional().nullable(),
  release: z
    .union([z.string(), z.date()])
    .optional()
    .nullable()
    .transform((val) => {
      if (!val) return null;
      if (val instanceof Date) {
        return val.toISOString().split("T")[0];
      }
      const trimmed = val.trim();
      if (trimmed === "YYYY-MM-DD" || trimmed === "") return null;
      return trimmed;
    }),
});

export const studioFrontmatterSchema = z.object({
  class: z.literal("studio"),
  director: wikiLinkSchema.optional().nullable(),
  games: optionalWikiLinkArray,
  studios: optionalWikiLinkArray,
});

export const publisherFrontmatterSchema = z.object({
  class: z.literal("publisher"),
  games: optionalWikiLinkArray,
  studios: optionalWikiLinkArray,
});

export const designerFrontmatterSchema = z
  .object({
    class: z.literal("designer"),
  })
  .passthrough();

export const csvRowSchema = z.object({
  name: z.string().transform((v) => v.trim()),
  status: statusSchema,
  platform: platformSchema,
  notes: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v?.trim() || null),
});

// ──────────────────────────────────────────────
// Inferred types
// ──────────────────────────────────────────────

export type GameFrontmatter = z.output<typeof gameFrontmatterSchema>;
export type StudioFrontmatter = z.output<typeof studioFrontmatterSchema>;
export type PublisherFrontmatter = z.output<typeof publisherFrontmatterSchema>;
export type DesignerFrontmatter = z.output<typeof designerFrontmatterSchema>;
export type CsvRow = z.output<typeof csvRowSchema>;
