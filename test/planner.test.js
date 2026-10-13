// Sanity checks for buildSession across every level combo × toggle × seed.
import assert from "node:assert/strict";
import { buildSession, totalMinutes, planToText, noteFor, groupFit, SESSION_MINUTES, GROUP_SIZES, GAME_OPTIONS, alternativesFor, swapDrill } from "../planner.js";
import { DRILLS } from "../drills.js";

const combos = [];
for (let mask = 1; mask < 16; mask++) combos.push([0, 1, 2, 3].filter((l) => mask & (1 << l)));

let n = 0;
for (const levels of combos)
 for (const players of GROUP_SIZES)
  for (const serve of [false, true])
    for (const game of GAME_OPTIONS)
      for (let seed = 1; seed <= 10; seed++) {
        const plan = buildSession({ levels, serve, game, players, drills: DRILLS, seed });
        const ctx = JSON.stringify({ levels, players, serve, game, seed });
        const lo = Math.min(...levels);
        const drills = plan.filter((p) => p.kind === "drill");

        assert.equal(totalMinutes(plan), SESSION_MINUTES, `total ${ctx}`);
        assert.ok(drills.every((p) => p.drill), `missing drill ${ctx}`);
        const ids = drills.map((p) => p.drill.id);
        assert.equal(new Set(ids).size, ids.length, `repeat ${ctx}`);
        assert.ok(drills.every((p) => p.drill.minLevel <= lo), `too hard ${ctx}`);
        assert.equal(drills.some((p) => p.drill.category === "serve"), serve, `serve ${ctx}`);
        const games = drills.filter((p) => p.drill.category === "game");
        assert.equal(games.length, game ? 1 : 0, `game ${ctx}`);
        if (game) assert.equal(games[0].minutes, game, `game minutes ${ctx}`);
        // the playbook order
        const PLAYBOOK = ["Warm-up", "Fed ball · Forehand", "Fed ball · Backhand", "Racket feed across the net", "Volley", "Mixed technique",
          ...(serve ? ["Serve"] : []), ...(game ? ["Games"] : [])];
        assert.deepEqual(drills.map((p) => p.label), PLAYBOOK, `order ${ctx}`);
        const fed = drills.filter((p) => p.label.startsWith("Fed ball")).reduce((a, p) => a + p.minutes, 0);
        assert.ok(drills.every((p) => p.label.startsWith("Fed ball") || p.label === "Games" || fed >= p.minutes), `fed ball is the main block ${ctx}`);
        assert.equal(drills.find((p) => p.label === "Mixed technique").drill.category, "combo", ctx);
        assert.equal(plan.filter((p) => p.kind === "break").length, 2, `breaks ${ctx}`);
        for (const p of drills) {
          if (p.drill.category === "serve") assert.ok(p.minutes <= 10, `serve over 10 min ${ctx}`);
          assert.ok(groupFit(p.drill, players) > 0, `${p.drill.id} unsuitable for ${players} players ${ctx}`);
        }
        assert.equal(plan[0].label, "Warm-up", ctx);
        plan.forEach((p, i) => {
          assert.ok(p.minutes % 5 === 0 && p.minutes >= 5, `minutes ${ctx}`);
          if (i) assert.equal(p.start, plan[i - 1].start + plan[i - 1].minutes, `start ${ctx}`);
          if (i && p.kind === "break") assert.notEqual(plan[i - 1].kind, "break", `adjacent breaks ${ctx}`);
        });
        assert.ok(planToText(plan, { levels, serve, game, players }).includes(`${players} players`));
        // every drill has coaching content and notes for each selected level it covers
        for (const p of drills) {
          assert.ok(p.drill.steps.length >= 3 && p.drill.summary && p.drill.diagram, `content ${p.drill.id}`);
          for (const l of levels) assert.ok(noteFor(p.drill, l), `no instruction for ${p.drill.id} L${l}`);
        }
        n++;
      }

// Swapping one block changes only that block's drill and never creates a repeat.
let swaps = 0;
for (const levels of combos)
  for (const players of GROUP_SIZES)
    for (let seed = 1; seed <= 5; seed++) {
      const opts = { levels, players, serve: true, game: 20, drills: DRILLS };
      const plan = buildSession({ ...opts, seed });
      plan.forEach((it, i) => {
        if (it.kind !== "drill") return;
        const alts = alternativesFor(plan, i, opts);
        const next = swapDrill(plan, i, opts, { seed: seed * 31 + i });
        const ctx = JSON.stringify({ levels, players, seed, i });
        assert.equal(next.length, plan.length, ctx);
        next.forEach((x, j) => {
          assert.equal(x.minutes, plan[j].minutes, ctx);
          assert.equal(x.label, plan[j].label, ctx);
          if (j !== i) assert.equal(x.drill, plan[j].drill, `other block changed ${ctx}`);
        });
        if (alts.length) {
          assert.notEqual(next[i].drill.id, it.drill.id, `swap did nothing ${ctx}`);
          assert.ok(it.categories.includes(next[i].drill.category), `wrong block type ${ctx}`);
          assert.ok(next[i].drill.minLevel <= Math.min(...levels), `too hard ${ctx}`);
          swaps++;
        }
        const ids = next.filter((x) => x.drill).map((x) => x.drill.id);
        assert.equal(new Set(ids).size, ids.length, `repeat after swap ${ctx}`);
        // choosing a specific drill
        if (alts[0]) assert.equal(swapDrill(plan, i, opts, { drill: alts[0] })[i].drill.id, alts[0].id, ctx);
      });
    }

// Same seed → same plan; different seeds → variety.
const a = buildSession({ levels: [1, 2], serve: true, game: 20, drills: DRILLS, seed: 7 });
const b = buildSession({ levels: [1, 2], serve: true, game: 20, drills: DRILLS, seed: 7 });
assert.deepEqual(a, b);

// Recent drills are picked noticeably less often.
// Most frequently picked drill for this setup, so the check doesn't depend on drill ids.
const freq = {};
for (let seed = 1; seed <= 300; seed++)
  for (const x of buildSession({ levels: [1, 2], serve: false, game: false, drills: DRILLS, seed }))
    if (x.drill) freq[x.drill.id] = (freq[x.drill.id] || 0) + 1;
const target = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
const count = (recent) => {
  let hits = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const p = buildSession({ levels: [1, 2], serve: false, game: 0, drills: DRILLS, recentDrillIds: recent, seed });
    if (p.some((x) => x.drill?.id === target)) hits++;
  }
  return hits;
};
const fresh = count([]), recent = count([target]);
assert.ok(recent < fresh / 2, `recent penalty fresh=${fresh} recent=${recent}`);

console.log(`✓ ${n} plans valid · ${swaps} swaps ok · determinism ok · recent penalty ${target} ${fresh}→${recent}/300`);
