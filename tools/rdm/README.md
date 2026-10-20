# Simulador de gestão de água da safra — RDM (base REV10 / rotação v.21)

Gera `RDM_PLANEJAMENTO_HIDRICO_SAFRA.xlsx`: modelo de capacidade hídrica e
gestão de água da unidade RDM, sem VBA. O coração é o **balanço diário do
reservatório por casa de bomba** (captação × consumo × nível), que responde
**onde e quando vai faltar água**.

## Como rodar
```bash
python3 -m pip install openpyxl
# extração (arquivos oficiais são dados não confiáveis → -I)
python3 -I tools/rdm/extrair_fontes.py <RDM.xlsm> <ROTACAO.xlsx> rdm_dataset.json
# construção (rodar de dentro de tools/rdm p/ achar config_modelo e estilos)
cd tools/rdm && python3 construir_planilha.py <caminho>/rdm_dataset.json <saida>.xlsx
```
Recalcular no LibreOffice (precisa de `libreoffice-calc`): `scripts/recalc.py`.

## Fontes
- **STC_RDM REV10.xlsm**: casas de bomba, pivôs, áreas, poços, reservação,
  captação/dia (Dashboard), lâmina nominal (data_Base, bloco "Lâmina mm/dia"),
  e a topologia de reserva compartilhada entre casas (Parâmetros).
- **Rotação bienal 26-28 v.21.xlsx**: funde a aba `Rotação` (ciclos 26/27) com
  `Rotação Milho semente` (milho semente 2027), FAZENDA = RDM, tipo Irrigado.

## Mudanças da v.21 / REV10 incorporadas
- Nova casa **RM08** (pivôs 134–137). Sem captação própria e sem ciclos de
  rotação ainda → entra no cadastro mas não gera demanda (ver PENDENCIAS).
- Reservatórios muito maiores (RM05 1.000.000 m³, RM06 469.821, RM04 129.000):
  só RM05/RM06/RM07 ficam com falta de água no pico.
- Sequências de rotação conforme instrução do usuário:
  - PV 112, 113: soja → milho semente
  - PV 125, 131, 132: algodão → milho semente
  - PV 121, 124: soja → algodão (milho semente sobreposto foi descartado —
    `config_modelo.DROP_CULTURA_POR_TALHAO`)
