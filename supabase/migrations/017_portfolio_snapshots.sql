-- Portfolio snapshots: daily EOD portfolio value per positions account
-- Populated by the daily-snapshot Edge Function (runs ~6pm ET via pg_cron).
-- Used by the performance chart as the source of truth for historical values.

create table if not exists public.portfolio_snapshots (
  id         uuid primary key default gen_random_uuid(),
  asset_id   uuid not null references public.assets(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  value      numeric not null default 0,
  created_at timestamptz not null default now(),
  unique(asset_id, date)
);

alter table public.portfolio_snapshots enable row level security;

create policy "Users can read own portfolio snapshots"
  on public.portfolio_snapshots for select
  using (auth.uid() = user_id);

-- Service role (used by Edge Function) bypasses RLS automatically.

-- ── SCHEDULE via pg_cron ──────────────────────────────────────────────────────
-- Run after enabling the pg_cron and pg_net extensions in the Supabase dashboard.
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY below, then run in SQL editor.
--
-- select cron.schedule(
--   'daily-portfolio-snapshot',
--   '0 22 * * 1-5',   -- 10pm UTC = ~6pm ET, weekdays only
--   $$
--   select net.http_post(
--     url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/daily-snapshot',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
