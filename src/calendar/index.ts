import "dotenv/config";
import { syncCalendar } from "./sync-calendar.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const includePast = args.includes("--all");

console.log("=== Calendar Sync ===\n");

const report = syncCalendar(undefined, { dryRun, force, includePast });

if (!dryRun) {
  console.log("\n  === Summary ===");
  console.log(`  Created:   ${report.created}`);
  console.log(`  Updated:   ${report.updated}`);
  console.log(`  Unchanged: ${report.unchanged}`);
  console.log(`  Skipped:   ${report.skipped}`);

  if (report.errors.length > 0) {
    console.log(`\n  Errors (${report.errors.length}):`);
    for (const err of report.errors) console.log(`    ${err}`);
  }
  console.log();
}
