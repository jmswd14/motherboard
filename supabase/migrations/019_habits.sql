-- Habits: recurring tracked behaviours (building or breaking)
-- Populated by user; displayed in Habits → Today / Progress tabs.

create table if not exists public.habits (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  type             text not null default 'yes_no',   -- 'yes_no' | 'numeric'
  habit_direction  text not null default 'building', -- 'building' | 'breaking'
  target_value     numeric,
  unit             text,
  emoji            text,
  color            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.habits enable row level security;

create policy "Users can manage own habits"
  on public.habits for all
  using (auth.uid() = user_id);

-- Habit logs: one row per habit per day (the check-in record)
create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  date       date not null,
  completed  boolean not null default false,
  value      numeric,
  note       text,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

alter table public.habit_logs enable row level security;

create policy "Users can manage own habit logs"
  on public.habit_logs for all
  using (auth.uid() = user_id);
