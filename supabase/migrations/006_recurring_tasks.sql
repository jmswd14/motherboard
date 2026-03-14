-- ── RECURRING TASKS ────────────────────────────────────────────────────────
-- Templates for tasks that auto-generate on a schedule.
-- Generated instances are regular rows in the tasks table with recurring_task_id set.

CREATE TABLE public.recurring_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  list_id             UUID REFERENCES public.lists(id) ON DELETE SET NULL,
  priority            TEXT DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  tags                UUID[] DEFAULT '{}',
  notes               TEXT DEFAULT '',
  frequency           TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  frequency_day       INTEGER, -- NULL=daily, 0-6=weekly (0=Sun), 1-28=monthly
  last_generated_date DATE,    -- prevents duplicate generation on same day
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own recurring tasks"
  ON public.recurring_tasks
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Link generated task instances back to their template
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurring_task_id UUID REFERENCES public.recurring_tasks(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurring_date DATE;
