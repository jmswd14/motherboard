-- ── SCHEDULED NOTIFICATION DISPATCH ──────────────────────────────────────────
-- Requires pg_cron and pg_net extensions.
-- Enable both via: Supabase Dashboard → Database → Extensions
-- Then run this file in the SQL Editor.

-- ── Dispatch function ─────────────────────────────────────────────────────────
create or replace function public.dispatch_notifications()
returns void
language plpgsql
security definer
as $$
declare
  r          record;
  names      text[];
  cnt        int;
  ttl        text;
  msg        text;
  lnk        text;
  do_notify  bool;
begin
  for r in
    select
      uns.user_id,
      uns.type,
      u.email,
      coalesce(u.raw_user_meta_data->>'display_name', '') as display_name
    from public.user_notification_settings uns
    join auth.users u on u.id = uns.user_id
    where uns.enabled = true
      -- match the current 15-minute bucket in UTC
      and extract(hour from uns.time)
            = extract(hour from (now() at time zone 'UTC')::time)
      and floor(extract(minute from uns.time) / 15)
            = floor(extract(minute from (now() at time zone 'UTC')::time) / 15)
      -- not already notified today
      and not exists (
        select 1 from public.notifications n
        where n.user_id    = uns.user_id
          and n.type       = uns.type
          and n.created_at >= current_date::timestamptz
          and n.created_at <  (current_date + 1)::timestamptz
      )
  loop
    do_notify := false;
    names     := null;
    ttl       := null;
    msg       := null;
    lnk       := null;
    cnt       := 0;

    case r.type

      when 'task_due_today' then
        names := array(
          select name from public.tasks
          where user_id = r.user_id and due = current_date and done = false
          order by position limit 10
        );
        cnt := coalesce(array_length(names, 1), 0);
        if cnt > 0 then
          do_notify := true;
          ttl := cnt || ' task' || case when cnt > 1 then 's' else '' end || ' due today';
          msg := array_to_string(names, ', ');
          lnk := 'tasks/index.html';
        end if;

      when 'task_overdue' then
        names := array(
          select name from public.tasks
          where user_id = r.user_id and due < current_date and done = false
          order by due limit 10
        );
        cnt := coalesce(array_length(names, 1), 0);
        if cnt > 0 then
          do_notify := true;
          ttl := cnt || ' overdue task' || case when cnt > 1 then 's' else '' end;
          msg := array_to_string(names, ', ');
          lnk := 'tasks/index.html';
        end if;

      when 'habit_checkin' then
        names := array(
          select h.name from public.habits h
          where h.user_id = r.user_id and h.active = true
            and not exists (
              select 1 from public.habit_logs hl
              where hl.habit_id = h.id
                and hl.date = current_date
                and hl.completed = true
            )
          order by h.created_at limit 10
        );
        cnt := coalesce(array_length(names, 1), 0);
        if cnt > 0 then
          do_notify := true;
          ttl := cnt || ' habit' || case when cnt > 1 then 's' else '' end || ' to check in';
          msg := array_to_string(names, ', ');
          lnk := 'habits/index.html';
        end if;

      when 'journal_prompt' then
        do_notify := true;
        ttl := 'Your journal is waiting';
        msg := 'Take a few minutes to reflect.';
        lnk := 'journal/index.html';

      else null;
    end case;

    if do_notify then
      -- Insert in-app notification
      insert into public.notifications (user_id, type, title, message, read, link)
      values (r.user_id, r.type, ttl, msg, false, lnk);

      -- Send email via Edge Function (JWT verification is disabled on this function)
      perform net.http_post(
        url     := 'https://znhwyzgccojbjaivzllp.supabase.co/functions/v1/send-notification',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := jsonb_build_object(
          'to',           r.email,
          'subject',      ttl,
          'body',         msg,
          'user_id',      r.user_id::text,
          'type',         r.type,
          'link',         lnk,
          'items',        to_jsonb(names),
          'display_name', r.display_name
        )
      );
    end if;
  end loop;
end;
$$;

-- ── Schedule: runs every 15 minutes ──────────────────────────────────────────
select cron.schedule(
  'notification-dispatch',
  '*/15 * * * *',
  'select public.dispatch_notifications()'
);
