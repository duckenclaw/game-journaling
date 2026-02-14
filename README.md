# Game Journaling

A TypeScript-powered knowledge base for game design journaling, built on interlinked markdown and Obsidian. The project creates a collection of interconnected markdown files documenting games, studios, publishers, and designers — with game metadata auto-populated from the IGDB API.

## Features

**Current:**
- Markdown templates for games, studios, and publishers with structured YAML frontmatter
- CSV catalog of ~422 games with status tracking
- Obsidian vault with Dataview plugin for queryable views
- Bidirectional wiki-link references between all entity types
- One fully documented example (`Atomic-Heart.md`) demonstrating the target format

**Planned:**
- TypeScript CLI to parse the CSV and batch-generate markdown files
- IGDB API integration to auto-fill game metadata (genres, modes, engine, release date, etc.)
- Auto-generation of studio and publisher files with back-links to their games
- Designer/director file generation
- Game mechanics pages interlinked across titles (e.g., a "Horse Riding" page linked from both Witcher 3 and Red Dead Redemption 2)
- Web frontend (Docusaurus or similar) for publishing beyond Obsidian

## Tech Stack

| Component       | Technology           | Status     |
|-----------------|----------------------|------------|
| Language        | TypeScript           | Planned    |
| Runtime         | Node.js              | Planned    |
| Game Data API   | IGDB via Twitch OAuth| Configured |
| Vault / Editor  | Obsidian             | Active     |
| Obsidian Plugins| Dataview, Icon Folder| Active     |
| Web Frontend    | TBD (Docusaurus, etc.)| Future    |

## Project Structure

```
game-journaling/
├── .env.example              # Twitch API credentials template
├── lib/
│   ├── games.csv             # Master game list (name, status, platform, notes)
│   ├── games/                # Generated game markdown files
│   ├── studios/              # Studio markdown files
│   ├── publishers/           # Publisher markdown files
│   ├── designers/            # Designer/director markdown files
│   └── templates/            # Markdown templates
│       ├── game-template.md
│       ├── studio-template.md
│       └── publisher-template.md
└── .obsidian/                # Obsidian vault config (gitignored)
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- A [Twitch Developer](https://dev.twitch.tv/console) account (for IGDB API access)
- [Obsidian](https://obsidian.md/) (recommended for viewing/editing the vault)

## Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd game-journaling
   ```

2. Copy the environment template and fill in your Twitch API credentials:
   ```bash
   cp .env.example .env
   ```
   - `TWITCH_CLIENT_ID` — from the [Twitch Developer Console](https://dev.twitch.tv/console)
   - `TWITCH_CLIENT_SECRET` — from the Twitch Developer Console
   - `TWITCH_GRANT_TYPE` — leave as `client_credentials`

3. Open the project root as an Obsidian vault to browse the markdown files.

## File Format

### Conventions

- **Filenames:** `Capitalized-Hyphen-Separated.md` (e.g., `Atomic-Heart.md`, `Focus-Entertainment.md`)
- **Cross-references:** Quoted Obsidian wiki-links in YAML frontmatter — `"[[File-Name]]"`
- **Status values:** `finished`, `started`, `bought`, `not started`
- **Dates:** `YYYY-MM-DD`

### Game Files

YAML frontmatter fields:

| Field              | Type     | Description                              |
|--------------------|----------|------------------------------------------|
| class              | string   | Always `game`                            |
| status             | string   | `finished` / `started` / `bought` / `not started` |
| game-genre         | string[] | Genres (e.g., Shooter, RPG, Adventure)   |
| game-modes         | string[] | Modes (e.g., Single player, Multiplayer) |
| game-genre-tags    | string[] | Tags (e.g., Open world, Science fiction) |
| player-perspective | string[] | Camera (e.g., First person, Third person)|
| platform           | string   | PC, PS5, VR, Nintendo Switch, etc.       |
| engine             | string   | Game engine name                         |
| developer          | string[] | Wiki-links to studio files               |
| publisher          | string[] | Wiki-links to publisher files            |
| director           | string   | Wiki-link to designer file               |
| release            | string   | Release date (YYYY-MM-DD)                |

Content sections: `# Gameplay`, `# Synopsis`, `# Review`, `## Notes`

### Studio Files

| Field    | Type     | Description                              |
|----------|----------|------------------------------------------|
| class    | string   | Always `studio`                          |
| director | string   | Wiki-link to director/designer file      |
| games    | string[] | Wiki-links to game files                 |
| studios  | string[] | Wiki-links to related studios            |

### Publisher Files

| Field   | Type     | Description                              |
|---------|----------|------------------------------------------|
| class   | string   | Always `publisher`                       |
| games   | string[] | Wiki-links to game files                 |
| studios | string[] | Wiki-links to studio files               |

## CSV Format (`lib/games.csv`)

The master game list with columns:

| Column   | Description                                          |
|----------|------------------------------------------------------|
| name     | Game title                                           |
| status   | `finished`, `started`, `bought`, or `not started`    |
| platform | PC, PS5, VR, Nintendo Switch, Xbox 360, PSP, Mobile, Tabletop |
| notes    | Optional freeform notes                              |

## Usage (Planned)

Once the TypeScript CLI is implemented, the intended workflow will be:

1. Add games to `lib/games.csv`
2. Run the CLI tool to fetch metadata from IGDB and generate markdown files
3. Open the Obsidian vault to browse, edit, and annotate games
4. Use Dataview queries to filter and sort games by status, genre, platform, etc.
5. Write mechanic pages and link them across game files

## Roadmap

1. **Template design & catalog** — Markdown templates, CSV game list, Obsidian vault *(done)*
2. **TypeScript project setup** — `package.json`, `tsconfig.json`, build tooling
3. **CSV parser + markdown generator** — Create game files from CSV entries
4. **IGDB API integration** — Auto-fill metadata from the IGDB API
5. **Studio/publisher auto-generation** — Create entity files with back-links
6. **Game mechanics cross-linking** — Shared mechanic pages across titles
7. **Web frontend** — Publish the vault as a browsable website
