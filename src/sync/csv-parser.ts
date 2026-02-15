import fs from "node:fs";
import { csvRowSchema, type CsvRow } from "./validators.js";
import { toSlug } from "./wiki-link.js";

export interface ParsedCsvGame {
  slug: string;
  row: CsvRow;
}

/**
 * Parse lib/games.csv into validated game entries.
 * Handles known data quality issues: trailing commas, inconsistent whitespace,
 * status/platform typos.
 */
export function parseCsvFile(filePath: string): ParsedCsvGame[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) return [];

  // Parse header — strip trailing commas and whitespace
  const header = lines[0]
    .replace(/,\s*$/, "")
    .split(",")
    .map((h) => h.trim().toLowerCase());

  const results: ParsedCsvGame[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/,\s*$/, ""); // strip trailing comma
    const values = splitCsvLine(line);

    const record: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      record[header[j]] = (values[j] ?? "").trim();
    }

    if (!record.name || record.name === "") continue;

    const parsed = csvRowSchema.safeParse(record);
    if (!parsed.success) {
      console.warn(`  [csv] Skipping line ${i + 1}: ${parsed.error.message}`);
      continue;
    }

    results.push({
      slug: toSlug(parsed.data.name),
      row: parsed.data,
    });
  }

  return results;
}

/**
 * Simple CSV line splitter that handles basic cases.
 * Does not handle quoted fields with commas inside (not needed for this CSV).
 */
function splitCsvLine(line: string): string[] {
  return line.split(",").map((v) => v.trim());
}
