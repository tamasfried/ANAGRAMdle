-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists public.game_progress (
  id uuid references auth.users(id) on delete cascade primary key,
  puzzle_day integer not null default 0,
  guesses jsonb not null default '[]'::jsonb,
  results jsonb not null default '[]'::jsonb,
  over boolean not null default false,
  won boolean not null default false,
  hint_used boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.stats (
  id uuid references auth.users(id) on delete cascade primary key,
  played integer not null default 0,
  wins integer not null default 0,
  current_streak integer not null default 0,
  max_streak integer not null default 0,
  distribution integer[] not null default '{0,0,0,0,0,0}',
  updated_at timestamptz not null default now()
);

alter table public.game_progress enable row level security;
alter table public.stats enable row level security;

create policy "select own progress" on public.game_progress
  for select using (auth.uid() = id);
create policy "insert own progress" on public.game_progress
  for insert with check (auth.uid() = id);
create policy "update own progress" on public.game_progress
  for update using (auth.uid() = id);

create policy "select own stats" on public.stats
  for select using (auth.uid() = id);
create policy "insert own stats" on public.stats
  for insert with check (auth.uid() = id);
create policy "update own stats" on public.stats
  for update using (auth.uid() = id);
