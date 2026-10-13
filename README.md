# Tennis Training Planner

Builds a 2-hour tennis training session for the levels on court (Newbie, Beginner,
Upper Beginner, Intermediate — mix any of them), with optional Serve and Game time
blocks. Static site on GitHub Pages + Supabase free tier. $0.

Live: https://shanmarkusev.github.io/tennis-planner/

## What coaches get
- **Plan tab:** pick any mix of levels, generate, and tap a drill to open its coaching card:
  - a court diagram
  - setup, step-by-step instructions, coaching points and common mistakes with fixes
  - players, equipment and the success goal
  - how to run it **for each selected level**
  - source links
- **Drills tab:** browse the whole library (75 drills), filtered by the selected levels and by category.
- **History tab:** the last 10 saved sessions.

## How plans are built
- Drills must be doable by the **weakest** selected level; drills that also stretch
  the strongest level are preferred. Every drill carries a note for each level in its range.
  A selected level outside that range gets the nearest level's note with a "step it up" or "make it easier" cue.
- Fixed blocks: warm-up 10', two 5' water breaks, cool-down 5', serve 15' (optional),
  game 20' (optional). The rest is split across forehand (static → moving),
  backhand (static → moving), net/movement and, if there's time, a live rally block.
  Lower groups get more static time; higher groups more moving/live time.
- Total is always exactly 120 min. Drills from the last 3 saved sessions are picked far less.

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
npm test                       # 1,200 generated plans sanity-checked
python3 -m http.server 8000    # http://localhost:8000
```
`.env` (gitignored) needs `SUPABASE_DB_URL` = Supabase **Session pooler** URI.

## Notes
- Free Supabase projects pause after ~7 days idle. The app then shows an "Offline"
  banner and uses the built-in drills; restore the project in the Supabase dashboard.
- Deploy = `git push` to `main` (GitHub Pages).
