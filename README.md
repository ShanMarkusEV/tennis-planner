# Tennis Training Planner

Builds a 2-hour tennis training session for the levels on court (Newbie, Beginner,
Upper Beginner, Intermediate — mix any of them), with optional Serve and Game time
blocks. Static site on GitHub Pages + Supabase free tier. $0.

Live: https://shanmarkusev.github.io/tennis-planner/

## How plans are built
- Drills must be doable by the **weakest** selected level; drills that also stretch
  the strongest level are preferred, and each drill's *mixed note* says how to adapt it.
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
Edit rows in Supabase → Table Editor → `planner_drills` (set `active=false` to hide one).
Changes show up on next page load, no redeploy. Levels: 0 Newbie … 3 Intermediate.

To push changes from `drills.js` instead: `npm run deploy-sql` (adds new drills) or
`node scripts/deploy-sql.mjs --overwrite` (also overwrites edited ones).

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
