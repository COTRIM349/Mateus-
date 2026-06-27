# Fórmulas Agronômicas — Cotrim Irrigação Pro

Referências principais:
- **FAO-56**: Allen, R.G.; Pereira, L.S.; Raes, D.; Smith, M. (1998). *Crop evapotranspiration — Guidelines for computing crop water requirements*. FAO Irrigation and Drainage Paper 56.
- **Embrapa**: Boletins técnicos de irrigação e manejo hídrico.

---

## 1. ET0 — Evapotranspiração de referência (Penman-Monteith FAO-56)

A ET0 representa a demanda evapotranspirativa da atmosfera para uma cultura de referência (grama) em condições ideais de água.

### Fórmula

```
ET0 = [0.408 × Δ × (Rn - G) + γ × (900 / (T + 273)) × u₂ × (es - ea)] / [Δ + γ × (1 + 0.34 × u₂)]
```

### Variáveis

| Símbolo | Descrição | Unidade |
|---|---|---|
| ET0 | Evapotranspiração de referência | mm/dia |
| Δ | Inclinação da curva de pressão de vapor | kPa/°C |
| Rn | Radiação líquida na superfície | MJ/m²/dia |
| G | Fluxo de calor no solo (≈ 0 para diário) | MJ/m²/dia |
| γ | Constante psicrométrica | kPa/°C |
| T | Temperatura média do ar | °C |
| u₂ | Velocidade do vento a 2 m de altura | m/s |
| es | Pressão de vapor de saturação | kPa |
| ea | Pressão de vapor real | kPa |

### Cálculos intermediários

**Pressão de vapor de saturação:**
```
e°(T) = 0.6108 × exp[(17.27 × T) / (T + 237.3)]
es = [e°(Tmáx) + e°(Tmín)] / 2
```

**Pressão de vapor real:**
```
ea = es × (UR / 100)
```

**Inclinação da curva de pressão de vapor:**
```
Δ = [4098 × e°(T)] / (T + 237.3)²
```

**Constante psicrométrica:**
```
P = 101.3 × [(293 - 0.0065 × z) / 293]^5.26
γ = 0.000665 × P
```
Onde `z` = altitude em metros.

**Radiação extraterrestre (Ra):**
```
dr = 1 + 0.033 × cos(2π/365 × J)
δ = 0.409 × sin(2π/365 × J - 1.39)
ωs = arccos[-tan(φ) × tan(δ)]
Ra = (24×60/π) × Gsc × dr × [ωs × sin(φ) × sin(δ) + cos(φ) × cos(δ) × sin(ωs)]
```
Onde `J` = dia do ano, `φ` = latitude em radianos, `Gsc` = 0.0820 MJ/m²/min.

**Radiação líquida:**
```
Rns = (1 - α) × Rs          (α = 0.23 para cultura de referência)
Rnl = σ × [(Tmáx⁴ + Tmín⁴)/2] × (0.34 - 0.14√ea) × (1.35 × Rs/Rso - 0.35)
Rn = Rns - Rnl
```

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateET0()`

---

## 2. ETc — Evapotranspiração da cultura

A ETc ajusta a ET0 para a cultura e o estágio fenológico específico.

### Fórmula

```
ETc = ET0 × Kc
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| ETc | Evapotranspiração da cultura | mm/dia |
| ET0 | Evapotranspiração de referência | mm/dia |
| Kc | Coeficiente de cultura | adimensional |

### Valores de Kc (FAO-56)

| Cultura | Germinação | Vegetativo | Floração | Enchimento | Maturação |
|---|---|---|---|---|---|
| Soja | 0.40 | 0.80 | 1.15 | 1.15 | 0.50 |
| Milho | 0.30 | 0.70 | 1.20 | 1.15 | 0.60 |
| Algodão | 0.35 | 0.75 | 1.20 | 1.15 | 0.70 |
| Cacau | 0.90 | 1.00 | 1.05 | 1.05 | 1.00 |

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateETc()`

---

## 3. CAD — Capacidade de Água Disponível

Quantidade total de água que o solo pode reter na zona radicular e que está disponível para a planta.

### Fórmula

```
CAD = (CC - PMP) × Z × 1000
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| CAD | Capacidade de água disponível | mm |
| CC | Capacidade de campo | cm³/cm³ |
| PMP | Ponto de murcha permanente | cm³/cm³ |
| Z | Profundidade efetiva das raízes | m |

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateCAD()`

---

## 4. AFD — Água Facilmente Disponível

Fração da CAD que a planta consegue extrair sem estresse hídrico.

### Fórmula

```
AFD = CAD × p
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| AFD | Água facilmente disponível | mm |
| CAD | Capacidade de água disponível | mm |
| p | Fator de depleção da cultura | adimensional (0-1) |

### Valores de p (FAO-56, Tabela 22)

| Cultura | Fator p |
|---|---|
| Soja | 0.50 |
| Milho | 0.55 |
| Algodão | 0.65 |
| Cacau | 0.30 |

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateAvailableWater()`

---

## 5. Lâmina de irrigação

### Lâmina líquida (o que a planta precisa receber)

```
LL = déficit acumulado
```

### Lâmina bruta (o que o sistema precisa aplicar)

```
LB = LL / Ef
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| LL | Lâmina líquida | mm |
| LB | Lâmina bruta | mm |
| Ef | Eficiência do sistema de irrigação | adimensional (0-1) |

Eficiência típica de pivô central: 0.80 a 0.90.

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateIrrigation()`

---

## 6. Volume de água

```
V = LB × A × 10
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| V | Volume de água | m³ |
| LB | Lâmina bruta | mm |
| A | Área irrigada | ha |

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateVolume()`

---

## 7. Tempo de irrigação

```
Ti = V / Q
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| Ti | Tempo de irrigação | horas |
| V | Volume de água | m³ |
| Q | Vazão do sistema | m³/h |

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateIrrigationTime()`

---

## 8. Energia elétrica

```
E = (Pot × 0.7355 / η) × Ti
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| E | Consumo de energia | kWh |
| Pot | Potência da bomba | CV |
| 0.7355 | Fator de conversão CV → kW | kW/CV |
| η | Rendimento do motor | adimensional (0-1) |
| Ti | Tempo de irrigação | horas |

**Implementação:** `modules/energy/services/energy.service.ts` → `calculateEnergy()`

---

## 9. Custo energético

```
C = E × Tarifa
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| C | Custo da irrigação | R$ |
| E | Consumo de energia | kWh |
| Tarifa | Tarifa da concessionária | R$/kWh |

**Implementação:** `modules/energy/services/energy.service.ts` → `calculateEnergyCost()`

---

## 10. Precipitação efetiva (USDA SCS)

```
Se P ≤ 250 mm:  Pe = P × (125 - 0.2 × P) / 125
Se P > 250 mm:  Pe = 125 + 0.1 × P
```

| Símbolo | Descrição | Unidade |
|---|---|---|
| Pe | Precipitação efetiva | mm |
| P | Precipitação bruta | mm |

**Implementação:** `modules/weather/services/weather.service.ts` → `calculateEffectivePrecipitation()`

---

## 11. Prioridade de irrigação

```
Se deficit ≥ 80% da AFD → ALTA
Se deficit ≥ 50% da AFD → MÉDIA
Se deficit < 50% da AFD → BAIXA
```

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculatePriority()`

---

## 12. Risco produtivo

```
Risco base = (deficit / AFD) × 100
Multiplicador de estágio: 1.3 para floração e enchimento, 1.0 para demais
Risco final = clamp(Risco base × Multiplicador, 0, 100)
```

**Implementação:** `modules/irrigation/services/irrigation.service.ts` → `calculateProductiveRisk()`

---

## 13. Balanço hídrico diário

O balanço hídrico diário de cada pivô é atualizado pela seguinte sequência:

```
1. ETc = ET0 × Kc
2. Pef = precipitaçãoEfetiva(P)
3. déficit += ETc - Pef - lâminaAplicada
4. déficit = max(déficit, 0)     ← não pode ser negativo
5. armazenamento = CAD - déficit
```

O balanço começa na capacidade de campo (déficit = 0) no início da safra ou após uma irrigação que leve o solo à CC.

**Implementação:** futuro service `modules/irrigation/services/water-balance.service.ts`
