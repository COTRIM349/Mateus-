-- ==========================================================================
-- Migration 00025: Estacao Virtual Cotrim V2
-- ==========================================================================
-- Fundacao provider-agnostic para a camada climatica multi-API.
-- Nao altera o fluxo operacional atual nem o balanco hidrico.
-- ==========================================================================

create table if not exists public.virtual_weather_stations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  elevation_m double precision,
  timezone text not null default 'America/Bahia',
  target_resolution_minutes integer not null default 30 check (target_resolution_minutes in (15, 30, 60)),
  shadow_mode boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_virtual_weather_stations_farm
  on public.virtual_weather_stations(farm_id)
  where active = true;

create table if not exists public.virtual_weather_station_providers (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null references public.virtual_weather_stations(id) on delete cascade,
  provider text not null check (provider in ('open_meteo', 'meteoblue', 'weatherapi', 'met_norway')),
  enabled boolean not null default true,
  priority integer not null default 1 check (priority between 1 and 10),
  role text not null default 'candidate' check (role in ('primary', 'candidate', 'fallback', 'audit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (virtual_station_id, provider)
);

create index if not exists idx_virtual_weather_station_providers_station
  on public.virtual_weather_station_providers(virtual_station_id, enabled, priority);

alter table public.virtual_weather_stations enable row level security;
alter table public.virtual_weather_station_providers enable row level security;

-- Acesso segue o mesmo padrao ja usado pelas demais tabelas farm-scoped.
create policy "virtual weather stations readable by farm access"
  on public.virtual_weather_stations
  for select
  using (farm_id in (select public.auth_farm_ids()));

create policy "virtual weather stations manageable by farm access"
  on public.virtual_weather_stations
  for all
  using (farm_id in (select public.auth_farm_ids()))
  with check (farm_id in (select public.auth_farm_ids()));

create policy "virtual weather station providers readable by farm access"
  on public.virtual_weather_station_providers
  for select
  using (
    exists (
      select 1
      from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "virtual weather station providers manageable by farm access"
  on public.virtual_weather_station_providers
  for all
  using (
    exists (
      select 1
      from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  )
  with check (
    exists (
      select 1
      from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

comment on table public.virtual_weather_stations is
  'Estacao meteorologica virtual Cotrim, independente do provedor. Mantida em shadow mode ate validacao operacional.';

comment on table public.virtual_weather_station_providers is
  'Vincula as quatro fontes climaticas a uma unica estacao virtual Cotrim.';
