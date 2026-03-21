-- Journal entries: free write, daily prompt, and gratitude entries
-- Populated by user; displayed in Journal app.

create table if not exists public.journal_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text,
  created_at timestamptz not null default now()
);

alter table public.journal_tags enable row level security;

create policy "Users can manage own journal tags"
  on public.journal_tags for all
  using (auth.uid() = user_id);

create table if not exists public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null default 'free_write', -- 'free_write' | 'prompt' | 'gratitude'
  title       text,
  content     text,
  prompt_text text,
  tags        uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

create policy "Users can manage own journal entries"
  on public.journal_entries for all
  using (auth.uid() = user_id);
