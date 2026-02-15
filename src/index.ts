import "dotenv/config";

const command = process.argv[2];

switch (command) {
  case "sync":
    // Dynamic import to keep CLI responsive
    await import("./sync/index.js");
    break;
  default:
    console.log("Game Journaling CLI");
    console.log();
    console.log("Commands:");
    console.log("  sync    Synchronize markdown files to the SQLite database");
    console.log();
    console.log("Usage:");
    console.log("  npm run sync          Run sync directly");
    console.log("  npm run dev sync      Run via CLI router");
    break;
}
