import type { IgdbGame, IgdbReleaseDate, ReleasePrecision } from "./types.js";

// ──────────────────────────────────────────────
// Release date precision
// ──────────────────────────────────────────────
//
// IGDB's `first_release_date` is always a full unix timestamp, even when the
// publisher has only announced a year or a quarter — "2026" is stored as
// 31 Dec 2026. The `human` string on a release_dates entry is the only field
// that reveals the real precision, so we pattern-match it.

const PRECISION_PATTERNS: ReadonlyArray<[RegExp, ReleasePrecision]> = [
  [/^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}$/, "day"],     // "Nov 19, 2026"
  [/^\d{4}-\d{2}-\d{2}$/, "day"],                     // "2026-11-19"
  [/^[A-Za-z]{3,9}\s+\d{4}$/, "month"],               // "Nov 2026"
  [/^Q[1-4]\s+\d{4}$/i, "quarter"],                   // "Q4 2026"
  [/^\d{4}\s*Q[1-4]$/i, "quarter"],                   // "2026 Q4"
  [/^\d{4}$/, "year"],                                // "2026"
  [/^TBD$|^TBA$/i, "tba"],
];

/**
 * Derive how precise a release date is from IGDB's human-readable string.
 * Returns null when the string is missing or in an unrecognised shape.
 */
export function derivePrecision(human: string | undefined | null): ReleasePrecision | null {
  if (!human) return null;
  const trimmed = human.trim();
  for (const [pattern, precision] of PRECISION_PATTERNS) {
    if (pattern.test(trimmed)) return precision;
  }
  return null;
}

/**
 * Pick the release_dates entry that corresponds to `first_release_date`.
 * Falls back to the earliest dated entry, since that is what IGDB uses to
 * compute `first_release_date` in the first place.
 */
export function pickReleaseDate(game: IgdbGame): IgdbReleaseDate | null {
  const entries = game.release_dates ?? [];
  if (entries.length === 0) return null;

  if (game.first_release_date != null) {
    const exact = entries.find((e) => e.date === game.first_release_date);
    if (exact) return exact;
  }

  const dated = entries.filter((e) => e.date != null);
  if (dated.length === 0) return entries[0];
  return dated.reduce((earliest, e) => (e.date! < earliest.date! ? e : earliest));
}

/**
 * Resolve the precision and human-readable label for a game's release date.
 * When IGDB gives us no release_dates at all we assume day precision if a
 * timestamp exists — that is the common case for already-released games.
 */
export function resolveReleasePrecision(game: IgdbGame): {
  precision: ReleasePrecision | null;
  human: string | null;
} {
  const entry = pickReleaseDate(game);
  const human = entry?.human?.trim() || null;
  const precision = derivePrecision(human) ?? (game.first_release_date != null ? "day" : null);
  return { precision, human };
}
