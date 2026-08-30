import path from "node:path";
import fs from "node:fs";
import { globSync } from "glob";
import { parseMarkdownFile } from "../sync/parser.js";
import { slugFromPath } from "../sync/wiki-link.js";
import { gameFrontmatterSchema, type GameFrontmatter } from "../sync/validators.js";
import {
  CalendarAccessError,
  createEvent,
  ensureCalendar,
  listEventUids,
  updateEvent,
  type EventFields,
} from "./applescript.js";
import { readLedger, writeLedger, type Ledger } from "./ledger.js";

const DEFAULT_CALENDAR = "Game Releases";
const VAULT_NAME = path.basename(path.resolve("."));

export interface CalendarOptions {
  /** Print what would happen without touching Calendar.app. */
  dryRun?: boolean;
  /** Recreate events that were deleted in Calendar by hand. */
  force?: boolean;
  /** Include games whose release date has already passed. */
  includePast?: boolean;
}

export interface CalendarReport {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: string[];
}

interface UpcomingGame {
  slug: string;
  fm: GameFrontmatter;
  release: string;
}

// ──────────────────────────────────────────────
// Event rendering
// ──────────────────────────────────────────────

/**
 * A day-precise date stands on its own. Anything vaguer is IGDB rounding a
 * placeholder up to the end of a period, so the title has to say so — an
 * unlabelled "Fable" sitting on 31 Dec 2026 reads as a confirmed date.
 */
function buildSummary(fm: GameFrontmatter, slug: string): string {
  const name = slug.replace(/-/g, " ");
  const precision = fm["release-precision"];
  if (!precision || precision === "day") return `🎮 ${name}`;
  const human = fm["release-human"];
  return human ? `🎮 ${name} (${human} — date TBA)` : `🎮 ${name} (date TBA)`;
}

function buildDescription(fm: GameFrontmatter, slug: string): string {
  const lines: string[] = [];
  if (fm.platform) lines.push(`Platform: ${fm.platform}`);
  if (fm.developer.length) lines.push(`Developer: ${fm.developer.join(", ").replace(/-/g, " ")}`);
  if (fm.publisher.length) lines.push(`Publisher: ${fm.publisher.join(", ").replace(/-/g, " ")}`);
  if (fm.status) lines.push(`Status: ${fm.status}`);
  const human = fm["release-human"];
  if (human) lines.push(`Announced for: ${human}`);
  lines.push("");
  lines.push(
    `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(`lib/games/${slug}`)}`,
  );
  return lines.join("\n");
}

function buildEvent(game: UpcomingGame): EventFields {
  return {
    summary: buildSummary(game.fm, game.slug),
    description: buildDescription(game.fm, game.slug),
    date: game.release,
  };
}

// ──────────────────────────────────────────────
// Collection
// ──────────────────────────────────────────────

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().split("T")[0];
}

/** Read game frontmatter, keeping only games with a usable future release date. */
function collectUpcoming(slugs: string[] | undefined, includePast: boolean, report: CalendarReport): UpcomingGame[] {
  const files = slugs
    ? slugs.map((s) => path.join("lib/games", `${s}.md`)).filter((f) => fs.existsSync(f))
    : globSync("lib/games/*.md");

  const cutoff = today();
  const upcoming: UpcomingGame[] = [];

  for (const filePath of files) {
    const slug = slugFromPath(filePath);
    try {
      const parsed = parseMarkdownFile(filePath);
      const result = gameFrontmatterSchema.safeParse(parsed.frontmatter);
      if (!result.success) continue; // stub or malformed file — nothing to schedule

      const release = result.data.release;
      if (!release || !/^\d{4}-\d{2}-\d{2}$/.test(release)) continue;
      if (!includePast && release < cutoff) continue;

      upcoming.push({ slug, fm: result.data, release });
    } catch (err) {
      report.errors.push(`Error reading ${filePath}: ${err}`);
    }
  }

  return upcoming.sort((a, b) => a.release.localeCompare(b.release));
}

// ──────────────────────────────────────────────
// Sync
// ──────────────────────────────────────────────

/**
 * Reconcile upcoming game releases with Calendar.app.
 *
 * Pass `slugs` to limit the run to specific games (used by the generate
 * pipeline); omit it to sweep every game file.
 */
export function syncCalendar(slugs?: string[], opts: CalendarOptions = {}): CalendarReport {
  const calendarName = process.env.CALENDAR_NAME?.trim() || DEFAULT_CALENDAR;
  const report: CalendarReport = { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] };

  const upcoming = collectUpcoming(slugs, opts.includePast ?? false, report);
  if (upcoming.length === 0) {
    console.log("  No upcoming releases to schedule.");
    return report;
  }

  const ledger = readLedger();

  if (opts.dryRun) {
    console.log(`  [dry run] calendar: "${calendarName}"\n`);
    for (const game of upcoming) {
      const event = buildEvent(game);
      const known = ledger[game.slug];
      const action = !known ? "create" : known.release === game.release ? "unchanged" : "update";
      console.log(`  ${game.release}  ${action.padEnd(9)} ${event.summary}`);
    }
    console.log();
    return report;
  }

  let existingUids: Set<string>;
  try {
    ensureCalendar(calendarName);
    existingUids = listEventUids(calendarName);
  } catch (err) {
    if (err instanceof CalendarAccessError) {
      console.log(`\n  ${err.message}\n`);
      report.errors.push(err.message);
      return report;
    }
    throw err;
  }

  const now = new Date().toISOString();

  for (const game of upcoming) {
    const event = buildEvent(game);
    const known = ledger[game.slug];

    try {
      if (!known) {
        const uid = createEvent(calendarName, event);
        ledger[game.slug] = {
          uid,
          calendar: calendarName,
          summary: event.summary,
          release: game.release,
          precision: game.fm["release-precision"] ?? null,
          createdAt: now,
          updatedAt: now,
        };
        report.created++;
        console.log(`  + ${game.release}  ${event.summary}`);
        continue;
      }

      // The event was deleted in Calendar by hand — respect that and leave it
      // gone unless the run explicitly asks for it back.
      if (!existingUids.has(known.uid)) {
        if (!opts.force) {
          report.skipped++;
          console.log(`  · ${game.release}  ${event.summary} (deleted in Calendar, skipping)`);
          continue;
        }
        const uid = createEvent(calendarName, event);
        ledger[game.slug] = { ...known, uid, summary: event.summary, release: game.release, precision: game.fm["release-precision"] ?? null, updatedAt: now };
        report.created++;
        console.log(`  + ${game.release}  ${event.summary} (recreated)`);
        continue;
      }

      const unchanged =
        known.release === game.release &&
        known.summary === event.summary &&
        known.precision === (game.fm["release-precision"] ?? null);

      if (unchanged) {
        report.unchanged++;
        continue;
      }

      if (updateEvent(calendarName, known.uid, event)) {
        ledger[game.slug] = { ...known, summary: event.summary, release: game.release, precision: game.fm["release-precision"] ?? null, updatedAt: now };
        report.updated++;
        console.log(`  ~ ${known.release} → ${game.release}  ${event.summary}`);
      } else {
        report.skipped++;
        console.log(`  · ${game.release}  ${event.summary} (event vanished mid-run)`);
      }
    } catch (err) {
      report.errors.push(`${game.slug}: ${err}`);
    }
  }

  writeLedger(ledger);
  return report;
}

/**
 * Fire-and-forget hook for the generate pipeline. Never throws — a Calendar
 * permission problem must not fail a generate run.
 */
export function syncCalendarQuietly(slugs: string[]): void {
  if (process.env.CALENDAR_ENABLED === "false") return;
  try {
    console.log("\n  Updating calendar...");
    const report = syncCalendar(slugs);
    console.log(
      `  Calendar: ${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged\n`,
    );
    for (const err of report.errors) console.log(`    ${err}`);
  } catch (err) {
    console.log(`  [warn] Calendar sync failed: ${err}\n`);
  }
}
