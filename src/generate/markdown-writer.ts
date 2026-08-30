import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { ResolvedGameData } from "../igdb/types.js";
import { toSlug } from "../sync/wiki-link.js";

// ──────────────────────────────────────────────
// Game markdown
// ──────────────────────────────────────────────

export interface GameWriteOptions {
  status: string | null;
  platform: string | null;
}

/**
 * Write a game markdown file matching the Atomic-Heart.md format.
 * Uses manual YAML construction to ensure exact formatting with wiki-links.
 */
export function writeGameMarkdown(
  slug: string,
  data: ResolvedGameData,
  options: GameWriteOptions,
): void {
  const dir = path.resolve("lib/games");
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${slug}.md`);

  // Build YAML frontmatter manually to ensure correct formatting
  const lines: string[] = ["---"];

  lines.push("class: game");
  lines.push(`status: ${options.status ?? "not started"}`);

  // Array fields — use YAML list syntax
  lines.push(...yamlArray("game-genre", data.genres));
  lines.push(...yamlArray("game-modes", data.gameModes));
  lines.push(...yamlArray("game-genre-tags", data.keywords));
  lines.push(...yamlArray("game-themes", data.themes));
  lines.push(...yamlArray("player-perspective", data.playerPerspectives));

  lines.push(`platform: ${options.platform ?? ""}`);

  // Quote engine if it contains special YAML characters (colon, etc.)
  const engineValue = data.engine ?? "";
  const needsQuotes = engineValue.includes(":") || engineValue.includes("#") || engineValue.includes("[");
  lines.push(`engine: ${needsQuotes && engineValue ? `"${engineValue}"` : engineValue}`);

  // Wiki-link arrays for developer/publisher (slugified for filename matching)
  lines.push(...yamlWikiLinkArray("developer", data.developers.map(toSlug)));
  lines.push(...yamlWikiLinkArray("publisher", data.publishers.map(toSlug)));

  // Director — TODO: requires Wikipedia scraping
  lines.push("director:");

  // Release date
  lines.push(`release: ${data.releaseDate ?? "YYYY-MM-DD"}`);
  lines.push(`release-precision: ${data.releasePrecision ?? ""}`);
  lines.push(`release-human: ${data.releaseHuman ? `"${data.releaseHuman}"` : ""}`);

  lines.push("---");

  // Content sections
  lines.push("");
  lines.push("# Gameplay");
  if (data.summary) {
    lines.push(data.summary);
  }

  lines.push("");
  lines.push("# Synopsis");
  if (data.storyline) {
    lines.push(data.storyline);
  }

  lines.push("");
  lines.push("# Review");

  lines.push("");
  lines.push("## Notes");

  const content = lines.join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf-8");
}

// ──────────────────────────────────────────────
// Studio markdown
// ──────────────────────────────────────────────

/**
 * Write or update a studio markdown file.
 * Accumulative: merges new game links with existing ones.
 */
export function writeStudioMarkdown(
  slug: string,
  newGameSlugs: string[],
): void {
  const dir = path.resolve("lib/studios");
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${slug}.md`);

  // Read existing file if present and has content
  const existing = readExistingFrontmatter(filePath);

  // Merge game lists (deduplicate)
  const existingGames: string[] = existing?.games ?? [];
  const allGames = [...new Set([...existingGames, ...newGameSlugs])];

  // Preserve existing fields
  const existingStudios: string[] = existing?.studios ?? [];
  const director: string = existing?.director ?? "";

  const lines: string[] = ["---"];
  lines.push("class: studio");
  lines.push(`director: ${director ? `"[[${director}]]"` : ""}`);
  lines.push(...yamlWikiLinkArray("games", allGames));
  lines.push(...yamlWikiLinkArray("studios", existingStudios));
  lines.push("---");
  lines.push("# Overview");

  // Preserve existing overview text
  if (existing?.overviewText) {
    lines.push(existing.overviewText);
  }

  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

// ──────────────────────────────────────────────
// Publisher markdown
// ──────────────────────────────────────────────

/**
 * Write or update a publisher markdown file.
 * Accumulative: merges new game/studio links with existing ones.
 */
export function writePublisherMarkdown(
  slug: string,
  newGameSlugs: string[],
  newStudioSlugs: string[],
): void {
  const dir = path.resolve("lib/publishers");
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${slug}.md`);

  // Read existing file if present
  const existing = readExistingFrontmatter(filePath);

  // Merge lists
  const existingGames: string[] = existing?.games ?? [];
  const existingStudios: string[] = existing?.studios ?? [];
  const allGames = [...new Set([...existingGames, ...newGameSlugs])];
  const allStudios = [...new Set([...existingStudios, ...newStudioSlugs])];

  const lines: string[] = ["---"];
  lines.push("class: publisher");
  lines.push(...yamlWikiLinkArray("games", allGames));
  lines.push(...yamlWikiLinkArray("studios", allStudios));
  lines.push("---");
  lines.push("# Overview");

  if (existing?.overviewText) {
    lines.push(existing.overviewText);
  }

  lines.push("");

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Format a string array as YAML list */
function yamlArray(key: string, values: string[]): string[] {
  if (values.length === 0) return [`${key}:`];
  return [`${key}:`, ...values.map((v) => `  - ${v}`)];
}

/** Format a slug array as YAML list with wiki-links */
function yamlWikiLinkArray(key: string, slugs: string[]): string[] {
  if (slugs.length === 0) return [`${key}:`];
  return [`${key}:`, ...slugs.map((s) => `  - "[[${s}]]"`)];
}

interface ExistingFrontmatterData {
  games: string[];
  studios: string[];
  director: string | null;
  overviewText: string | null;
}

/**
 * Read existing frontmatter from a markdown file.
 * Returns null if file doesn't exist or is empty/stub.
 */
function readExistingFrontmatter(
  filePath: string,
): ExistingFrontmatterData | null {
  try {
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, "utf-8");
    if (raw.trim().length === 0) return null;

    const { data, content } = matter(raw);

    // Parse wiki-links from array fields
    const parseLinks = (val: unknown): string[] => {
      if (!val) return [];
      const arr = Array.isArray(val) ? val : [val];
      return arr.map((v: string) => {
        const match = String(v).match(/^\[\[(.+)\]\]$/);
        return match ? match[1] : String(v);
      });
    };

    // Parse director wiki-link
    const parseDirector = (val: unknown): string | null => {
      if (!val) return null;
      const s = String(val);
      const match = s.match(/^\[\[(.+)\]\]$/);
      return match ? match[1] : s;
    };

    // Extract overview text from content
    const overviewMatch = content.match(/^#\s+Overview\s*\n([\s\S]*?)(?=\n#|$)/m);
    const overviewText = overviewMatch?.[1]?.trim() || null;

    return {
      games: parseLinks(data.games),
      studios: parseLinks(data.studios),
      director: parseDirector(data.director),
      overviewText,
    };
  } catch {
    return null;
  }
}
