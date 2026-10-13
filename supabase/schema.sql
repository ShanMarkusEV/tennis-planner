-- Tennis Training Planner schema. Idempotent: safe to re-run.
-- Applied with: node scripts/deploy-sql.mjs

create table if not exists planner_drills (
  id          text primary key,
  name        text not null,
  category    text not null,
  type        text not null,
  min_level   int  not null,
  max_level   int  not null,
  intensity   int  not null default 2,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Coaching content (v2). Arrays/JSON are editable in the Supabase Table Editor.
alter table planner_drills
  add column if not exists summary         text   not null default '',
  add column if not exists players         text   not null default '',
  add column if not exists equipment       text   not null default '',
  add column if not exists setup           text   not null default '',
  add column if not exists steps           text[] not null default '{}',
  add column if not exists coaching_points text[] not null default '{}',
  add column if not exists common_mistakes text[] not null default '{}',
  add column if not exists level_notes     jsonb  not null default '{}',   -- {"0": "...", "3": "..."}
  add column if not exists success_target  text   not null default '',
  add column if not exists diagram         jsonb,                          -- see README "Diagrams"
  add column if not exists image_url       text,                           -- your own photo (optional)
  add column if not exists video_url       text,                           -- demo video link (optional)
  add column if not exists sources         text[] not null default '{}';
alter table planner_drills drop column if exists cues, drop column if exists mixed_note;

alter table planner_drills drop constraint if exists planner_drills_category_check;
alter table planner_drills add constraint planner_drills_category_check check (category in
  ('warmup','forehand','backhand','net','movement','rally','serve','game','cooldown'));
alter table planner_drills drop constraint if exists planner_drills_type_check;
alter table planner_drills add constraint planner_drills_type_check check (type in ('static','moving','live'));
alter table planner_drills drop constraint if exists planner_drills_levels_check;
alter table planner_drills add constraint planner_drills_levels_check
  check (min_level between 0 and 3 and max_level between 0 and 3 and min_level <= max_level);

create table if not exists planner_sessions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  levels      int[] not null check (cardinality(levels) between 1 and 4),
  serve       boolean not null,
  game        boolean not null,
  -- [{start, minutes, kind, label, drillId}]
  plan        jsonb not null check (jsonb_typeof(plan) = 'array' and jsonb_array_length(plan) <= 40)
);
create index if not exists planner_sessions_created_idx on planner_sessions (created_at desc);

-- RLS: the static site uses the public anon key.
--   drills:   read active rows only (edit via the Supabase dashboard)
--   sessions: read + insert; no update/delete
alter table planner_drills   enable row level security;
alter table planner_sessions enable row level security;

drop policy if exists drills_read on planner_drills;
create policy drills_read on planner_drills for select to anon, authenticated using (active);

drop policy if exists sessions_read on planner_sessions;
create policy sessions_read on planner_sessions for select to anon, authenticated using (true);

drop policy if exists sessions_insert on planner_sessions;
create policy sessions_insert on planner_sessions for insert to anon, authenticated with check (true);

revoke all on planner_drills, planner_sessions from anon, authenticated;
grant select on planner_drills to anon, authenticated;
grant select, insert on planner_sessions to anon, authenticated;
