-- ── NOTIFICATIONS ──────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null,                       -- task, habit, journal, finance, system
  title        text not null,
  message      text not null default '',
  read         boolean not null default false,
  link         text,                                -- optional navigation URL
  created_at   timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "Users can read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "Service role can insert notifications"
  on public.notifications for insert
  with check (true);

create index if not exists notifications_user_id_read
  on public.notifications (user_id, read, created_at desc);


-- ── USER NOTIFICATION SETTINGS ─────────────────────────────────────────────

create table if not exists public.user_notification_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,                        -- task_due_today, task_overdue, habit_checkin, journal_prompt, finance_asset_due
  enabled     boolean not null default false,
  time        time not null default '09:00:00',     -- stored in 24h
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, type)
);

alter table public.user_notification_settings enable row level security;

create policy "Users can manage own notification settings"
  on public.user_notification_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── USER PREFERENCES ───────────────────────────────────────────────────────

create table if not exists public.user_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,                        -- theme, font_size, week_starts_on, calendar_default_view
  value       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.user_preferences enable row level security;

create policy "Users can manage own preferences"
  on public.user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── TASK REMINDERS ─────────────────────────────────────────────────────────

create table if not exists public.task_reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  remind_at   timestamptz not null,
  unit        text not null,                        -- minutes, hours, days
  amount      integer not null,
  sent        boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.task_reminders enable row level security;

create policy "Users can manage own task reminders"
  on public.task_reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role can update task reminders"
  on public.task_reminders for update
  using (true);

create index if not exists task_reminders_remind_at
  on public.task_reminders (remind_at) where sent = false;


-- ── pg_cron: HOURLY NOTIFICATION JOB ──────────────────────────────────────
-- Run the following AFTER enabling the pg_cron and pg_net extensions
-- in the Supabase dashboard (Database → Extensions).
--
-- The job fires every hour at minute 0 and calls the send-notification
-- Edge Function for any enabled notification type whose scheduled time
-- falls within the current hour.
--
-- Replace <PROJECT_REF> with your Supabase project reference.

/*

select cron.schedule(
  'hourly-notifications',
  '0 * * * *',
  $$
  -- ── 1. Per-type notification emails ──────────────────────────────────────
  select
    net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := jsonb_build_object(
        'to',      u.email,
        'subject', case uns.type
                     when 'task_due_today'    then 'Tasks due today — Vanguard'
                     when 'task_overdue'      then 'Overdue tasks — Vanguard'
                     when 'habit_checkin'     then 'Habit check-in — Vanguard'
                     when 'journal_prompt'    then 'Journal prompt — Vanguard'
                     when 'finance_asset_due' then 'Asset update due — Vanguard'
                   end,
        'html',    '<p>Your scheduled Vanguard notification: ' || uns.type || '</p>'
      )
    )
  from public.user_notification_settings uns
  join auth.users u on u.id = uns.user_id
  where uns.enabled = true
    and extract(hour from uns.time at time zone 'UTC') = extract(hour from now() at time zone 'UTC');

  -- ── 2. Task reminder emails ───────────────────────────────────────────────
  select
    net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := jsonb_build_object(
        'to',      u.email,
        'subject', 'Task reminder — Vanguard',
        'html',    '<p>Reminder: your task is due soon.</p>'
      )
    )
  from public.task_reminders tr
  join auth.users u on u.id = tr.user_id
  where tr.sent = false
    and tr.remind_at <= now()
    and tr.remind_at > now() - interval '1 hour';

  -- Mark sent
  update public.task_reminders
  set    sent = true
  where  sent = false
    and  remind_at <= now()
    and  remind_at > now() - interval '1 hour';
  $$
);

*/
