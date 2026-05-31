import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/server/db/schema";

const databasePath = process.env.DATABASE_URL ?? "./data/yugioh-pricer.sqlite";

mkdirSync(dirname(databasePath), { recursive: true });

export const sqlite = new Database(databasePath);
export const db = drizzle(sqlite, { schema });
