-- ==========================================================================
-- Migration 00026: armazenamento climatico V2 em shadow mode
-- ==========================================================================
-- Fecha o terceiro ponto da CLIMA 1:
--   • weather_readings continua sendo a tabela diaria legada.
--   • payloads externos ficam preservados de forma imutavel.
--   • cada provider gera candidatos normalizados de 30 minutos separados.
--   • ausencia continua NULL; nunca e convertida para zero.
--   • previsao e observado continuam separados por data_type/issued_at.
-- ==========================================================================

create table if not exists public.weather_provider_payloads_raw (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,
  provider text not null
    check (provider in ('open_meteo', 'meteoblue', 'weatherapi', 'met_norway')),
  data_type text not null
    check (data_type in ('observed', 'forecast', 'reanalysis', 'estimated')),
  model_name text,
  forecast_issued_at timestamptz,
  fetched_at timestamptz not null default now(),
  request_started_at timestamptz,
  request_finished_at timestamptz,
  request_latitude double precision not null check (request_latitude between -90 and 90),
  request_longitude double precision not null check (request_longitude between -180 and 180),
  request_timezone text not null,
  request_url text,
  http_status integer,
  response_latitude double precision,
  response_longitude double precision,
  response_elevation_m double precision,
  source_resolution_minutes integer,
  provider_interpolated boolean,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_weather_provider_payloads_station_provider_fetched
  on public.weather_provider_payloads_raw(virtual_station_id, provider, fetched_at desc);

create table if not exists public.weather_interval_30m_candidates (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,
  raw_payload_id uuid not null
    references public.weather_provider_payloads_raw(id) on delete restrict,
  provider text not null
    check (provider in ('open_meteo', 'meteoblue', 'weatherapi', 'met_norway')),
  data_type text not null
    check (data_type in ('observed', 'forecast', 'reanalysis', 'estimated')),
  model_name text,
  forecast_issued_at timestamptz,

  interval_start timestamptz not null,
  interval_end timestamptz not null,
  local_date date not null,

  temperature_c double precision,
  relative_humidity_pct double precision,
  dew_point_c double precision,
  precipitation_mm double precision,
  wind_speed_10m_ms double precision,
  wind_speed_2m_ms double precision,
  wind_direction_deg double precision,
  solar_radiation_wm2 double precision,
  surface_pressure_kpa double precision,
  vapour_pressure_deficit_kpa double precision,

  source_resolution_minutes integer,
  target_resolution_minutes integer not null default 30
    check (target_resolution_minutes = 30),
  interpolated boolean not null default false,
  estimated boolean not null default false,
  quality_status text not null default 'partial'
    check (quality_status in ('complete', 'partial', 'stale', 'missing', 'invalid', 'suspicious', 'unavailable', 'estimated')),
  missing_fields text[] not null default '{}',
  warnings text[] not null default '{}',
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint weather_30m_positive_interval check (interval_end > interval_start),
  constraint weather_30m_rh_range check (
    relative_humidity_pct is null or relative_humidity_pct between 0 and 100
  ),
  constraint weather_30m_wind_dir_range check (
    wind_direction_deg is null or wind_direction_deg between 0 and 360
  )
);

create index if not exists idx_weather_30m_station_time
  on public.weather_interval_30m_candidates(virtual_station_id, interval_start desc);

create index if not exists idx_weather_30m_station_provider_time
  on public.weather_interval_30m_candidates(virtual_station_id, provider, interval_start desc);

create index if not exists idx_weather_30m_local_date
  on public.weather_interval_30m_candidates(virtual_station_id, local_date, provider);

alter table public.weather_provider_payloads_raw enable row level security;
alter table public.weather_interval_30m_candidates enable row level security;

-- RAW e imutavel pela aplicacao: SELECT + INSERT, sem UPDATE/DELETE.
create policy "weather raw readable by farm access"
  on public.weather_provider_payloads_raw
  for select
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "weather raw insertable by farm access"
  on public.weather_provider_payloads_raw
  for insert
  with check (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

-- Candidatos normalizados tambem sao append-only para preservar auditoria.
create policy "weather 30m readable by farm access"
  on public.weather_interval_30m_candidates
  for select
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "weather 30m insertable by farm access"
  on public.weather_interval_30m_candidates
  for insert
  with check (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

comment on table public.weather_provider_payloads_raw is
  'Payload bruto imutavel das APIs climaticas V2. Base para auditoria e reprocessamento.';

comment on table public.weather_interval_30m_candidates is
  'Candidatos climaticos normalizados em intervalos de 30 min, um fluxo separado por provider. Ainda nao alimenta o balanco hidrico.';
