import "dotenv/config";
import { syncAll } from "./sync-engine.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "data/game-journaling.db";

console.log("=== Game Journaling Sync ===");
console.log(`Database: ${DATABASE_URL}\n`);

const report = syncAll(DATABASE_URL);

// ── Print results ─────────────────────────────

console.log("\n=== Sync Complete ===\n");

console.log(`  Games:      ${report.gamesProcessed}`);
console.log(`  Studios:    ${report.studiosProcessed}`);
console.log(`  Publishers: ${report.publishersProcessed}`);
console.log(`  Designers:  ${report.designersProcessed}`);
console.log();
console.log(`  Created: ${report.created}`);
console.log(`  Updated: ${report.updated}`);
console.log(`  Unchanged: ${report.unchanged}`);

if (report.changes.length > 0) {
  console.log(`\n  Changes detected (${report.changes.length}):`);
  for (const c of report.changes) {
    console.log(`    [${c.entityType}] ${c.entity}.${c.field}: ${c.oldValue} → ${c.newValue}`);
  }
}

if (report.errors.length > 0) {
  console.log(`\n  Errors (${report.errors.length}):`);
  for (const err of report.errors) {
    console.log(`    ${err}`);
  }
}

console.log();
