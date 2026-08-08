-- ==========================================================================
-- Migration 00029: auditoria do orquestrador climático V2 em Shadow Mode
-- ==========================================================================

create table if not exists public.climate_orchestration_runs (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,
  trigger_type text not null
    check (trigger_type in ('manual', 'cron')),
  status text not null
    check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  window_start timestamptz not null,
  window_end timestamptz not null,
  provider_results jsonb not null default '{}'::jsonb,
  intervals_found integer not null default 0,
  consensus_created integer not null default 0,
  eto_created integer not null default 0,
  eto_available integer not null default 0,
  confidence_counts jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  constraint climate_orchestration_window_positive check (window_end > window_start)
);

create index if not exists idx_climate_orchestration_station_started
  on public.climate_orchestration_runs(virtual_station_id, started_at desc);

alter table public.climate_orchestration_runs enable row level security;

create policy "climate orchestration readable by farm access"
  on public.climate_orchestration_runs
  for select
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "climate orchestration insertable by farm access"
  on public.climate_orchestration_runs
  for insert
  with check (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "climate orchestration updatable by farm access"
  on public.climate_orchestration_runs
  for update
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  )
  with check (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

comment on table public.climate_orchestration_runs is
  'Auditoria de cada ciclo CLIMA 8. Shadow Mode; não alimenta balanço hídrico.';
