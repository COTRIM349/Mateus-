-- ==========================================================================
-- Migration 00027: qualidade, divergencia e consenso climatico em Shadow Mode
-- ==========================================================================
-- Regras:
--   * candidatos originais permanecem imutaveis;
--   * cada avaliacao de consenso e append-only/auditavel;
--   * provider != modelo independente: preservamos provider + model_name;
--   * chuva possui decisao separada e nunca recebe media cega;
--   * esta camada NAO alimenta weather_readings nem water_balances.
-- ==========================================================================

create table if not exists public.weather_interval_30m_consensus_shadow (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,

  interval_start timestamptz not null,
  interval_end timestamptz not null,
  local_date date not null,
  evaluated_at timestamptz not null default now(),
  algorithm_version text not null default 'clima6-v1',

  -- Estado geral da avaliacao.
  confidence text not null
    check (confidence in ('high', 'medium', 'low', 'disputed', 'unavailable')),
  source_count integer not null default 0 check (source_count >= 0),
  contributing_providers text[] not null default '{}',
  outlier_providers text[] not null default '{}',
  disputed_fields text[] not null default '{}',

  -- Valores de consenso Shadow. NULL significa indisponivel/disputado, nunca zero.
  temperature_c double precision,
  relative_humidity_pct double precision,
  dew_point_c double precision,
  surface_pressure_kpa double precision,
  wind_speed_10m_ms double precision,
  wind_speed_2m_ms double precision,
  wind_direction_deg double precision,
  solar_radiation_wm2 double precision,
  precipitation_mm double precision,
  vapour_pressure_deficit_kpa double precision,

  -- Proveniencia por variavel e resumo completo da decisao.
  provenance jsonb not null default '{}'::jsonb,
  decision_summary jsonb not null default '{}'::jsonb,
  independence_assumed boolean not null default false,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),

  constraint consensus_30m_positive_interval check (interval_end > interval_start),
  constraint consensus_30m_rh_range check (
    relative_humidity_pct is null or relative_humidity_pct between 0 and 100
  ),
  constraint consensus_30m_wind_dir_range check (
    wind_direction_deg is null or wind_direction_deg between 0 and 360
  )
);

create index if not exists idx_weather_consensus_shadow_station_time
  on public.weather_interval_30m_consensus_shadow(
    virtual_station_id, interval_start desc, evaluated_at desc
  );

create table if not exists public.weather_interval_30m_quality_flags (
  id uuid primary key default gen_random_uuid(),
  consensus_id uuid not null
    references public.weather_interval_30m_consensus_shadow(id) on delete cascade,
  candidate_id uuid
    references public.weather_interval_30m_candidates(id) on delete set null,
  provider text not null
    check (provider in ('open_meteo', 'meteoblue', 'weatherapi', 'met_norway')),
  model_name text,
  field_name text not null,
  original_value double precision,
  status text not null
    check (status in ('accepted', 'outlier', 'invalid', 'suspicious', 'missing', 'excluded')),
  reason text not null,
  reference_value double precision,
  absolute_difference double precision,
  relative_difference_pct double precision,
  created_at timestamptz not null default now()
);

create index if not exists idx_weather_quality_flags_consensus
  on public.weather_interval_30m_quality_flags(consensus_id, field_name, provider);

alter table public.weather_interval_30m_consensus_shadow enable row level security;
alter table public.weather_interval_30m_quality_flags enable row level security;

create policy "weather consensus shadow readable by farm access"
  on public.weather_interval_30m_consensus_shadow
  for select
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "weather consensus shadow insertable by farm access"
  on public.weather_interval_30m_consensus_shadow
  for insert
  with check (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "weather quality flags readable by farm access"
  on public.weather_interval_30m_quality_flags
  for select
  using (
    exists (
      select 1
      from public.weather_interval_30m_consensus_shadow c
      join public.virtual_weather_stations s on s.id = c.virtual_station_id
      where c.id = consensus_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "weather quality flags insertable by farm access"
  on public.weather_interval_30m_quality_flags
  for insert
  with check (
    exists (
      select 1
      from public.weather_interval_30m_consensus_shadow c
      join public.virtual_weather_stations s on s.id = c.virtual_station_id
      where c.id = consensus_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

comment on table public.weather_interval_30m_consensus_shadow is
  'Consenso climatico Cotrim em Shadow Mode, por intervalo de 30 min. Nao e fonte operacional enquanto shadow.';

comment on column public.weather_interval_30m_consensus_shadow.independence_assumed is
  'Sempre false na CLIMA 6: concordancia entre providers nao implica independencia entre modelos meteorologicos.';

comment on table public.weather_interval_30m_quality_flags is
  'Trilha auditavel de aceitacao, outlier, invalidade ou exclusao por variavel/provider.';
