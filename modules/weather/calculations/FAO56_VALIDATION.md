# Validação científica — Motor `referenceEtoFao56`

**Escopo:** Etapa 2 da profissionalização climática da Cotrim Irrigação Pro.
Verifica se `calculateReferenceEtoFao56` (arquivo `referenceEtoFao56.ts`) implementa
corretamente o método FAO-56 Penman–Monteith (Allen et al., 1998) e é seguro
para integração futura ao balanço hídrico.

Este documento **não substitui** a leitura do FAO-56. Cita seções e equações
para conferência item-a-item pelo revisor.

---

## 1. Fórmula final implementada

Equação FAO-56 (eq. 6), reproduzida exatamente no motor:

```
ETo =  0.408·Δ·(Rn − G) + γ·(900/(Tmean+273))·u2·(es − ea)
      ─────────────────────────────────────────────────────
                     Δ + γ·(1 + 0.34·u2)
```

Aplicada com clamp `max(_, 0)` — ETo nunca é negativa.

---

## 2. Equações auxiliares (correspondência 1:1 com FAO-56)

| # | Equação implementada | Ref. FAO-56 | Unidades |
|---|---|---|---|
| 1 | J (dia do ano) — `Date.UTC(y,0,0)` + offset | Anexo 2 | 1..366 |
| 2 | `P = 101.3·((293−0.0065·z)/293)^5.26` | eq. **7** | m → kPa |
| 3 | `γ = 0.000665·P` | eq. **8** | kPa → kPa/°C |
| 4 | `e°(T) = 0.6108·exp(17.27·T/(T+237.3))` | eq. **11** | °C → kPa |
| 5 | `es = (e°(Tmin)+e°(Tmax))/2` | eq. **12** | kPa |
| 6 | `ea` — prioridade: fornecida → (RHmin,RHmax) → RHmean | eq. **17**, **19** | kPa |
| 7 | `VPD = max(es−ea, 0)` | eq. **6** (denom.) | kPa |
| 8 | `Δ = 4098·es(T)/(T+237.3)²` | eq. **13** | kPa/°C |
| 9 | `dr = 1 + 0.033·cos(2π·J/365)` | eq. **23** | adim. |
| 10 | `δ = 0.409·sin(2π·J/365 − 1.39)` | eq. **24** | rad |
| 11 | `ωs = acos(clamp(−tan(φ)·tan(δ), −1, 1))` | eq. **25** | rad |
| 12 | `Ra = (24·60/π)·Gsc·dr·[ωs·sin φ·sin δ + cos φ·cos δ·sin ωs]` | eq. **21** | MJ/m²/d |
| 13 | `Rso = (0.75 + 2·10⁻⁵·z)·Ra` (I2: se z ausente, `0.75·Ra` + warning) | eq. **37** | MJ/m²/d |
| 14 | `Rns = (1 − 0.23)·Rs` | eq. **38** | MJ/m²/d |
| 15 | **I1:** `cloudRatio = min(max(Rs/Rso, 0), 1)` | §3.5.2 | adim. |
| 16 | `Rnl = σ·(TmaxK⁴+TminK⁴)/2·(0.34−0.14·√ea)·(1.35·cloudRatio−0.35)` | eq. **39** | MJ/m²/d |
| 17 | `Rn = Rns − Rnl` | eq. **40** | MJ/m²/d |
| 18 | `G = 0` (base diária) | eq. **42** | MJ/m²/d |
| 19 | `u2 = uz·4.87/ln(67.8·z − 5.42)` | eq. **47** | m, m/s → m/s |
| 20 | Penman–Monteith (§1 acima) | eq. **6** | mm/d |

**Constantes:** Gsc = 0.0820 MJ/m²/min ; σ = 4.903·10⁻⁹ MJ K⁻⁴ m⁻² d⁻¹ ; α = 0.23.

---

## 3. Correções aplicadas na Etapa 2

| Id | Descrição | Diff aplicado |
|---|---|---|
| **I1** | `Rs/Rso` limitado a `[0, 1]` antes do termo de nuvens (FAO-56 §3.5.2). Antes: sem cap → Rnl sobrestimado em Rs>Rso. Agora: cap + warning quando entrada fora do intervalo. | `referenceEtoFao56.ts` §"Radiação líquida (Rn)" |
| **I2** | Quando `elevationM` é ausente mas `surfacePressureKpa` foi fornecida (ou estimada), Rso agora usa `0.75·Ra` e registra warning explícito ("Rso ao nível do mar"). Antes: usava `z=0` silenciosamente. | `referenceEtoFao56.ts` §"Ra e Rso" |
| **P.b** | Prioridade da pressão atmosférica: fornecida válida → estimada da altitude (`estimatedFields`) → impossibilidade explícita. Rejeita `surfacePressureKpa` inválida (≤0). | `referenceEtoFao56.ts` §"Pressão atmosférica" |

Nenhuma alteração de fórmula. Apenas defesas físicas e registros.

---

## 4. Casos de referência (Fase 2)

### 4.1 Ra por latitude e dia do ano — cálculo passo-a-passo

Para verificar isoladamente as equações 21, 23, 24, 25. Todos os valores
esperados abaixo são derivados manualmente das equações do FAO-56 (não da
função sob teste). Cada linha pode ser reproduzida com uma calculadora.

**Caso R1: latitude 45.72°N, J = 187 (6 de julho, ano não bissexto)**

Passo a passo:
- `φ = 45.72° × π/180 = 0.79797 rad`
- `dr = 1 + 0.033·cos(2π·187/365) = 1 + 0.033·(−0.99823) = 0.96706`
- `δ = 0.409·sin(2π·187/365 − 1.39) = 0.409·sin(1.82868) = 0.409·0.96697 = 0.39550 rad`
- `tan(φ) = 1.02397 ; tan(δ) = 0.41752`
- `ωs = acos(−1.02397·0.41752) = acos(−0.42753) = 2.01216 rad`
- `sin(φ) = 0.71562 ; sin(δ) = 0.38510 ; cos(φ) = 0.69848 ; cos(δ) = 0.92289 ; sin(ωs) = 0.90416`
- Termos:
  - `ωs·sin(φ)·sin(δ) = 2.01216·0.71562·0.38510 = 0.55444`
  - `cos(φ)·cos(δ)·sin(ωs) = 0.69848·0.92289·0.90416 = 0.58292`
  - Soma = `1.13736`
- `Ra = (1440/π)·0.0820·0.96706·1.13736 = 458.366·0.0820·0.96706·1.13736`
- `Ra ≈ 41.35 MJ/m²/dia`

**Tolerância adotada: ±0.10 MJ/m²/dia (≈0.25%)** — justificativa: FAO-56 Table 2.6
publica Ra com 1 casa decimal; passo natural 0.1.

**Caso R2: latitude 20°S, J = 15 (15 de janeiro — verão HS)**

- `φ = −0.34907 rad ; J = 15`
- `dr = 1 + 0.033·cos(0.25816) = 1 + 0.033·0.96688 = 1.03191`
- `δ = 0.409·sin(0.25816 − 1.39) = 0.409·sin(−1.13184) = 0.409·(−0.90548) = −0.37034 rad`
- `tan(φ) = −0.36397 ; tan(δ) = −0.38784`
- `ωs = acos(−(−0.36397)·(−0.38784)) = acos(−0.14116) = 1.71241 rad`
- `sin(φ) = −0.34202 ; sin(δ) = −0.36179 ; cos(φ) = 0.93969 ; cos(δ) = 0.93225 ; sin(ωs) = 0.98999`
- Termos:
  - `ωs·sin(φ)·sin(δ) = 1.71241·(−0.34202)·(−0.36179) = 0.21193`
  - `cos(φ)·cos(δ)·sin(ωs) = 0.93969·0.93225·0.98999 = 0.86727`
  - Soma = `1.07920`
- `Ra = 458.366·0.0820·1.03191·1.07920 ≈ 41.86 MJ/m²/dia`

**Caso R3: latitude 40°N, J = 196 (15 de julho — verão HN)**

- `φ = 0.69813 rad ; J = 196`
- `dr = 1 + 0.033·cos(2π·196/365) = 1 + 0.033·(−0.96784) = 0.96806`
- `δ = 0.409·sin(2π·196/365 − 1.39) = 0.409·sin(1.98357) = 0.409·0.91829 = 0.37558 rad`
- `sin(φ) = 0.64279 ; cos(φ) = 0.76604 ; sin(δ) = 0.36703 ; cos(δ) = 0.93018 ; tan(φ) = 0.83910 ; tan(δ) = 0.39457`
- `ωs = acos(−0.83910·0.39457) = acos(−0.33104) = 1.90775 rad ; sin(ωs) = 0.94360`
- Termos:
  - `ωs·sin(φ)·sin(δ) = 1.90775·0.64279·0.36703 = 0.45011`
  - `cos(φ)·cos(δ)·sin(ωs) = 0.76604·0.93018·0.94360 = 0.67237`
  - Soma = `1.12248`
- `Ra = 458.366·0.0820·0.96806·1.12248 ≈ 40.87 MJ/m²/dia`

**Caso R4: latitude 20°S, J = 196 (15 de julho — inverno HS)**

- `φ = −0.34907 rad`
- Idem dr e δ do R3: `dr = 0.96806 ; δ = 0.37558 rad`
- `sin(φ) = −0.34202 ; cos(φ) = 0.93969 ; sin(δ) = 0.36703 ; cos(δ) = 0.93018 ; tan(φ) = −0.36397 ; tan(δ) = 0.39457`
- `ωs = acos(−(−0.36397)·0.39457) = acos(0.14361) = 1.42679 rad ; sin(ωs) = 0.98964`
- Termos:
  - `ωs·sin(φ)·sin(δ) = 1.42679·(−0.34202)·0.36703 = −0.17913`
  - `cos(φ)·cos(δ)·sin(ωs) = 0.93969·0.93018·0.98964 = 0.86502`
  - Soma = `0.68589`
- `Ra = 458.366·0.0820·0.96806·0.68589 ≈ 24.97 MJ/m²/dia`

### 4.2 Intermediários termodinâmicos — FAO-56 Chapter 3 (worked steps)

Entradas: `Tmin = 12.3 °C ; Tmax = 21.5 °C ; RHmax = 84% ; RHmin = 63%`

| Grandeza | Cálculo passo-a-passo | Esperado | Tolerância |
|---|---|---|---|
| e°(Tmin) | `0.6108·exp(17.27·12.3/(12.3+237.3))` = `0.6108·exp(0.85114)` = 1.4293 | 1.429 kPa | ±0.005 |
| e°(Tmax) | `0.6108·exp(17.27·21.5/(21.5+237.3))` = `0.6108·exp(1.43450)` = 2.5641 | 2.564 kPa | ±0.005 |
| es | `(1.4293+2.5641)/2` = 1.9967 | 1.997 kPa | ±0.005 |
| ea | `(1.4293·0.84 + 2.5641·0.63)/2` = `(1.2006 + 1.6154)/2` = 1.4080 | 1.409 kPa | ±0.005 |
| VPD | `1.997 − 1.409` = 0.588 | 0.588 kPa | ±0.005 |
| Tmean (derivada) | `(12.3+21.5)/2` = 16.9 | 16.9 °C | exato |
| Δ (em Tmean=16.9) | `4098·e°(16.9)/(16.9+237.3)²`, com `e°(16.9)=1.929` → `4098·1.929/64577` = 0.1224 | 0.122 kPa/°C | ±0.0005 |
| P (z=100 m) | `101.3·((293−0.65)/293)^5.26` = `101.3·(0.99778)^5.26` = 100.12 | 100.1 kPa | ±0.005 |
| γ | `0.000665·100.12` = 0.06658 | 0.0666 kPa/°C | ±0.0005 |

### 4.3 Ajuste de vento (FAO-56 eq. 47)

- `u2(uz=5, z=10) = 5·4.87/ln(67.8·10 − 5.42) = 5·4.87/6.5117 = 5·0.7480 = 3.740`
- `u2(uz=uz, z=2) = uz` (curto-circuito, sem alteração numérica)

Tolerância: ±0.001 m/s. Validado na Etapa 1 (`weatherUnits.test.ts`).

---

## 5. Testes de sensibilidade (Fase 3)

Verificam **monotonicidade** e coerência física, não valores absolutos:

1. **ETo × Rs**: fixado tudo, crescendo Rs em 5 pontos → ETo estritamente crescente.
2. **ETo × u2**: idem com u2.
3. **ETo × VPD**: idem, forçando VPD via RHmean baixando.
4. **Quente-úmido vs quente-seco**: mesmo Rs, Tmean → seco tem ETo maior.
5. **Verão vs inverno HN (mesma latitude)**: Ra_verão > Ra_inverno.
6. **HN vs HS na mesma data**: sinal correto (verão N ↔ inverno S).
7. **Não-negatividade**: 20 amostras aleatórias plausíveis → ETo ≥ 0 sempre.

---

## 6. Comportamento com dados ausentes (Fase 4)

| Ausência | Comportamento verificado |
|---|---|
| Tmin, Tmax | `qualityStatus: "missing"` — ETo = null |
| Tmean | Derivada de (Tmin+Tmax)/2 e registrada em `estimatedFields` |
| RHmin+RHmax e RHmean | `missing` (nem ea derivável) |
| RHmin+RHmax ausentes, RHmean presente | ea derivada de RHmean e marcada como estimada |
| `actualVapourPressureKpa` fornecida | Tem precedência sobre RH |
| u | `missing` |
| Rs | `missing` |
| altitude ausente + pressão ausente | `missing` (P não estimável) |
| altitude ausente + pressão fornecida | Rso usa `0.75·Ra` + warning explícito |
| latitude não-finita | Ra = null → `missing` |
| data inválida | erro `Data inválida em referenceEtoFao56` (fail-fast) |

`null` **nunca** é convertido em zero em nenhum caminho.

---

## 7. Consistência numérica (Fase 5)

- **Graus × Radianos**: só `latitude` é convertida (única entrada em graus). Todo o resto (δ, ωs, φ) permanece em rad; `sin/cos/tan` sempre em rad. ✅
- **K × °C**: `T + 273.16` só em Rnl (Stefan-Boltzmann); `T + 273` no termo aerodinâmico (FAO-56 eq. 6). Coerente com FAO-56. ✅
- **kPa consistente**: P, γ (kPa/°C), es, ea, VPD, Δ (kPa/°C). ✅
- **Divisão por zero**: `max(rso, 0.01)` protege; denominador Penman-Monteith sempre > 0. ✅
- **NaN/Infinity**: `Math.max(-1, Math.min(1, …))` em `acos` previne NaN em latitudes/dias extremos. Testes cobrem latitude 90°N/90°S, elevações extremas. ✅
- **Anos bissextos**: `Date.UTC(y,0,0)` é 31/dez do ano anterior; `floor((t − start)/86400000)` retorna `J∈[1..366]` sem código adicional. Teste dedicado. ✅
- **Hemisfério Sul**: validado por R2 e R4 acima. ✅

---

## 8. Conclusão de aprovação

Preencher após a execução dos testes:

- [x] Todas as 20 equações mapeadas para o FAO-56 e verificadas.
- [x] Correções I1 e I2 aplicadas — nenhuma fórmula alterada.
- [x] Intermediários termodinâmicos (§4.2) batem dentro da tolerância.
- [x] Ra em 4 pares latitude/dia (§4.1) dentro de ±0.10 MJ/m²/d.
- [x] Sensibilidades e monotonicidades coerentes (§5).
- [x] Regras de dados ausentes conforme §6 — `null` nunca vira zero.
- [x] Sem NaN/Infinity nos testes.
- [x] 34 testes anteriores passando.
- [x] `tsc --noEmit` e `npm run build` limpos.

**Motor aprovado para integração futura** — sujeito à revisão do usuário
para os valores publicados no FAO-56 Example 17 (§4.2 usa os intermediários
publicados; ETo final do exemplo pode diferir do nosso valor calculado
conforme o Rs de partida — o que é esperado e não invalida o motor).

---

## 9. O que NÃO foi alterado (escopo)

- ❌ `open-meteo.ts`, `meteoblue.ts`, `ingestion.service.ts`, `weather.service.ts`, `virtual-station.service.ts`, `source-resolver.ts`, `provider-registry.ts`, `meteoblue-ingest.ts`.
- ❌ `modules/irrigation/services/irrigation.service.ts` (mantém o `calculateET0` atual em produção).
- ❌ Nenhuma tabela, migration, RLS, política Supabase.
- ❌ Nenhuma rota API, tela ou componente do frontend.
- ❌ Nenhuma variável de ambiente nova.
- ❌ Nenhuma dependência nova.
