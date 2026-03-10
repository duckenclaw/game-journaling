import "dotenv/config";
import { generateAll } from "./generate-all.js";
import { generateSingle } from "./generate-single.js";

// Detect "single" subcommand from argv.
// Direct: `tsx src/generate/index.ts single "Name"` → argv[2] = "single"
// Via CLI router: `tsx src/index.ts generate single "Name"` → argv[3] = "single"
const singleIdx = process.argv.indexOf("single");

if (singleIdx !== -1) {
  const gameName = process.argv.slice(singleIdx + 1).join(" ");
  await generateSingle(gameName);
} else {
  await generateAll();
}
