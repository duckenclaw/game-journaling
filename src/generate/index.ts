import "dotenv/config";
import { generateAll } from "./generate-all.js";
import { generateSingle } from "./generate-single.js";

// Detect "single" subcommand from argv.
// Direct: `tsx src/generate/index.ts single "Name"` → argv[2] = "single"
// Via CLI router: `tsx src/index.ts generate single "Name"` → argv[3] = "single"
const singleIdx = process.argv.indexOf("single");

if (singleIdx !== -1) {
  const rest = process.argv.slice(singleIdx + 1);

  // Optional --igdb-id <id>: skip the fuzzy search and use that entry directly.
  let igdbId: number | undefined;
  const flagIdx = rest.findIndex((a) => a === "--igdb-id" || a.startsWith("--igdb-id="));
  if (flagIdx !== -1) {
    const arg = rest[flagIdx];
    const raw = arg.includes("=") ? arg.split("=")[1] : rest[flagIdx + 1];
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.error(`Error: --igdb-id expects a numeric IGDB id, got "${raw ?? ""}".`);
      process.exit(1);
    }
    igdbId = parsed;
    rest.splice(flagIdx, arg.includes("=") ? 1 : 2);
  }

  await generateSingle(rest.join(" "), igdbId);
} else {
  await generateAll();
}
