# CLIMA 7 — desenho do Penman–Monteith FAO‑56 subdiário

Preparação para a implementação em branch própria.

- O motor diário `referenceEtoFao56.ts` permanece intocado.
- O novo motor será específico para intervalos de 30 minutos.
- Radiação em W/m² será integrada no intervalo antes do balanço de energia.
- O fluxo de calor no solo seguirá a regra subdiária FAO‑56: 0,1·Rn no período diurno e 0,5·Rn no período noturno.
- A pressão poderá ser estimada deterministicamente pela altitude quando a pressão de superfície do consenso não estiver disponível.
- A chuva não participa do cálculo de ETo.
- Dados ausentes permanecerão NULL; nenhuma variável essencial será convertida silenciosamente para zero.
- O cálculo permanece em Shadow Mode e não alimenta o balanço hídrico.
