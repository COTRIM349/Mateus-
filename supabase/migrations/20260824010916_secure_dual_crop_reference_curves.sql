alter table public.dual_crop_reference_curves enable row level security;

do $$ begin
  create policy authenticated_read_dual_crop_reference_curves
    on public.dual_crop_reference_curves
    for select
    to authenticated
    using (true);
exception when duplicate_object then null; end $$;

revoke insert, update, delete, truncate, references, trigger
  on public.dual_crop_reference_curves
  from anon, authenticated;

grant select on public.dual_crop_reference_curves to authenticated;

comment on table public.dual_crop_reference_curves is
  'Biblioteca técnica de referência Kcb/Kc. Leitura autenticada; alterações somente por migração/admin para preservar proveniência.';
