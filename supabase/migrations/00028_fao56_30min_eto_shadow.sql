-- ==========================================================================
-- Migration 00028: ETo FAO-56 Penman-Monteith subdiaria em Shadow Mode
-- ==========================================================================
-- Cada linha referencia uma avaliacao de consenso CLIMA 6.
-- O resultado e auditavel, append-only e NAO alimenta water_balances.
-- ==========================================================================

create table if not exists public.weather_eto_30m_shadow (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,
  consensus_id uuid not null
    references public.weather_interval_30m_consensus_shadow(id) on delete restrict,

  interval_start timestamptz not null,
  interval_end timestamptz not null,
  local_date date not null,
  calculated_at timestamptz not null default now(),

  method text not null default 'fao_56_penman_monteith_subdaily',
  formula_version text not null default 'clima7-v1',
  shadow_mode boolean not null default true,

  eto_mm_30m double precision,
  eto_rate_mm_h double precision,
  quality_status text not null
    check (quality_status in ('complete', 'estimated', 'partial', 'missing', 'invalid')),

  -- Entradas canonicas efetivamente usadas.
  temperature_c double precision,
  relative_humidity_pct double precision,
  dew_point_c double precision,
  surface_pressure_kpa double precision,
  wind_speed_2m_ms double precision,
  solar_radiation_wm2 double precision,
  elevation_m double precision,
  latitude double precision,
  longitude double precision,
  timezone text,

  -- Componentes auditaveis do balanço de energia e PM.
  solar_radiation_mj_m2_interval double precision,
  extraterrestrial_radiation_mj_m2_interval double precision,
  clear_sky_radiation_mj_m2_interval double precision,
  cloudiness_ratio double precision,
  net_shortwave_radiation_mj_m2_h double precision,
  net_longwave_radiation_mj_m2_h double precision,
  net_radiation_mj_m2_h double precision,
  soil_heat_flux_mj_m2_h double precision,
  saturation_vapour_pressure_kpa double precision,
  actual_vapour_pressure_kpa double precision,
  vapour_pressure_deficit_kpa double precision,
  saturation_slope_kpa_c double precision,
  psychrometric_constant_kpa_c double precision,
  aerodynamic_term double precision,
  radiation_term double precision,

  is_daylight boolean,
  pressure_estimated_from_elevation boolean not null default false,
  cloudiness_inherited boolean not null default false,
  missing_fields text[] not null default '{}',
  warnings text[] not null default '{}',
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint weather_eto_30m_positive_interval check (interval_end > interval_start),
  constraint weather_eto_30m_nonnegative check (eto_mm_30m is null or eto_mm_30m >= 0)
);

create index if not exists idx_weather_eto_30m_shadow_station_time
  on public.weather_eto_30m_shadow(virtual_station_id, interval_start desc, calculated_at desc);

create index if not exists idx_weather_eto_30m_shadow_consensus
  on public.weather_eto_30m_shadow(consensus_id);

alter table public.weather_eto_30m_shadow enable row level security;

create policy "weather eto 30m shadow readable by farm access"
  on public.weather_eto_30m_shadow
  for select
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "weather eto 30m shadow insertable by farm access"
  on public.weather_eto_30m_shadow
  for insert
  with check (
    shadow_mode = true
    and exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

comment on table public.weather_eto_30m_shadow is
  'ETo FAO-56 Penman-Monteith em intervalos de 30 min, somente Shadow Mode. Nao alimenta o balanco hidrico.';
