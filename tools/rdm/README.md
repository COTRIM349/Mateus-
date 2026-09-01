# Simulador de planejamento hídrico da safra — RDM

Gera `RDM_PLANEJAMENTO_HIDRICO_SAFRA.xlsx`: um modelo de capacidade hídrica e
operacional da unidade RDM, semana a semana, sem VBA e sem macro.

## Como rodar

```bash
pip install openpyxl
python3 extrair_fontes.py <arquivo_RDM.xlsm> <arquivo_ROTACAO.xlsx> rdm_dataset.json
python3 construir_planilha.py rdm_dataset.json RDM_PLANEJAMENTO_HIDRICO_SAFRA.xlsx
```

## Arquivos

| Arquivo | Papel |
|---|---|
| `extrair_fontes.py` | Lê os dois arquivos oficiais e produz o dataset canônico da RDM (filtra `FAZENDA = RDM`, tipo `Irrigado`). |
| `config_modelo.py` | Tudo o que **não** veio dos arquivos oficiais: horizonte da safra, curvas de Kc (FAO-56), clima de referência provisório, faixas de alerta. Cada valor daqui vira célula editável na planilha. |
| `estilos.py` | Padrão visual único (Arial, legenda de cores entrada/fórmula/link/pendência). |
| `construir_planilha.py` | Monta as 23 abas, as fórmulas, a formatação condicional e os gráficos. |

## O que vem de cada fonte

**Arquivo oficial de distribuição de água (`.xlsm`)**
- Casa de bomba × pivô × área (aba `Parâmetros`)
- Poços de captação, vazão (m³/h) e turno de captação (aba `Dashboard`)
- Reservação e volume de canal por casa
- Lâmina nominal por pivô = maior lâmina/dia já registrada em `data_Base`
- Turno de rega de 21 h/dia

**Planilha de rotação bienal 26-28 (`.xlsx`)**
- Cultura, cultivar, data de plantio e data final de cada ciclo dos 32 pivôs da RDM
- Duração de ciclo por cultivar (aba `Base de dados validação`)

## O que **não** existe nos arquivos e fica como `DADO PENDENTE`

ETo, chuva/chuva útil, eficiência de aplicação, vazão de projeto dos pivôs,
vazão operacional das casas de bomba, capacidade dos trechos de canal e a
topologia do canal. A aba `PENDENCIAS_CADASTRO` lista cada um, o que o modelo
usa no lugar e o impacto no resultado.

## Hierarquia do modelo

```
CLIMA → ETo → Kc → ETc → CHUVA ÚTIL → NECESSIDADE LÍQUIDA → LÂMINA BRUTA
      → VOLUME DO PIVÔ → HORAS DO PIVÔ → DEMANDA DA CASA DE BOMBA
      → DEMANDA ACUMULADA DO TRECHO → CAPACIDADE HIDRÁULICA → GARGALO
```

## Validação

O arquivo gerado é recalculado no LibreOffice antes de ser entregue
(`recalc.py`): **90.089 fórmulas, zero erros**. Se o recálculo falhar dizendo
que o arquivo não pôde ser carregado, falta o filtro de Calc:

```bash
apt-get install -y libreoffice-calc
```

Testes de sensibilidade feitos no arquivo entregue:

| Alteração | Efeito esperado | Efeito obtido |
|---|---|---|
| Eficiência 85% → 75% | volume × 85/75 | 18.079.237 → 20.489.802 m³ ✔ |
| Fator de chuva útil 0,80 → 0,50 | volume sobe | 18.079.237 → 23.992.098 m³ ✔ |
| Horas 21 → 16 h/dia | volume igual; utilização inalterada enquanto a vazão dos pivôs for derivada das horas | confirmado ✔ |

## Modelo de gestão de água (v2)

O centro do modelo deixou de ser "pivô-hora" (que fica em 30–50%, folgado) e
passou a ser o **balanço diário do reservatório por casa de bomba** — onde a
água realmente falta.

- **`BALANCO_DIARIO`** — para cada casa, dia a dia: captação (18 h) × consumo
  dos pivôs × nível do reservatório (começa cheio) × déficit. É a lógica da
  planilha original, em resolução diária.
- **`PAINEL_GESTAO`** — onde e quando vai faltar água: dias de falta por casa,
  primeiro/último dia crítico, volume faltante, horas extras de captação e
  vazão adicional necessárias, e recomendação.
- ETo/chuva agora usam climatologia de referência do Oeste da Bahia (Cerrado),
  substituível pela série da estação.

Diagnóstico com os dados atuais: **5 das 7 casas não têm captação suficiente no
pico** (RM05, RM06, RM07, RM04, RM02); ~6,2 M m³ faltantes na safra. Elevar a
captação de 18 h para 24 h reduz para 3 casas e ~3,6 M m³ — exemplo de lever
testável no próprio modelo.
