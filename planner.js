// Session builder. Pure: same inputs + seed → same plan. No DOM, no network.

export const LEVELS = ["Newbie", "Beginner", "Upper Beginner", "Intermediate"];
export const SESSION_MINUTES = 120;

const UNIT = 5; // every block is a multiple of 5 minutes
const FIXED = { warmup: 10, cooldown: 5, break: 5, breaks: 2, serve: 15, game: 20 };
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

// Technical slots, in teaching order. Weights decide how the free minutes
// are split; static work gets more time for lower groups, live/moving for higher.
function technicalSlots(lo, hi, units) {
  const low = hi <= 1;
  const slots = [
    { key: "fh-static", label: "Forehand", categories: ["forehand"], type: "static", w: low ? 1.2 : 0.8 },
    { key: "fh-moving", label: "Forehand", categories: ["forehand"], type: "moving", w: low ? 0.8 : 1.2 },
    { key: "bh-static", label: "Backhand", categories: ["backhand"], type: "static", w: low ? 1.2 : 0.8 },
    { key: "bh-moving", label: "Backhand", categories: ["backhand"], type: "moving", w: low ? 0.8 : 1.2 },
    {
      key: "net",
      label: hi === 0 ? "Movement" : "Net",
      // Newbie-only groups do footwork instead of volleys; mixed groups with
      // newbies may get either.
      categories: hi === 0 ? ["movement"] : lo === 0 ? ["net", "movement"] : ["net"],
      type: null,
      w: 0.9,
    },
  ];
  // With enough time, add a live rally block to tie the strokes together.
  if (units >= 15) slots.push({ key: "rally", label: "Rally", categories: ["rally"], type: "live", w: lo >= 2 ? 1.2 : 0.9 });
  return slots;
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

function weight(d, lo, hi, recent) {
  let w = d.maxLevel >= hi ? 3 : 0.3; // challenges the strongest player
  if (d.minLevel === lo) w *= 1.5; // pitched right at the weakest player
  if (recent.has(d.id)) w *= RECENT_WEIGHT;
  return w;
}

function pick(drills, slot, lo, hi, used, recent, rand) {
  const ok = (d) => !used.has(d.id) && d.minLevel <= lo && slot.categories.includes(d.category);
  let pool = drills.filter((d) => ok(d) && (!slot.type || d.type === slot.type));
  if (!pool.length) pool = drills.filter(ok); // relax the static/moving split
  if (!pool.length) pool = drills.filter((d) => !used.has(d.id) && slot.categories.includes(d.category));
  if (!pool.length) return null;
  const ws = pool.map((d) => weight(d, lo, hi, recent));
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= ws[i]) < 0) return pool[i];
  return pool[pool.length - 1];
}

/**
 * @param {object} o
 * @param {number[]} o.levels          selected level indexes (0..3), at least one
 * @param {boolean} o.serve            include a serve block
 * @param {boolean} o.game             include game time
 * @param {object[]} o.drills          drill library (see drills.js)
 * @param {string[]} [o.recentDrillIds] drills used in recent saved sessions
 * @param {number} [o.seed]
 * @returns {{start:number, minutes:number, kind:"drill"|"break", label:string, drill?:object}[]}
 */
export function buildSession({ levels, serve, game, drills, recentDrillIds = [], seed = 1 }) {
  if (!levels?.length) throw new Error("Select at least one level");
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const rand = rng(seed);
  const recent = new Set(recentDrillIds);
  const used = new Set();

  const techMinutes =
    SESSION_MINUTES - FIXED.warmup - FIXED.cooldown - FIXED.break * FIXED.breaks -
    (serve ? FIXED.serve : 0) - (game ? FIXED.game : 0);
  const units = techMinutes / UNIT;
  const slots = technicalSlots(lo, hi, units);
  const alloc = allocate(slots, units);

  const blocks = [
    { label: "Warm-up", categories: ["warmup"], type: null, minutes: FIXED.warmup },
    ...slots.map((s, i) => ({ ...s, minutes: alloc[i] * UNIT })),
    ...(serve ? [{ label: "Serve", categories: ["serve"], type: null, minutes: FIXED.serve }] : []),
    ...(game ? [{ label: "Game time", categories: ["game"], type: null, minutes: FIXED.game }] : []),
    { label: "Cool-down", categories: ["cooldown"], type: null, minutes: FIXED.cooldown },
  ];

  const items = [];
  for (const b of blocks) {
    const drill = pick(drills, b, lo, hi, used, recent, rand);
    if (drill) used.add(drill.id);
    items.push({ kind: "drill", label: b.label, minutes: b.minutes, drill });
  }

  // Water breaks: insert before the block whose start is closest to 40' and 80'
  // (never before the warm-up or the cool-down).
  for (const target of [40, 80]) {
    let t = 0, best = 1, bestDiff = Infinity;
    items.forEach((it, i) => {
      if (i > 0 && i < items.length - 1 && Math.abs(t - target) < bestDiff) {
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

export function totalMinutes(plan) {
  return plan.reduce((a, it) => a + it.minutes, 0);
}

const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export function planToText(plan, { levels, serve, game }) {
  const head = [
    `🎾 Training plan — ${levels.map((l) => LEVELS[l]).join(" + ")}`,
    `${SESSION_MINUTES} min · Serve ${serve ? "✓" : "✗"} · Game ${game ? "✓" : "✗"}`,
    "",
  ];
  const mixed = Math.max(...levels) > Math.min(...levels);
  const lines = plan.map((it) => {
    if (it.kind === "break") return `${fmt(it.start)}  💧 Water break (${it.minutes}')`;
    const d = it.drill;
    let s = `${fmt(it.start)}  ${it.label}: ${d ? d.name : "—"} (${it.minutes}')`;
    if (d?.cues) s += `\n        ${d.cues}`;
    if (mixed && d?.mixedNote) s += `\n        Mixed: ${d.mixedNote}`;
    return s;
  });
  return [...head, ...lines].join("\n");
}
