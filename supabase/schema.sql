-- Tennis Training Planner schema. Idempotent: safe to re-run.
-- Applied with: node scripts/deploy-sql.mjs

create table if not exists planner_drills (
  id          text primary key,
  name        text not null,
  category    text not null check (category in
                ('warmup','forehand','backhand','net','movement','rally','serve','game','cooldown')),
  type        text not null check (type in ('static','moving','live')),
  min_level   int  not null check (min_level between 0 and 3),
  max_level   int  not null check (max_level between 0 and 3),
  intensity   int  not null default 2 check (intensity between 1 and 3),
  cues        text not null default '',
  mixed_note  text not null default '',
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  check (min_level <= max_level)
);

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
