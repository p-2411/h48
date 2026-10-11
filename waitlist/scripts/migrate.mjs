// Applies db/migrations/*.sql in name order. Every migration is idempotent (IF NOT EXISTS),
// so re-running is safe. Usage: pnpm db:migrate (reads DATABASE_URL from .env.local or the shell).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first, or export it.");
  process.exit(1);
}

const sql = neon(url);
const dir = path.join(import.meta.dirname, "..", "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  const text = await readFile(path.join(dir, file), "utf8");
  // The HTTP driver runs one statement per call; split on semicolons at line ends.
  const statements = text
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  console.log(`applied ${file} (${statements.length} statements)`);
}
