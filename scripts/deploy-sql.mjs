// Applies supabase/schema.sql, then seeds planner_drills from drills.js.
// Needs SUPABASE_DB_URL (Session pooler URI) in .env — the direct
// db.<ref>.supabase.co host has no IPv4 and won't resolve.
//
//   node scripts/deploy-sql.mjs                # schema + insert missing drills
//   node scripts/deploy-sql.mjs --overwrite    # also overwrite edited drills from drills.js
//   node scripts/deploy-sql.mjs --prune        # hide (active=false) drills that are no longer in drills.js
import { readFileSync } from "node:fs";
import pg from "pg";
import { DRILL_ROWS } from "../drills.js";

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
const prune = process.argv.includes("--prune");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(readFileSync("supabase/schema.sql", "utf8"));
  console.log("→ schema applied");

  const cols = Object.keys(DRILL_ROWS[0]);
  const json = new Set(["level_notes", "diagram"]);
  const conflict = overwrite
    ? `on conflict (id) do update set ${cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}, updated_at = now()`
    : "on conflict (id) do nothing";
  let changed = 0;
  for (const r of DRILL_ROWS) {
    const res = await client.query(
      `insert into planner_drills (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ${conflict}`,
      cols.map((c) => (json.has(c) ? JSON.stringify(r[c]) : r[c])),
    );
    changed += res.rowCount;
  }
  console.log(`→ drills ${overwrite ? "upserted" : "inserted"}: ${changed}/${DRILL_ROWS.length}`);

  if (prune) {
    const res = await client.query("update planner_drills set active = false where active and not (id = any($1))", [DRILL_ROWS.map((r) => r.id)]);
    console.log(`→ deactivated drills not in drills.js: ${res.rowCount}`);
  }
  console.log("✓ Deploy complete");
} catch (e) {
  console.error("✗ Deploy failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
