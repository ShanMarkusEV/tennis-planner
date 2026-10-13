// Session builder. Pure: same inputs + seed → same plan. No DOM, no network.

export const LEVELS = ["Newbie", "Beginner", "Upper Beginner", "Intermediate"];
export const SESSION_MINUTES = 120;
export const GROUP_SIZES = [4, 6, 8]; // players on one court with one coach

const UNIT = 5; // every block is a multiple of 5 minutes
const FIXED = { warmup: 10, break: 5, breaks: 2, serve: 10 }; // serve is capped at 10 min
export const GAME_OPTIONS = [0, 15, 20]; // game time: off, 15 or 20 min
const RECENT_WEIGHT = 0.15; // drills used in recent sessions are picked far less

// Small seeded PRNG (mulberry32) so Shuffle is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The coach's playbook, in order. Weights decide how the technical minutes are
// split; the fed-ball block gets the most because that's where technique is
// corrected.
//   1 Warm-up · 2 Fed ball (FH + BH) · 3 Racket feed across the net · 4 Volley
//   5 Mixed technique · 6 Serve · 7 Games
function technicalSlots() {
  return [
    { key: "feed-fh", label: "Fed ball · Forehand", categories: ["forehand"], type: "static", w: 1.25 },
    { key: "feed-bh", label: "Fed ball · Backhand", categories: ["backhand"], type: "static", w: 1.25 },
    { key: "racket-feed", label: "Racket feed across the net", categories: ["forehand", "backhand"], type: "moving", w: 1 },
    { key: "volley", label: "Volley", categories: ["net"], type: null, w: 1 },
    { key: "mixed", label: "Mixed technique", categories: ["combo"], type: null, w: 1 },
  ];
}

// Split `units` across slots by weight (largest remainder), min 2 units each.
function allocate(slots, units) {
  const base = slots.map(() => 2);
  let left = units - base.reduce((a, b) => a + b, 0);
  const W = slots.reduce((a, s) => a + s.w, 0);
  const exact = slots.map((s) => (s.w / W) * left);
  const floors = exact.map(Math.floor);
  floors.forEach((f, i) => (base[i] += f));
  left -= floors.reduce((a, b) => a + b, 0);
  exact
    .map((x, i) => [x - Math.floor(x), i])
    .sort((a, b) => b[0] - a[0])
    .slice(0, left)
    .forEach(([, i]) => base[i]++);
  return base;
}

// How well a drill works for this many players: 0 no, 1 with adaptation, 2 ideal.
// Drills without group notes count as workable.
export const groupFit = (d, players) => d.groupNotes?.[players]?.fit ?? 1;

function weight(d, lo, hi, recent, players) {
  let w = d.maxLevel >= hi ? 3 : 0.3; // challenges the strongest player
  if (d.minLevel === lo) w *= 1.5; // pitched right at the weakest player
  if (groupFit(d, players) === 2) w *= 1.5; // built for this group size
  if (recent.has(d.id)) w *= RECENT_WEIGHT;
  return w;
}

function pick(drills, slot, lo, hi, used, recent, players, rand) {
  const ok = (d) => !used.has(d.id) && d.minLevel <= lo && slot.categories.includes(d.category);
  const fits = (d) => ok(d) && groupFit(d, players) > 0;
  let pool = drills.filter((d) => fits(d) && (!slot.type || d.type === slot.type));
  if (!pool.length) pool = drills.filter(fits); // relax the static/moving split
  if (!pool.length) pool = drills.filter(ok); // relax the group-size fit
  if (!pool.length) pool = drills.filter((d) => !used.has(d.id) && slot.categories.includes(d.category));
  if (!pool.length) return null;
  const ws = pool.map((d) => weight(d, lo, hi, recent, players));
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= ws[i]) < 0) return pool[i];
  return pool[pool.length - 1];
}

/**
 * @param {object} o
 * @param {number[]} o.levels          selected level indexes (0..3), at least one
 * @param {boolean} o.serve            include a 10-min serve block
 * @param {number|boolean} o.game      game minutes: 0, 15 or 20 (true = 20)
 * @param {number} [o.players]         group size: 4, 6 or 8
 * @param {object[]} o.drills          drill library (see drills.js)
 * @param {string[]} [o.recentDrillIds] drills used in recent saved sessions
 * @param {number} [o.seed]
 * @returns {{start:number, minutes:number, kind:"drill"|"break", label:string, drill?:object}[]}
 */
export function buildSession({ levels, serve, game, players = 6, drills, recentDrillIds = [], seed = 1 }) {
  if (!levels?.length) throw new Error("Select at least one level");
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const rand = rng(seed);
  const recent = new Set(recentDrillIds);
  const used = new Set();

  const gameMinutes = game === true ? 20 : game || 0;
  const techMinutes =
    SESSION_MINUTES - FIXED.warmup - FIXED.break * FIXED.breaks - (serve ? FIXED.serve : 0) - gameMinutes;
  const units = techMinutes / UNIT;
  const slots = technicalSlots();
  const alloc = allocate(slots, units);

  const blocks = [
    { label: "Warm-up", categories: ["warmup"], type: null, minutes: FIXED.warmup },
    ...slots.map((s, i) => ({ ...s, minutes: alloc[i] * UNIT })),
    ...(serve ? [{ label: "Serve", categories: ["serve"], type: null, minutes: FIXED.serve }] : []),
    ...(gameMinutes ? [{ label: "Games", categories: ["game"], type: null, minutes: gameMinutes }] : []),
  ];

  const items = [];
  for (const b of blocks) {
    const drill = pick(drills, b, lo, hi, used, recent, players, rand);
    if (drill) used.add(drill.id);
    items.push({ kind: "drill", label: b.label, minutes: b.minutes, drill });
  }

  // Water breaks: insert before the block whose start is closest to 40' and 80'
  // (never before the warm-up).
  for (const target of [40, 80]) {
    let t = 0, best = 1, bestDiff = Infinity;
    items.forEach((it, i) => {
      if (i > 0 && Math.abs(t - target) < bestDiff) {
        bestDiff = Math.abs(t - target);
        best = i;
      }
      t += it.minutes;
    });
    items.splice(best, 0, { kind: "break", label: "Water break", minutes: FIXED.break });
  }

  let start = 0;
  for (const it of items) {
    it.start = start;
    start += it.minutes;
  }
  return items;
}

// Instruction for level `l`. Drills only carry notes for their own level range; a
// player outside it gets the nearest level's note with a cue to adjust.
export function noteFor(d, l) {
  const notes = d?.levelNotes || {};
  if (notes[l]) return notes[l];
  const near = Math.min(Math.max(l, d.minLevel), d.maxLevel);
  if (!notes[near]) return "";
  return l > near
    ? `Run the ${LEVELS[near]} version and step it up: faster feeds, smaller targets, more movement. (${notes[near]})`
    : `Run the ${LEVELS[near]} version and make it easier: closer, slower, softer balls. (${notes[near]})`;
}

export function totalMinutes(plan) {
  return plan.reduce((a, it) => a + it.minutes, 0);
}

const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export function planToText(plan, { levels, serve, game, players = 6 }) {
  const head = [
    `🎾 Training plan — ${levels.map((l) => LEVELS[l]).join(" + ")}`,
    `${players} players · ${SESSION_MINUTES} min · Serve ${serve ? "10'" : "off"} · Games ${game ? `${game === true ? 20 : game}'` : "off"}`,
    "",
  ];
  const lines = plan.map((it) => {
    if (it.kind === "break") return `${fmt(it.start)}  💧 Water break (${it.minutes}')`;
    const d = it.drill;
    let s = `${fmt(it.start)}  ${it.label}: ${d ? d.name : "—"} (${it.minutes}')`;
    if (d?.summary) s += `\n        ${d.summary}`;
    const org = d?.groupNotes?.[players]?.how;
    if (org) s += `\n        👥 ${players} players: ${org}`;
    for (const l of levels) {
      const n = d && noteFor(d, l);
      if (n) s += `\n        • ${LEVELS[l]}: ${n}`;
    }
    return s;
  });
  return [...head, ...lines].join("\n");
}
