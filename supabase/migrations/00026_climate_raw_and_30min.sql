-- ==========================================================================
-- Migration 00026: payload bruto + clima normalizado em 30 minutos
-- ==========================================================================
-- Nao altera weather_readings nem water_balances. Esta camada e shadow-only.
-- O payload bruto nunca e sobrescrito; os dados normalizados apontam para ele.
-- ==========================================================================

-- Garante que modulo/pivo pertencem a mesma fazenda da estacao.
create or replace function public.validate_virtual_weather_station_scope_farm()
returns trigger
language plpgsql
as $$
declare
  related_farm_id uuid;
begin
  if new.scope_type = 'module' then
    select farm_id into related_farm_id
    from public.production_modules
    where id = new.module_id;

    if related_farm_id is null or related_farm_id <> new.farm_id then
      raise exception 'Modulo da estacao virtual deve pertencer a mesma fazenda';
    end if;
  elsif new.scope_type = 'pivot' then
    select farm_id into related_farm_id
    from public.pivots
    where id = new.pivot_id;

    if related_farm_id is null or related_farm_id <> new.farm_id then
      raise exception 'Pivo da estacao virtual deve pertencer a mesma fazenda';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_virtual_weather_station_scope_farm
  on public.virtual_weather_stations;
create trigger trg_validate_virtual_weather_station_scope_farm
before insert or update of farm_id, scope_type, module_id, pivot_id
on public.virtual_weather_stations
for each row execute function public.validate_virtual_weather_station_scope_farm();

-- Resposta original do provedor. Guardamos JSONB para auditoria/reprocessamento.
create table if not exists public.climate_raw_payloads (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,
  provider text not null
    check (provider in ('open_meteo', 'meteoblue', 'weatherapi', 'met_norway')),
  data_type text not null default 'forecast'
    check (data_type in ('observed', 'forecast', 'reanalysis', 'estimated')),
  requested_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  request_url text,
  http_status integer,
  model_name text,
  source_resolution_minutes integer,
  response_latitude double precision,
  response_longitude double precision,
  response_elevation_m double precision,
  response_timezone text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_climate_raw_payloads_station_provider_time
  on public.climate_raw_payloads(virtual_station_id, provider, fetched_at desc);

-- Registro canonico por provider e intervalo. Ainda NAO e consenso Cotrim.
create table if not exists public.climate_interval_readings (
  id uuid primary key default gen_random_uuid(),
  virtual_station_id uuid not null
    references public.virtual_weather_stations(id) on delete cascade,
  raw_payload_id uuid
    references public.climate_raw_payloads(id) on delete set null,
  provider text not null
    check (provider in ('open_meteo', 'meteoblue', 'weatherapi', 'met_norway')),

  interval_start timestamptz not null,
  interval_end timestamptz not null,
  target_resolution_minutes integer not null default 30
    check (target_resolution_minutes = 30),
  source_resolution_minutes integer,

  temperature_c double precision,
  relative_humidity_pct double precision,
  dew_point_c double precision,
  surface_pressure_kpa double precision,
  wind_speed_10m_ms double precision,
  wind_speed_2m_ms double precision,
  wind_direction_deg double precision,
  solar_radiation_wm2 double precision,
  precipitation_mm double precision,

  -- A ETo sera preenchida apenas pela etapa do motor agronomico.
  provider_reference_eto_mm double precision,
  cotrim_pm_eto_mm double precision,

  data_type text not null default 'forecast'
    check (data_type in ('observed', 'forecast', 'estimated')),
  quality_status text not null default 'partial'
    check (quality_status in ('complete', 'partial', 'stale', 'missing', 'invalid', 'suspicious', 'unavailable', 'estimated')),
  interpolated boolean not null default false,
  estimated boolean not null default false,
  missing_fields text[] not null default '{}',
  warnings text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint climate_interval_valid_range check (interval_end > interval_start),
  unique (virtual_station_id, provider, interval_start, interval_end)
);

create index if not exists idx_climate_interval_station_time
  on public.climate_interval_readings(virtual_station_id, interval_start desc);
create index if not exists idx_climate_interval_provider_time
  on public.climate_interval_readings(provider, interval_start desc);

alter table public.climate_raw_payloads enable row level security;
alter table public.climate_interval_readings enable row level security;

create policy "climate raw readable by farm access"
  on public.climate_raw_payloads
  for select
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "climate raw manageable by farm access"
  on public.climate_raw_payloads
  for all
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

create policy "climate intervals readable by farm access"
  on public.climate_interval_readings
  for select
  using (
    exists (
      select 1 from public.virtual_weather_stations s
      where s.id = virtual_station_id
        and s.farm_id in (select public.auth_farm_ids())
    )
  );

create policy "climate intervals manageable by farm access"
  on public.climate_interval_readings
  for all
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

comment on table public.climate_raw_payloads is
  'Payload meteorologico bruto e imutavel por consulta/provider, para auditoria e reprocessamento.';
comment on table public.climate_interval_readings is
  'Dados meteorologicos normalizados por provider em intervalos Cotrim de 30 min. Nao representa ainda o consenso oficial.';
