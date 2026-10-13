// Sanity checks for buildSession across every level combo × toggle × seed.
import assert from "node:assert/strict";
import { buildSession, totalMinutes, planToText, SESSION_MINUTES } from "../planner.js";
import { DRILLS } from "../drills.js";

const combos = [];
for (let mask = 1; mask < 16; mask++) combos.push([0, 1, 2, 3].filter((l) => mask & (1 << l)));

let n = 0;
for (const levels of combos)
  for (const serve of [false, true])
    for (const game of [false, true])
      for (let seed = 1; seed <= 20; seed++) {
        const plan = buildSession({ levels, serve, game, drills: DRILLS, seed });
        const ctx = JSON.stringify({ levels, serve, game, seed });
        const lo = Math.min(...levels);
        const drills = plan.filter((p) => p.kind === "drill");

        assert.equal(totalMinutes(plan), SESSION_MINUTES, `total ${ctx}`);
        assert.ok(drills.every((p) => p.drill), `missing drill ${ctx}`);
        const ids = drills.map((p) => p.drill.id);
        assert.equal(new Set(ids).size, ids.length, `repeat ${ctx}`);
        assert.ok(drills.every((p) => p.drill.minLevel <= lo), `too hard ${ctx}`);
        assert.equal(drills.some((p) => p.drill.category === "serve"), serve, `serve ${ctx}`);
        assert.equal(drills.some((p) => p.drill.category === "game"), game, `game ${ctx}`);
        assert.equal(plan.filter((p) => p.kind === "break").length, 2, `breaks ${ctx}`);
        assert.equal(plan[0].label, "Warm-up", ctx);
        assert.equal(plan.at(-1).label, "Cool-down", ctx);
        plan.forEach((p, i) => {
          assert.ok(p.minutes % 5 === 0 && p.minutes >= 5, `minutes ${ctx}`);
          if (i) assert.equal(p.start, plan[i - 1].start + plan[i - 1].minutes, `start ${ctx}`);
          if (i && p.kind === "break") assert.notEqual(plan[i - 1].kind, "break", `adjacent breaks ${ctx}`);
        });
        assert.ok(planToText(plan, { levels, serve, game }).includes("Warm-up"));
        n++;
      }

// Same seed → same plan; different seeds → variety.
const a = buildSession({ levels: [1, 2], serve: true, game: true, drills: DRILLS, seed: 7 });
const b = buildSession({ levels: [1, 2], serve: true, game: true, drills: DRILLS, seed: 7 });
assert.deepEqual(a, b);

// Recent drills are picked noticeably less often.
const count = (recent) => {
  let hits = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const p = buildSession({ levels: [1, 2], serve: false, game: false, drills: DRILLS, recentDrillIds: recent, seed });
    if (p.some((x) => x.drill?.id === "fh-side")) hits++;
  }
  return hits;
};
const fresh = count([]), recent = count(["fh-side"]);
assert.ok(recent < fresh / 2, `recent penalty fresh=${fresh} recent=${recent}`);

console.log(`✓ ${n} plans valid · determinism ok · recent penalty fh-side ${fresh}→${recent}/300`);
