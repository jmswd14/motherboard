create table if not exists map_countries (
  id           uuid primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  country_code text not null,
  status       text not null,
  created_at   timestamptz default now(),
  constraint map_countries_user_country unique (user_id, country_code)
);
alter table map_countries enable row level security;
create policy "map_countries_user" on map_countries for all using (auth.uid() = user_id);

create table if not exists map_pins (
  id         uuid primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  lat        double precision not null,
  lng        double precision not null,
  title      text not null,
  notes      text,
  created_at timestamptz default now()
);
alter table map_pins enable row level security;
create policy "map_pins_user" on map_pins for all using (auth.uid() = user_id);
