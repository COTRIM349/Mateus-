# CLIMA 6 — Regras v1 de qualidade e consenso

Esta camada permanece em **Shadow Mode** e não alimenta o balanço hídrico.

## Princípios

1. Candidatos de cada provider são imutáveis.
2. Para cada intervalo de 30 min, somente o candidato mais recente de cada provider participa da avaliação.
3. `provider` não é sinônimo de modelo meteorológico independente. O sistema preserva `provider + model_name` e registra `independence_assumed=false`.
4. Ausência de dado permanece `NULL`.
5. Variáveis contínuas usam mediana robusta após QC físico e rejeição de outliers.
6. Precipitação é tratada separadamente. Discordância entre seco e chuva gera `NULL` e status `disputed`.
7. Limiares v1 são provisórios e serão recalibrados com Bias, MAE, RMSE, disponibilidade e taxa de outlier por estação/modelo.

## Limiares iniciais

- Temperatura: 2 °C
- Umidade relativa: 10 pontos percentuais
- Ponto de orvalho: 2,5 °C
- Pressão de superfície: 1,5 kPa
- Vento: 2 m/s e, quando aplicável, 60% relativo
- Radiação: 120 W/m² e 20% relativo
- VPD: 0,6 kPa e 35% relativo

Esses valores são regras de validação inicial, não pesos permanentes do produto.

## Chuva

- `precipitationMm < 0.2`: seco para a regra preliminar do intervalo.
- Se houver pelo menos uma fonte seca e uma fonte chuvosa, o intervalo fica disputado.
- Não se faz média entre 0 mm e uma previsão positiva conflitante.
- Futuramente, observação física local/gauge terá precedência sobre chuva modelada.
