import "dotenv/config";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "data/game-journaling.db";

export const db = drizzle({
  connection: { source: DATABASE_URL },
  schema: { ...schema, ...relations },
});

export type Database = typeof db;
