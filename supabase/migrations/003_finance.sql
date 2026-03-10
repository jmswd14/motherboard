-- Finance Tracker: assets and asset_logs tables
-- Run this in the Supabase dashboard SQL editor.

-- ── ASSETS ────────────────────────────────────────────────────────────────────

create table if not exists public.assets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  type              text not null,                  -- Checking, Retirement, Brokerage, etc.
  currency          text not null default 'USD',    -- USD, GBP, EUR, BTC, etc.
  update_cycle_day  int,                            -- day of month to log by (1–28), nullable
  notes             text,
  created_at        timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "Users can manage own assets"
  on public.assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── ASSET LOGS ────────────────────────────────────────────────────────────────

create table if not exists public.asset_logs (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid not null references public.assets(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      numeric not null,         -- value in the asset's native currency
  logged_at  date not null,            -- the date this value was recorded
  notes      text,
  created_at timestamptz not null default now()
);

alter table public.asset_logs enable row level security;

create policy "Users can manage own asset logs"
  on public.asset_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for efficient per-asset log queries
create index if not exists asset_logs_asset_id_logged_at
  on public.asset_logs (asset_id, logged_at);
