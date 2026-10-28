-- Chuva operacional por pivô
-- Antes desta alteração, um lançamento manual era único por fazenda/data e
-- valia para todos os pivôs. A migração preserva esse histórico replicando os
-- registros legados para cada pivô da mesma fazenda. Novos lançamentos passam
-- a ser únicos por fazenda + pivô + data.

begin;

alter table public.manual_rainfall_entries
  add column if not exists pivot_id uuid references public.pivots(id) on delete cascade;

alter table public.manual_rainfall_entries
  drop constraint if exists manual_rainfall_farm_date_key;

insert into public.manual_rainfall_entries (
  farm_id,
  pivot_id,
  date,
  precipitation_mm,
  source,
  notes,
  measured_at,
  created_by,
  created_at,
  updated_at
)
select
  r.farm_id,
  p.id,
  r.date,
  r.precipitation_mm,
  r.source,
  r.notes,
  r.measured_at,
  r.created_by,
  r.created_at,
  r.updated_at
from public.manual_rainfall_entries r
join public.pivots p
  on p.farm_id = r.farm_id
where r.pivot_id is null;

delete from public.manual_rainfall_entries
where pivot_id is null;

alter table public.manual_rainfall_entries
  alter column pivot_id set not null;

alter table public.manual_rainfall_entries
  add constraint manual_rainfall_farm_pivot_date_key
  unique (farm_id, pivot_id, date);

create index if not exists idx_manual_rainfall_entries_pivot_date
  on public.manual_rainfall_entries(pivot_id, date desc);

comment on column public.manual_rainfall_entries.pivot_id is
  'Pivô ao qual a chuva manual foi medida/aplicada operacionalmente.';

commit;
