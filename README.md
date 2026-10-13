# Tennis Training Planner

Builds a 2-hour tennis training session for the levels on court (Newbie, Beginner,
Upper Beginner, Intermediate — mix any of them), with optional Serve and Game time
blocks. Static site on GitHub Pages + Supabase free tier. $0.

Live: https://shanmarkusev.github.io/tennis-planner/

## What coaches get
- **Plan tab:** pick any mix of levels and the group size (4, 6 or 8 players, one court, one coach), generate, and tap a drill to open its coaching card:
  - a court diagram
  - setup, step-by-step instructions, coaching points and common mistakes with fixes
  - players, equipment and the success goal
  - how to organise **that many players** (lines, pairs, rotations, what waiting players do)
  - how to run it **for each selected level**
  - source links
- **Shuffle a single block:** each drill has **↻ Shuffle**, which picks another drill that fits the same block, levels and group size, and **Choose…** to pick one yourself. The rest of the plan and its timing stay the same, and no drill is repeated.
- **Drills tab:** browse the whole library (75 drills), filtered by the selected levels and by category.
- **History tab:** the last 10 saved sessions.

## How plans are built
Every plan follows the coach's playbook:

| # | Block | Minutes |
|---|---|---|
| 1 | Warm-up | 10 |
| 2 | Fed ball: forehand + backhand (technique correction) | the largest share |
| 3 | Racket feed across the net (moving FH/BH) | rest of technical time |
| 4 | Volley | 〃 |
| 5 | Mixed technique (FH, BH, short balls, volley, smash), from the `combo` drills | 〃 |
| 6 | Serve (optional) | 10 max |
| 7 | Games (Off / 15 / 20) | 15–20 |

There are two 5-minute water breaks, placed near the 40' and 80' marks. The total is always 120 minutes.

How drills are chosen:
- A drill must be doable by the **weakest** selected level. Drills that also stretch the strongest level are preferred.
- Every drill has a note for each level in its range. A selected level outside that range gets the nearest level's note with a "step it up" or "make it easier" cue.
- Drills rated unsuitable for the group size are skipped, and drills rated ideal for it are preferred.
- Drills used in the last 3 saved sessions are picked much less often.

To change the playbook, edit `technicalSlots()` and `FIXED` in `planner.js`.

## Files
| File | |
|---|---|
| `index.html` | UI |
| `planner.js` | pure session builder (`buildSession`) |
| `drills.js` | built-in drill library — offline fallback and DB seed |
| `db.js` / `config.js` | Supabase REST access (anon key is public; RLS guards it) |
| `supabase/schema.sql` | tables + RLS |
| `scripts/deploy-sql.mjs` | apply schema and seed drills |

## Editing drills
Edit rows in Supabase → Table Editor → `planner_drills`. Set `active=false` to hide a drill.
Changes show up on the next page load, with no redeploy. Levels: 0 Newbie … 3 Intermediate.

| Column | What it is |
|---|---|
| `summary`, `setup`, `players`, `equipment`, `success_target` | text |
| `steps`, `coaching_points`, `common_mistakes`, `sources` | text arrays |
| `level_notes` | JSON, e.g. `{"0": "foam balls, close feed", "3": "live ball"}` |
| `image_url` | optional: a link to **your own** photo (e.g. one taken on court), shown above the diagram |
| `video_url` | optional: a demo video link (e.g. YouTube) |
| `diagram` | JSON court diagram, see below |
| `group_notes` | JSON per group size: `{"8": {"fit": 1, "how": "two stations…"}}`. `fit` is 0 (never picked for that size), 1 (works with adaptation) or 2 (ideal, preferred) |

### Diagrams
Coordinates are in feet on a doubles court seen from above:
- `x` runs 0–36 across the court; the singles sidelines are at 4.5 and 31.5.
- `y` runs from 0 (the far baseline, coach side) to 78 (the near baseline, students' side). The net is at `y=39` and the service lines at 18 and 60.
- For a right-handed player on the near side, the forehand side is the larger `x`.
```json
{ "people":  [{"x": 18, "y": 76, "label": "P"}, {"x": 18, "y": 30, "label": "C"}],
  "cones":   [[9, 76], [27, 76]],
  "targets": [{"x": 4.5, "y": 0, "w": 9, "h": 12}],
  "balls":   [{"from": [18, 30], "to": [12, 70], "kind": "feed"}, {"from": [12, 70], "to": [8, 6], "kind": "shot"}],
  "moves":   [{"from": [18, 76], "to": [12, 72]}] }
```
Labels starting with `C` are drawn as the coach (red); every other label is a player (blue). A ball's `kind` is `feed`, `throw` or `shot`.

To push changes from `drills.js` instead: `npm run deploy-sql` (adds new drills) or
`node scripts/deploy-sql.mjs --overwrite` (also overwrites edited ones), and add `--prune`
to hide database drills that are no longer in `drills.js`.

## Drill content
The drills were researched from public coaching resources (LTA, USTA, ITF Play and Stay, Sportplan,
Active.com, coaching sites) and **rewritten**, not copied. Each drill lists its sources. Images from
those sites are copyrighted, so the app draws its own diagrams. Use `image_url` only for photos you own.

## Develop
```sh
npm install
npm test                       # 2,700 generated plans + 1,800 single-block swaps checked
python3 -m http.server 8000    # http://localhost:8000
```
`.env` (gitignored) needs `SUPABASE_DB_URL` = Supabase **Session pooler** URI.

## Notes
- Free Supabase projects pause after ~7 days idle. The app then shows an "Offline"
  banner and uses the built-in drills; restore the project in the Supabase dashboard.
- Deploy = `git push` to `main` (GitHub Pages).
