-- ==========================================================================
-- Migration 00025: Estacao Virtual Cotrim V2
-- ==========================================================================
-- Fundacao provider-agnostic para a camada climatica multi-API.
--
-- Decisoes da CLIMA 1:
--   1) A estacao representa uma LOCALIZACAO, nao um fornecedor.
--   2) Toda estacao pertence a uma fazenda.
--   3) O escopo pode ser fazenda, modulo ou pivo.
--   4) Resolucao para um pivo: pivo especifico > modulo > fazenda.
--   5) As quatro APIs ficam vinculadas como providers da mesma estacao.
--   6) Tudo nasce em shadow_mode=true e nao altera o balanco hidrico atual.
-- ==========================================================================

create table if not exists public.virtual_weather_stations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,

  -- Escopo espacial. module_id/pivot_id sao mutuamente exclusivos e a
  -- consistencia com scope_type e garantida pelo CHECK abaixo.
  scope_type text not null default 'farm'
    check (scope_type in ('farm', 'module', 'pivot')),
  module_id uuid references public.production_modules(id) on delete cascade,
  pivot_id uuid references public.pivots(id) on delete cascade,

  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  elevation_m double precision,
  timezone text not null default 'America/Bahia',
  target_resolution_minutes integer not null default 30
    check (target_resolution_minutes in (15, 30, 60)),
  shadow_mode boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint virtual_weather_station_scope_shape check (
    (scope_type = 'farm' and module_id is null and pivot_id is null)
    or
    (scope_type = 'module' and module_id is not null and pivot_id is null)
    or
    (scope_type = 'pivot' and module_id is null and pivot_id is not null)
  )
);

create index if not exists idx_virtual_weather_stations_farm
  on public.virtual_weather_stations(farm_id)
  where active = true;

create index if not exists idx_virtual_weather_stations_module
  on public.virtual_weather_stations(module_id)
  where active = true and scope_type = 'module';

create index if not exists idx_virtual_weather_stations_pivot
  on public.virtual_weather_stations(pivot_id)
  where active = true and scope_type = 'pivot';

-- Evita duas estacoes ativas concorrentes para o MESMO escopo. Estacoes
-- inativas permanecem preservadas para historico/auditoria.
create unique index if not exists uq_virtual_weather_station_farm_scope
  on public.virtual_weather_stations(farm_id)
  where active = true and scope_type = 'farm';

create unique index if not exists uq_virtual_weather_station_module_scope
  on public.virtual_weather_stations(module_id)
  where active = true and scope_type = 'module';

create unique index if not exists uq_virtual_weather_station_pivot_scope
  on public.virtual_weather_stations(pivot_id)
  where active = true and scope_type = 'pivot';

create table if not exists public.virtual_weather_station_providers (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,
  provider text not null
    check (provider in ('open_meteo', 'meteoblue', 'weatherapi', 'met_norway')),
  enabled boolean not null default true,
  priority integer not null default 1 check (priority between 1 and 10),
  role text not null default 'candidate'
    check (role in ('primary', 'candidate', 'fallback', 'audit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (virtual_station_id, provider)
);

create index if not exists idx_virtual_weather_station_providers_station
  on public.virtual_weather_station_providers(virtual_station_id, enabled, priority);

alter table public.virtual_weather_stations enable row level security;
alter table public.virtual_weather_station_providers enable row level security;

-- Acesso segue o mesmo padrao farm-scoped ja usado pelo projeto.
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
  'Estacao meteorologica virtual Cotrim, independente do provedor, com escopo fazenda/modulo/pivo. Shadow mode ate validacao operacional.';

comment on column public.virtual_weather_stations.scope_type is
  'Hierarquia de resolucao: pivot > module > farm.';

comment on table public.virtual_weather_station_providers is
  'Vincula Open-Meteo, Meteoblue, WeatherAPI e MET Norway a uma unica estacao virtual Cotrim.';
