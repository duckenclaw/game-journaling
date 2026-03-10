import "dotenv/config";

const command = process.argv[2];

switch (command) {
  case "sync":
    // Dynamic import to keep CLI responsive
    await import("./sync/index.js");
    break;
  case "generate":
    await import("./generate/index.js");
    break;
  default:
    console.log("Game Journaling CLI");
    console.log();
    console.log("Commands:");
    console.log("  sync                          Synchronize markdown files to the SQLite database");
    console.log("  generate                      Generate all markdown files from CSV + IGDB");
    console.log('  generate single "Game Name"   Generate a single game from IGDB');
    console.log();
    console.log("Usage:");
    console.log("  npm run sync                         Run sync directly");
    console.log("  npm run generate                     Generate all game files");
    console.log('  npm run generate:single "Game Name"  Generate a single game');
    console.log("  npm run dev sync                     Run via CLI router");
    break;
}
