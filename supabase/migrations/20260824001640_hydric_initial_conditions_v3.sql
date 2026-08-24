create table if not exists public.hydric_initial_conditions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  pivot_crop_assignment_id uuid not null references public.pivot_crop_assignments(id) on delete cascade,
  effective_date date not null,
  measured_at timestamptz not null,
  source text not null,
  moisture_value double precision,
  moisture_unit text not null default 'field_capacity_fraction',
  is_field_capacity boolean not null default false,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pivot_crop_assignment_id, effective_date)
);

alter table public.hydric_initial_conditions enable row level security;

do $$ begin
  create policy farm_access_hydric_initial_conditions
    on public.hydric_initial_conditions
    for all
    using (farm_id in (select auth_farm_ids()))
    with check (farm_id in (select auth_farm_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.hydric_initial_conditions add constraint hydric_initial_conditions_source_check
    check (source in ('measured','field_capacity_confirmed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.hydric_initial_conditions add constraint hydric_initial_conditions_unit_check
    check (moisture_unit in ('field_capacity_fraction','volume_pct','weight_pct'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.hydric_initial_conditions add constraint hydric_initial_conditions_value_check
    check (
      (source = 'field_capacity_confirmed' and is_field_capacity = true and moisture_value is null)
      or
      (source = 'measured' and is_field_capacity = false and moisture_value is not null and moisture_value >= 0 and moisture_value <= 100)
    );
exception when duplicate_object then null; end $$;

create or replace function public.validate_hydric_initial_condition_farm()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  assignment_farm uuid;
begin
  select p.farm_id into assignment_farm
  from public.pivot_crop_assignments pca
  join public.pivots p on p.id = pca.pivot_id
  where pca.id = new.pivot_crop_assignment_id;

  if assignment_farm is null or assignment_farm <> new.farm_id then
    raise exception 'Hydric initial condition farm does not match assignment farm';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_hydric_initial_condition_farm on public.hydric_initial_conditions;
create trigger trg_validate_hydric_initial_condition_farm
before insert or update on public.hydric_initial_conditions
for each row execute function public.validate_hydric_initial_condition_farm();

create or replace function public.invalidate_dual_after_hydric_initial_condition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  aid uuid;
  anchor_date date;
begin
  aid := coalesce(new.pivot_crop_assignment_id, old.pivot_crop_assignment_id);
  anchor_date := least(
    coalesce(new.effective_date, '9999-12-31'::date),
    coalesce(old.effective_date, '9999-12-31'::date)
  );

  delete from public.water_balances_dual
  where pivot_crop_assignment_id = aid
    and date > anchor_date;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invalidate_dual_after_hydric_initial_condition on public.hydric_initial_conditions;
create trigger trg_invalidate_dual_after_hydric_initial_condition
after insert or update or delete on public.hydric_initial_conditions
for each row execute function public.invalidate_dual_after_hydric_initial_condition();

comment on table public.hydric_initial_conditions is 'Âncoras hídricas datadas para reinicializar/calibrar balanço de ciclos em andamento sem retroagir a condição ao plantio.';
comment on column public.hydric_initial_conditions.effective_date is 'Data cujo fim representa a condição hídrica medida/confirmada; o balanço diário reinicia no dia seguinte.';
comment on column public.hydric_initial_conditions.measured_at is 'Data/hora real da aferição para rastreabilidade; o motor permanece diário.';