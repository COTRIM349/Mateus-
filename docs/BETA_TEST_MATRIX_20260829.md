# Matriz de teste beta

## Balanço hídrico
- [ ] Pivô com condição inicial em capacidade de campo confirmada calcula sem erro.
- [ ] Pivô com umidade medida volumétrica calcula sem erro.
- [ ] Pivô sem condição inicial permanece bloqueado.
- [ ] Recalcular após um erro remove gráfico/dados/recomendação anteriores.
- [ ] CAD confere com solo + profundidade radicular.
- [ ] AFD confere com CAD × p.
- [ ] ETc potencial confere com ETo × Kc × Kl.
- [ ] ETc real confere com ETc potencial × Ks.
- [ ] ARM respeita 0 ≤ ARM ≤ CAD.
- [ ] Déficit = CAD − ARM.
- [ ] Recomendação só ocorre no limiar operacional configurado.
- [ ] Lâmina bruta considera eficiência de aplicação e não CUC.

## Clima
- [ ] Cada dia do período tem leitura selecionada e aprovada.
- [ ] ETo ausente bloqueia cálculo.
- [ ] Chuva ausente não é inventada.
- [ ] Chuva manual substitui somente precipitação, nunca ETo.
- [ ] Origem e qualidade climática ficam rastreáveis.

## Cadastros
- [ ] Pivô contém somente ficha técnica e solo vinculado.
- [ ] Parcela ativa contém cultura/ciclo e vai para histórico ao encerrar.
- [ ] Fases possuem cobertura contínua do período, Kc, raiz, p e Kl válidos.
- [ ] Solo possui CC > PMP e profundidade/camadas coerentes.

## Operação
- [ ] Lançamento de irrigação fica vinculado à parcela ativa.
- [ ] Volume e horas são coerentes com área, vazão e lâmina.
- [ ] Recalcular após lançamento altera o ARM conforme esperado.

## Segurança e produção
- [ ] Project CI verde.
- [ ] Climate V2 CI verde.
- [ ] Vercel Preview Ready.
- [ ] Funções internas SECURITY DEFINER não executáveis por anon/authenticated.
- [ ] Rio do Meio permanece inativa enquanto coordenadas não forem confirmadas.
- [ ] Cron Climate V2 só é ativado quando a URL de produção retornar JSON 200 da rota `/api/cron/climate-v2`.
