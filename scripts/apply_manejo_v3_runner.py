from pathlib import Path

# Aplica o patch completo e depois resolve a tipagem estrita da faixa de KPIs.
exec(Path('scripts/apply_manejo_v3_fixed.py').read_text(encoding='utf-8'))

page_path = Path('app/(app)/balanco-hidrico/page.tsx')
page = page_path.read_text(encoding='utf-8')
old = '<StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} unit={k.unit} tone={k.tone} />'
new = '<StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} unit={k.unit} />'
count = page.count(old)
if count != 1:
    raise SystemExit(f'faixa KPI esperada 1 vez; encontrada {count}')
page_path.write_text(page.replace(old, new, 1), encoding='utf-8')
print('Tipagem da faixa KPI corrigida.')
