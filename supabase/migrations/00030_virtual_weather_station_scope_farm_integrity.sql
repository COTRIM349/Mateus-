-- ==========================================================================
-- Migration 00030: integridade fazenda x escopo da Estacao Virtual
-- ==========================================================================
-- Impede que uma estacao virtual de modulo/pivo referencie um recurso que
-- pertence a outra fazenda. Complementa as FKs e o scope_shape da migration
-- 00025.
-- ==========================================================================

create or replace function public.validate_virtual_weather_station_scope_farm()
returns trigger
language plpgsql
as $$
declare
  referenced_farm_id uuid;
begin
  if new.scope_type = 'module' then
    select m.farm_id
      into referenced_farm_id
      from public.production_modules m
     where m.id = new.module_id;

    if referenced_farm_id is null then
      raise exception 'Modulo % nao encontrado para Estacao Virtual', new.module_id;
    end if;

    if referenced_farm_id is distinct from new.farm_id then
      raise exception 'Modulo % pertence a outra fazenda', new.module_id;
    end if;
  elsif new.scope_type = 'pivot' then
    select p.farm_id
      into referenced_farm_id
      from public.pivots p
     where p.id = new.pivot_id;

    if referenced_farm_id is null then
      raise exception 'Pivo % nao encontrado para Estacao Virtual', new.pivot_id;
    end if;

    if referenced_farm_id is distinct from new.farm_id then
      raise exception 'Pivo % pertence a outra fazenda', new.pivot_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_virtual_weather_station_scope_farm_integrity
  on public.virtual_weather_stations;

create trigger trg_virtual_weather_station_scope_farm_integrity
before insert or update of farm_id, scope_type, module_id, pivot_id
on public.virtual_weather_stations
for each row execute function public.validate_virtual_weather_station_scope_farm();

comment on function public.validate_virtual_weather_station_scope_farm() is
  'Garante que module_id/pivot_id usados pela Estacao Virtual pertencam ao mesmo farm_id.';
