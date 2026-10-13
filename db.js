// Supabase access over PostgREST with plain fetch (no client library).
// Every call times out quickly so a paused free-tier project falls back to
// the built-in drills instead of hanging the page.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { fromRow } from "./drills.js";

const TIMEOUT_MS = 6000;
const RECENT_SESSIONS = 3;

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 || res.status === 201 ? null : res.json();
}

export async function loadDrills() {
  const rows = await rest("planner_drills?active=eq.true&select=*&order=id");
  if (!rows.length) throw new Error("No drills in database");
  return rows.map(fromRow);
}

export async function saveSession({ levels, serve, game, players, plan }) {
  await rest("planner_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      levels,
      serve,
      game: game > 0,
      game_minutes: game,
      players,
      plan: plan.map((it) => ({
        start: it.start,
        minutes: it.minutes,
        kind: it.kind,
        label: it.label,
        drillId: it.drill?.id ?? null,
      })),
    }),
  });
}

export async function loadHistory(limit = 10) {
  return rest(`planner_sessions?select=*&order=created_at.desc&limit=${limit}`);
}

export function recentDrillIds(history) {
  return history
    .slice(0, RECENT_SESSIONS)
    .flatMap((s) => s.plan.map((it) => it.drillId))
    .filter(Boolean);
}
