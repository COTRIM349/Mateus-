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
