// Applies supabase/migrations/*.sql that haven't run yet. Runs before `next build`.
// Uses POSTGRES_URL_NON_POOLING (set by the Vercel ↔ Supabase integration).
// Skips quietly when no database URL is available (local builds, previews).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!raw) {
  console.log("[migrate] No POSTGRES_URL_NON_POOLING; skipping database migrations.");
  process.exit(0);
}

// Supabase uses its own CA; connect over TLS without strict chain verification.
const url = new URL(raw);
url.searchParams.delete("sslmode");
url.searchParams.delete("supa");
const client = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await client.connect();
try {
  await client.query(`
    create schema if not exists app_meta;
    create table if not exists app_meta.migrations (name text primary key, applied_at timestamptz not null default now());
  `);
  const { rows } = await client.query("select name from app_meta.migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;
    console.log(`[migrate] Applying ${file}`);
    await client.query("begin");
    try {
      await client.query(readFileSync(path.join(dir, file), "utf8"));
      await client.query("insert into app_meta.migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  console.log("[migrate] Database is up to date.");
} finally {
  await client.end();
}
