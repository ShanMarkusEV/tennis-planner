// Applies supabase/schema.sql, then seeds planner_drills from drills.js.
// Needs SUPABASE_DB_URL (Session pooler URI) in .env — the direct
// db.<ref>.supabase.co host has no IPv4 and won't resolve.
//
//   node scripts/deploy-sql.mjs                # schema + insert missing drills
//   node scripts/deploy-sql.mjs --overwrite    # also overwrite edited drills from drills.js
import { readFileSync } from "node:fs";
import pg from "pg";
import { DRILLS } from "../drills.js";

const env = {};
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trimStart().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
} catch {}
const connectionString = env.SUPABASE_DB_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("✗ SUPABASE_DB_URL not set in .env");
  process.exit(1);
}

const overwrite = process.argv.includes("--overwrite");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(readFileSync("supabase/schema.sql", "utf8"));
  console.log("→ schema applied");

  const cols = "id, name, category, type, min_level, max_level, intensity, cues, mixed_note";
  const onConflict = overwrite
    ? `on conflict (id) do update set (${cols.slice(4)}, updated_at) =
       (excluded.name, excluded.category, excluded.type, excluded.min_level, excluded.max_level,
        excluded.intensity, excluded.cues, excluded.mixed_note, now())`
    : "on conflict (id) do nothing";
  let added = 0;
  for (const d of DRILLS) {
    const r = await client.query(
      `insert into planner_drills (${cols}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) ${onConflict}`,
      [d.id, d.name, d.category, d.type, d.minLevel, d.maxLevel, d.intensity, d.cues, d.mixedNote],
    );
    added += r.rowCount;
  }
  console.log(`→ drills ${overwrite ? "upserted" : "inserted"}: ${added}/${DRILLS.length}`);
  console.log("✓ Deploy complete");
} catch (e) {
  console.error("✗ Deploy failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
