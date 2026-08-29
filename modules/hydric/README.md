# Módulo Hídrico Canônico (`modules/hydric`)

**Motor único e versionado** de balanço hídrico do solo, unificando os três
motores legados divergentes (`water-balance.service`, `pivot-engine`,
`recommendation.service`) numa implementação FAO-56 pura, testável e sem
side-effects.

> Status: **Fatia 1 — Contrato + Motor puro + Teste dourado** (não-destrutivo).
> O legado permanece intacto. A integração das telas (Fatias 4-5) e a
> persistência versionada (Fatia 2) virão em PRs seguintes, em modo sombra.

## Estrutura

```
domain/glossary.ts    Termos canônicos, unidades, estados, provenance, readiness
engine/soil.ts        DTA/CTA por camada, unit-aware (% peso / % vol / m³·m⁻³)
engine/irrigation.ts  ETc, chuva efetiva, depleção, lâmina, volume, tempo
engine/hydricEngineV4.ts  Motor diário: junta solo + ETc + Ks + balanço
```

## Fórmulas implementadas

### Solo — DTA (unit-aware)
| Unidade de CC/PMP | Fórmula (mm/cm) |
|---|---|
| % em peso | `((CC − PMP) × Da) / 10` |
| % volumétrico | `(CC − PMP) / 10` |
| m³/m³ | `(CC − PMP) × 10` |

- **Nunca** aplica densidade aparente duas vezes.
- `Da` ausente em base peso ⇒ DTA `null` (bloqueia, não vira 0).

### Zona radicular
- `CTA_camada = DTA × espessura_explorada_cm`
- Raiz parcial numa camada usa só a fração alcançada (não infla o perfil).
- `CTA_total = Σ camadas exploradas`; bloqueia se camada explorada tem dado ausente.

### Manejo
- `CRA (AFD) = CTA × FD` — FD é parâmetro de manejo, **não** é Ks.
- `p_ajustado = clamp(p + 0,04 × (5 − ETc), 0,10, 0,80)` (FAO-56 eq.84).
- `ARM = clamp(CTA − Dr, 0, CTA)`; `Dr = CTA − ARM`.

### Estresse (FAO-56 eq.84)
- `Ks = 1` quando `Dr ≤ CRA`
- `Ks = (CTA − Dr) / (CTA − CRA)` quando `Dr > CRA`, limitado a [0,1]
- Ordem correta (spec-2 §12): Dr início → CTA → CRA → Ks início → ETo → Kc →
  ETc pot → ETc ajustada → chuva → irrigação → Dr final.

### Demanda
- `ETc_pot = ETo × Kc × Kl` · `ETc_real = ETc_pot × Ks` (guardados separados)
- Chuva efetiva diária configurável (fração fixa / abstração / total) — **não**
  a fórmula mensal USDA-SCS que o legado aplicava indevidamente.

### Balanço diário
- `Dr_i = Dr_(i-1) − (P − RO) − Ief − CR + ETc_real (+DP)`
- Excedente acima da CTA ⇒ `drenagem profunda`, nunca "água negativa".

### Recomendação
- `LL = Dr − Dr_alvo` · `LB = LL / Ea` · `V = LB × área × 10` · `t = V / Q`
- Capacidade diária `= (Q × horas) / (área × 10)`

## Correções vs. legado

1. **Ks agora reduz a ETc** sob estresse (legado usava sempre ETc potencial).
2. **Chuva efetiva diária** (legado aplicava fórmula mensal em base diária).
3. **Dado ausente bloqueia** o cálculo oficial em vez de virar 0 silencioso.
4. **Unidade de umidade explícita** com fórmula automática por unidade.
5. **Versão do motor** carimbada em todo resultado (`hydric_engine_v4.0.0`).

## Teste dourado (spec-2 §38)

Solo 3 camadas 20 cm, % peso, CC≈12,4/12,2, PMP≈6,3/6,1, Da 1,82, raiz 60 cm:

| Grandeza | Esperado | Verificado |
|---|---|---|
| DTA camada 1 | 1,1102 mm/cm | ✅ |
| CTA por camada | 22,20 mm | ✅ |
| CTA total | 66,61 mm | ✅ |
| CRA (FD 0,50) | 33,31 mm | ✅ |
| Ks (Dr 40) | 0,80 | ✅ |

42 testes no módulo · suíte total 411 · zero regressão.
