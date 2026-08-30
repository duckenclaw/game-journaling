import fs from "node:fs";
import path from "node:path";

// ──────────────────────────────────────────────
// Calendar event ledger
// ──────────────────────────────────────────────
//
// Records which games we have already put on the calendar, so re-runs don't
// create duplicates. Lives outside the DB deliberately: the DB is a derived
// index that can be deleted and rebuilt, but this is state we can't recover
// from the markdown files.

const LEDGER_PATH = path.resolve("data/calendar-events.json");

export interface LedgerEntry {
  uid: string;
  calendar: string;
  summary: string;
  /** "YYYY-MM-DD" */
  release: string;
  precision: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Ledger = Record<string, LedgerEntry>;

export function readLedger(): Ledger {
  if (!fs.existsSync(LEDGER_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8")) as Ledger;
  } catch {
    console.log("  [warn] calendar-events.json is unreadable, starting fresh");
    return {};
  }
}

export function writeLedger(ledger: Ledger): void {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(ledger).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

export { LEDGER_PATH };
