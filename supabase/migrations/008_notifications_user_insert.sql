-- Allow authenticated users to insert their own notification rows directly.
-- This removes the dependency on the Edge Function for in-app notifications.
create policy "Users can insert own notifications"
  on public.notifications for insert
  with check (auth.uid() = user_id);
