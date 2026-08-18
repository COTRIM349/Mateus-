# Impacto da chuva no plantio da soja e do algodão — safra 2025/26

Fazendas Karitel (KRT) e Rio do Meio (RDM), Cocos/BA.

## Entregáveis

| Arquivo | O que é |
|---|---|
| `relatorio/relatorio_chuva.html` | Relatório completo com gráficos interativos |
| `Impacto_da_Chuva_Soja_Algodao_2526.xlsx` | Todas as tabelas: métricas por talhão, cenários, calibração, auditoria, método e limitações |
| `saidas/` | CSVs intermediários e logs de cada etapa |
| `scripts/run_all.sh` | Pipeline completo, reprodutível de ponta a ponta |

## Resultado em uma linha

A chuva bloqueou 62 dias em Karitel e 68 em Rio do Meio dos 108 dias da campanha do algodão
(57% e 63%), mas custou apenas 2,5 a 7,8 dias de atraso médio no calendário. Os 108 dias foram
consumidos pela liberação escalonada dos pivôs pela cultura anterior, não pelo clima nem pela
capacidade de máquina — o plantio exigia 24 e 15 dias de máquina.

## Como reproduzir

```bash
bash scripts/run_all.sh          # gera saidas/ e a planilha
python3 scripts/15_dados_web.py  # gera saidas/payload.json usado pelo relatório
```

Os arquivos de origem ficam em `/root/.claude/uploads/…` (caminho fixado no topo de `scripts/01_etl.py`).

## Etapas do pipeline

| Script | Etapa |
|---|---|
| `01_etl.py` | Extrai chuva (XLSX), soja (PDF) e algodão (XLSX) para CSVs limpos |
| `02_auditoria.py` | Dias ausentes, duplicados, unidades, zero × falha, sensores redundantes, outliers |
| `03_valida_ausentes.py` | Testa a hipótese "dia ausente = dia seco" contra o relatório de irrigação |
| `04_serie_diaria.py` | Grade diária completa de chuva por pluviômetro |
| `05_calibracao.py` / `05b_testes.py` | Calibra o efeito residual na operação real; testes de Fisher e permutação |
| `06_diagnostico.py` | Sucessão soja→algodão e capacidade operacional |
| `08_motor.py` | Métricas de bloqueio por talhão e por fazenda |
| `09` / `10_cenarios_v2.py` | Reconstrução diária da semeadura e cenários A–E sob duas hipóteses |
| `11_soja.py` | A semeadura da soja foi limitada por chuva ou escalonada por decisão? |
| `12_consolida.py` | Tabela consolidada por talhão com todas as métricas |
| `13_produtividade.py` | Produtividade × época de plantio, com controles |
| `14_excel.py` / `15_dados_web.py` | Planilha final e payload do relatório |

## Limitação principal

A cultura antecessora de 43 dos 68 talhões (5.118 ha, 62% da área) não consta nas fontes.
Por isso todo cenário é apresentado como intervalo entre duas hipóteses de liberação (H1/H2).
A produtividade do algodão só está fechada para 30% da área, toda plantada entre 02/12 e 11/01 —
o efeito do plantio tardio além dessa data não é mensurável nesta safra.
