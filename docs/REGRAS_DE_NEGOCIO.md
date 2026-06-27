# Regras de Negócio — Manejo de Irrigação

**Cotrim Irrigação Pro — Documento de referência oficial**

Este documento define como a plataforma pensa, decide e calcula.
Toda implementação futura (services, APIs, telas) deve seguir estas regras.

Referências técnicas:
- FAO-56 — Allen, Pereira, Raes & Smith (1998)
- Embrapa — Boletins de irrigação e manejo hídrico
- USDA Soil Conservation Service
- Bernardo, Soares & Mantovani — *Irrigação: princípios e métodos* (2019)
- Doorenbos & Kassam — FAO-33 *Yield response to water*

---

## Índice

1. [Clima](#1-clima)
2. [Solo](#2-solo)
3. [Cultura](#3-cultura)
4. [Balanço Hídrico](#4-balanço-hídrico)
5. [Recomendação de Irrigação](#5-recomendação-de-irrigação)
6. [Programação de Irrigação](#6-programação-de-irrigação)
7. [Energia](#7-energia)
8. [Alertas de Manejo](#8-alertas-de-manejo)

---

# 1. Clima

O clima é a entrada primária do sistema. Sem dados climáticos confiáveis, nenhum cálculo de manejo é possível.

## 1.1 Evapotranspiração de referência (ET₀)

### O que é

ET₀ é a demanda evapotranspirativa da atmosfera para uma cultura hipotética de referência (grama, 12 cm de altura, resistência superficial de 70 s/m, albedo de 0,23), em condições ótimas de água.

Representa "quanta água a atmosfera está pedindo" naquele dia.

### Método de cálculo

Penman-Monteith FAO-56 — é o método padrão internacional. A plataforma não deve usar métodos simplificados (Hargreaves, Thornthwaite) como primários. Eles podem ser usados como fallback quando faltam variáveis.

### Fórmula

```
ET₀ = [0,408 × Δ × (Rn - G) + γ × (900 / (T + 273)) × u₂ × (es - ea)] / [Δ + γ × (1 + 0,34 × u₂)]
```

### Variáveis necessárias (por dia)

| Variável | Símbolo | Unidade | Obrigatória | Fonte |
|---|---|---|---|---|
| Temperatura máxima | Tmáx | °C | Sim | Estação |
| Temperatura mínima | Tmín | °C | Sim | Estação |
| Umidade relativa média | UR | % | Sim | Estação |
| Velocidade do vento a 2 m | u₂ | m/s | Sim | Estação |
| Radiação solar | Rs | MJ/m²/dia | Sim | Estação |
| Altitude da estação | z | m | Sim | Cadastro |
| Latitude da estação | φ | graus | Sim | Cadastro |
| Dia do ano | J | 1-365 | Sim | Calculado |

### Cálculos intermediários

**Pressão atmosférica:**
```
P = 101,3 × [(293 - 0,0065 × z) / 293]^5,26
```

**Constante psicrométrica:**
```
γ = 0,000665 × P
```

**Pressão de vapor de saturação:**
```
e°(T) = 0,6108 × exp[(17,27 × T) / (T + 237,3)]
es = [e°(Tmáx) + e°(Tmín)] / 2
```

**Pressão de vapor real:**
```
ea = es × (UR / 100)
```

**Inclinação da curva de pressão de vapor:**
```
Δ = [4098 × e°(Tméd)] / (Tméd + 237,3)²
```

**Distância relativa Terra-Sol:**
```
dr = 1 + 0,033 × cos(2π/365 × J)
```

**Declinação solar:**
```
δ = 0,409 × sin(2π/365 × J - 1,39)
```

**Ângulo horário do pôr do sol:**
```
ωs = arccos[-tan(φ) × tan(δ)]
```

**Radiação extraterrestre:**
```
Ra = (24×60/π) × Gsc × dr × [ωs × sin(φ) × sin(δ) + cos(φ) × cos(δ) × sin(ωs)]
```
Onde Gsc = 0,0820 MJ/m²/min.

**Radiação de ondas curtas líquida:**
```
Rns = (1 - α) × Rs       (α = 0,23)
```

**Radiação de céu claro:**
```
Rso = (0,75 + 2×10⁻⁵ × z) × Ra
```

**Radiação de ondas longas líquida:**
```
Rnl = σ × [(Tmáx_K⁴ + Tmín_K⁴) / 2] × (0,34 - 0,14 × √ea) × (1,35 × Rs/Rso - 0,35)
```
Onde σ = 4,903×10⁻⁹ MJ/m²/dia/K⁴ e Tmáx_K = Tmáx + 273,16.

**Radiação líquida:**
```
Rn = Rns - Rnl
```

**Fluxo de calor no solo (escala diária):**
```
G = 0
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CLI-01 | ET₀ é calculada diariamente, uma vez por estação meteorológica. |
| R-CLI-02 | Se qualquer variável obrigatória estiver ausente, o sistema deve: (a) tentar estimar com Hargreaves como fallback; (b) marcar o dado como "estimado"; (c) gerar alerta de qualidade. |
| R-CLI-03 | Hargreaves fallback: `ET₀ = 0,0023 × (Tméd + 17,8) × (Tmáx - Tmín)^0,5 × Ra / 2,45`. Usar apenas quando Rs, UR ou u₂ estiverem indisponíveis. |
| R-CLI-04 | ET₀ típica no Brasil central: 3 a 8 mm/dia. Valores fora de 0,5 a 12 mm/dia devem gerar alerta de qualidade. |
| R-CLI-05 | Se não houver dados climáticos por mais de 2 dias consecutivos, gerar alerta crítico e suspender recomendações automáticas. |
| R-CLI-06 | A ET₀ calculada é armazenada em `WeatherData.et0_mm`. |

### Como ET₀ influencia o manejo

- ET₀ alta (> 6 mm/dia): ambiente muito demandante → culturas consomem mais água → déficit cresce rápido → irrigações mais frequentes.
- ET₀ baixa (< 3 mm/dia): dias nublados, chuvosos ou frios → consumo reduzido → pode-se adiar irrigação.
- ET₀ é o multiplicador base de todo o balanço hídrico. Um erro de 1 mm/dia em ET₀ acumula 30 mm de erro em um mês.

---

## 1.2 Precipitação

### Precipitação bruta (P)

Quantidade total de chuva registrada no dia (mm).

### Precipitação efetiva (Pe)

Parcela da chuva que efetivamente fica disponível na zona radicular. Parte da chuva se perde por escoamento superficial, percolação profunda e interceptação pela copa.

### Método de cálculo — USDA SCS

```
Se P ≤ 250 mm:   Pe = P × (125 - 0,2 × P) / 125
Se P > 250 mm:   Pe = 125 + 0,1 × P
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CLI-07 | Precipitação bruta vem de: (a) estação meteorológica automática; (b) pluviômetro/sensor; (c) entrada manual. |
| R-CLI-08 | O sistema deve calcular Pe automaticamente usando USDA SCS. |
| R-CLI-09 | Chuvas < 2 mm não são consideradas efetivas (perdem-se por interceptação). Pe = 0 para P < 2 mm. |
| R-CLI-10 | Chuvas de alta intensidade (> 30 mm/h) têm eficiência reduzida. Se a intensidade estiver disponível, aplicar fator de redução: Pe = Pe_SCS × 0,7 para I > 30 mm/h. |
| R-CLI-11 | Se a fazenda possui múltiplas fontes de precipitação (estação + pluviômetro manual), o sistema deve permitir definir uma fonte primária. |
| R-CLI-12 | Precipitação reduz o déficit hídrico no balanço. Após chuva significativa (> AFD), o déficit pode zerar. |

### Como a chuva influencia o manejo

- Chuva efetiva reduz o déficit → pode cancelar ou adiar irrigação programada.
- Chuva intensa mas de curta duração → baixa efetividade (muito escoamento) → déficit pode não ser eliminado.
- Chuva prevista (previsão meteorológica): o sistema pode recomendar adiar irrigação se há previsão confiável de chuva > 10 mm nas próximas 24-48h.

---

## 1.3 Temperatura

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CLI-13 | Temperatura entra no cálculo de ET₀ (es, ea, Δ, Rnl). |
| R-CLI-14 | Amplitude térmica (Tmáx - Tmín) influencia a estimativa quando se usa Hargreaves. |
| R-CLI-15 | Temperaturas extremas (> 40°C ou < 5°C) devem gerar alertas de estresse térmico para culturas sensíveis. |
| R-CLI-16 | Temperatura média = (Tmáx + Tmín) / 2 — usada na maioria dos cálculos intermediários. |

---

## 1.4 Umidade relativa do ar

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CLI-17 | UR entra no cálculo da pressão de vapor real (ea = es × UR/100). |
| R-CLI-18 | UR baixa (< 30%): ar muito seco → ET₀ elevada → maior demanda hídrica. |
| R-CLI-19 | UR alta (> 80%): ar úmido → ET₀ reduzida, mas risco de doenças fúngicas. Gerar alerta fitossanitário informativo. |
| R-CLI-20 | UR fora do intervalo 5-100% é inválida → gerar alerta de qualidade do sensor. |

---

## 1.5 Vento

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CLI-21 | A velocidade do vento deve ser medida ou corrigida para 2 m de altura. Se medida a outra altura (h): `u₂ = uz × 4,87 / ln(67,8 × h - 5,42)`. |
| R-CLI-22 | Vento forte (> 5 m/s) aumenta ET₀ significativamente → mais demanda. |
| R-CLI-23 | Vento > 7 m/s compromete a uniformidade da irrigação por pivô. Gerar alerta: "Vento elevado — considerar adiar irrigação ou operar em velocidade reduzida". |
| R-CLI-24 | Ventos acima de 10 m/s: suspender recomendação de irrigação e alertar operador. A eficiência do pivô cai abaixo de 70%. |

---

## 1.6 Radiação solar

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CLI-25 | Radiação solar (Rs) é a variável mais impactante na ET₀ depois da temperatura. |
| R-CLI-26 | Rs deve estar entre 0 e Ra (radiação extraterrestre). Rs > Ra indica erro de sensor. |
| R-CLI-27 | Dias nublados (Rs < 40% de Ra): ET₀ reduzida → menor consumo → pode adiar irrigação. |
| R-CLI-28 | Se Rs não estiver disponível, estimar pela fórmula de Ångström: `Rs = (a + b × n/N) × Ra`, com a=0,25 e b=0,50 para regiões tropicais. |

---

## 1.7 Previsão meteorológica

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CLI-29 | A previsão meteorológica é informativa, não deve substituir dados medidos. |
| R-CLI-30 | O sistema pode usar previsão de chuva para recomendar adiamento: se previsão > 10 mm em 24h com confiança > 70%, sugerir adiar pivôs de prioridade baixa e média. |
| R-CLI-31 | Pivôs com prioridade alta (déficit > 80% da AFD) não devem ser adiados por previsão de chuva — o risco produtivo é alto demais. |
| R-CLI-32 | Previsão de temperatura extrema (geada ou calor > 42°C) deve gerar alerta de manejo especial. |
| R-CLI-33 | Fonte da previsão deve ser registrada (API externa, manual). Futuramente integrável com APIs meteorológicas. |

---

# 2. Solo

O solo é o reservatório natural de água para as plantas. Suas propriedades determinam quanta água pode ser armazenada e quanto a planta pode extrair.

## 2.1 Textura do solo

### Classificação utilizada

| Textura | CC típica (cm³/cm³) | PMP típico (cm³/cm³) | VIB típica (mm/h) |
|---|---|---|---|
| Arenoso | 0,10 - 0,15 | 0,04 - 0,08 | 50 - 200 |
| Franco-arenoso | 0,15 - 0,22 | 0,06 - 0,10 | 25 - 75 |
| Franco | 0,22 - 0,32 | 0,10 - 0,15 | 12 - 25 |
| Franco-argiloso | 0,28 - 0,36 | 0,14 - 0,20 | 6 - 12 |
| Argiloso | 0,32 - 0,40 | 0,18 - 0,24 | 2 - 6 |
| Muito argiloso | 0,36 - 0,45 | 0,22 - 0,28 | 0,5 - 2 |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-01 | Textura determina os valores padrão de CC, PMP e VIB quando o usuário não informa valores laboratoriais. |
| R-SOL-02 | Solos arenosos: baixa CAD → irrigações mais frequentes, com lâminas menores. |
| R-SOL-03 | Solos argilosos: alta CAD → irrigações menos frequentes, com lâminas maiores, mas atenção à VIB. |
| R-SOL-04 | A textura deve ser cadastrada obrigatoriamente para cada solo. |

---

## 2.2 Densidade aparente (Da)

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-05 | Densidade aparente é informativa nesta versão. Futuramente será usada para cálculo de CAD volumétrica avançada. |
| R-SOL-06 | Valores típicos: 1,0 a 1,8 g/cm³. Valores fora desse intervalo devem gerar alerta de cadastro. |

---

## 2.3 Capacidade de campo (CC)

### O que é

Volume de água retido no solo após drenagem livre (gravidade). É o limite superior de água disponível.

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-07 | CC deve ser informada em cm³/cm³ (ou m³/m³). Valores entre 0,08 e 0,45. |
| R-SOL-08 | Idealmente vem de análise laboratorial. Quando não disponível, usar o valor padrão da textura. |
| R-SOL-09 | CC é o "teto" do reservatório de solo. Após irrigação ou chuva que leve o solo à CC, o déficit é zero. |

---

## 2.4 Ponto de murcha permanente (PMP)

### O que é

Volume de água no solo abaixo do qual a planta não consegue extrair água. É o limite inferior de água disponível.

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-10 | PMP em cm³/cm³. Valores entre 0,03 e 0,28. |
| R-SOL-11 | Se o solo atingir PMP, a planta está em estresse severo e irreversível. O sistema nunca deve permitir que o déficit alcance 100% da CAD. |
| R-SOL-12 | CC > PMP é obrigatório. Se CC ≤ PMP no cadastro, rejeitar com erro de validação. |

---

## 2.5 Capacidade de Água Disponível (CAD)

### Fórmula

```
CAD = (CC - PMP) × Z × 1000
```

Onde:
- CC = Capacidade de campo (cm³/cm³)
- PMP = Ponto de murcha permanente (cm³/cm³)
- Z = Profundidade efetiva das raízes (m)
- 1000 = Fator de conversão para mm

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-13 | CAD é calculada automaticamente pelo sistema usando os parâmetros do solo e a profundidade de raízes do estágio fenológico atual. |
| R-SOL-14 | CAD muda ao longo do ciclo da cultura porque Z (profundidade de raízes) aumenta com o crescimento. |
| R-SOL-15 | CAD típica para pivô central no Brasil: 30 a 80 mm. |
| R-SOL-16 | CAD deve ser recalculada sempre que o estágio fenológico muda (novo Kc implica nova Z). |

### Exemplo

Solo franco-argiloso (CC=0,30; PMP=0,16) com soja em floração (Z=0,50m):
```
CAD = (0,30 - 0,16) × 0,50 × 1000 = 70 mm
```

---

## 2.6 Água Facilmente Disponível (AFD)

### Fórmula

```
AFD = CAD × p
```

Onde p = fator de depleção da cultura (0 a 1).

### O que significa

AFD é a fração da CAD que a planta consegue extrair sem redução de crescimento ou produtividade. É o "limite de conforto hídrico".

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-17 | AFD é o limiar de irrigação: quando o déficit atinge a AFD, é hora de irrigar. |
| R-SOL-18 | Irrigar quando déficit < AFD desperdiça energia e água (irrigação desnecessária). |
| R-SOL-19 | Deixar o déficit ultrapassar AFD reduz a produtividade proporcionalmente. |
| R-SOL-20 | O fator p depende da cultura (ver seção 3) e do ET₀: quando ET₀ > 5 mm/dia, reduzir p em 0,04 por mm acima de 5. Isso representa a dificuldade de a planta extrair água em dias muito quentes. |
| R-SOL-21 | Ajuste de p por ET₀: `p_ajustado = p_tabela + 0,04 × (5 - ET₀)`. Clampar entre 0,1 e 0,8. |

### Exemplo

Soja (p=0,50), CAD=70 mm, ET₀=7 mm/dia:
```
p_ajustado = 0,50 + 0,04 × (5 - 7) = 0,50 - 0,08 = 0,42
AFD = 70 × 0,42 = 29,4 mm
```
Em dias quentes, a AFD diminui → irrigação precisa ocorrer antes.

---

## 2.7 Velocidade de Infiltração Básica (VIB)

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-22 | VIB limita a intensidade de aplicação do pivô. Se a intensidade de aplicação (mm/h) for maior que a VIB, ocorre escoamento superficial. |
| R-SOL-23 | Intensidade de aplicação do pivô: `Ia = (Q × 1000) / (π × R² × Ef)` onde Q=vazão (m³/h), R=raio (m), Ef=eficiência. Simplificação: considerar que pivôs modernos aplicam 5-15 mm/h na extremidade. |
| R-SOL-24 | Se VIB < intensidade de aplicação do pivô, gerar alerta: "Risco de escoamento superficial — considerar redução de velocidade ou irrigação fracionada". |
| R-SOL-25 | Solos arenosos toleram alta intensidade (VIB > 50 mm/h). Solos argilosos são limitantes (VIB < 6 mm/h). |

---

## 2.8 Profundidade efetiva das raízes (Z)

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-SOL-26 | Z determina o volume de solo explorado pela cultura. Maior Z → maior CAD → mais água disponível. |
| R-SOL-27 | Z varia com o estágio fenológico. No início (germinação): Z é pequeno (20-30% do máximo). Na floração: Z atinge o máximo. |
| R-SOL-28 | O sistema deve interpolar Z linearmente entre os estágios: `Z_atual = Z_ini + (Z_max - Z_ini) × (DAP / DAP_max_veg)`, limitado a Z_max. |
| R-SOL-29 | Z máximo por cultura: Soja=0,60m; Milho=0,80m; Algodão=1,00m; Cacau=1,20m. |

---

# 3. Cultura

A cultura define a demanda de água (via Kc), a profundidade de exploração do solo (Z) e a sensibilidade ao estresse hídrico.

## 3.1 Fases fenológicas

### Estágios do sistema

| Estágio | Código | Descrição | % do ciclo (referência) |
|---|---|---|---|
| Germinação/Emergência | `germinacao` | Semeadura até estabelecimento | 0-15% |
| Vegetativo | `vegetativo` | Crescimento ativo, cobertura crescente | 15-40% |
| Floração | `floracao` | Florescimento, polinização | 40-60% |
| Enchimento de grãos | `enchimento` | Formação e enchimento dos grãos/frutos | 60-80% |
| Maturação | `maturacao` | Senescência, secagem fisiológica | 80-95% |
| Colheita | `colheita` | Pronto para colher | 95-100% |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CUL-01 | A progressão de estágio é baseada em DAP (dias após plantio). O sistema calcula `DAP = data_atual - planting_date`. |
| R-CUL-02 | A transição entre estágios é definida por percentuais do ciclo total (`Crop.cycle_days`). |
| R-CUL-03 | O operador pode avançar manualmente o estágio (observação de campo). O sistema deve aceitar e ajustar o Kc. |
| R-CUL-04 | Ao mudar de estágio, o sistema recalcula automaticamente: Kc, Z, p, CAD, AFD. |
| R-CUL-05 | A duração de cada estágio pode ser ajustada pela variedade (CropVariety.cycle_days sobrescreve Crop.cycle_days). |

### Determinação automática do estágio por DAP

| Estágio | Início (% do ciclo) | Fim (% do ciclo) |
|---|---|---|
| germinacao | 0% | 15% |
| vegetativo | 15% | 40% |
| floracao | 40% | 60% |
| enchimento | 60% | 80% |
| maturacao | 80% | 95% |
| colheita | 95% | 100% |

Exemplo: Soja com ciclo de 120 dias.
- DAP 0-18: germinação
- DAP 18-48: vegetativo
- DAP 48-72: floração
- DAP 72-96: enchimento
- DAP 96-114: maturação
- DAP 114-120: colheita

---

## 3.2 Coeficiente de cultura (Kc)

### O que é

Kc ajusta a ET₀ para refletir a demanda real de uma cultura específica em um estágio específico. É o fator de conversão de ET₀ para ETc.

### Valores de referência (FAO-56)

| Cultura | Kc_ini | Kc_mid | Kc_end | Ciclo (dias) | Z_max (m) | p |
|---|---|---|---|---|---|---|
| Soja | 0,40 | 1,15 | 0,50 | 120 | 0,60 | 0,50 |
| Milho | 0,30 | 1,20 | 0,60 | 140 | 0,80 | 0,55 |
| Algodão | 0,35 | 1,20 | 0,70 | 180 | 1,00 | 0,65 |
| Cacau | 0,90 | 1,05 | 1,00 | perene | 1,20 | 0,30 |

### Interpolação de Kc ao longo do ciclo

O Kc não salta entre valores — é interpolado linearmente:

**Estágio germinacao:**
```
Kc = Kc_ini
```

**Estágio vegetativo (transição ini → mid):**
```
progresso = (DAP - DAP_inicio_veg) / (DAP_inicio_flo - DAP_inicio_veg)
Kc = Kc_ini + (Kc_mid - Kc_ini) × progresso
```

**Estágio floracao e enchimento:**
```
Kc = Kc_mid
```

**Estágio maturacao (transição mid → end):**
```
progresso = (DAP - DAP_inicio_mat) / (DAP_fim_mat - DAP_inicio_mat)
Kc = Kc_mid + (Kc_end - Kc_mid) × progresso
```

**Estágio colheita:**
```
Kc = Kc_end
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CUL-06 | Kc é interpolado diariamente, não discretizado por estágio. |
| R-CUL-07 | Kc é armazenado em `PivotCropAssignment.kc_current` e atualizado diariamente. |
| R-CUL-08 | O operador pode sobrescrever o Kc calculado (ajuste agronômico de campo). O valor original deve ser preservado para referência. |
| R-CUL-09 | Kc_mid > 1,0 não é erro — culturas como milho e algodão transpiram mais que a referência (grama). |
| R-CUL-10 | Para culturas perenes (cacau), o ciclo não é linear. Usar Kc fixo por estágio sem interpolação temporal. |

---

## 3.3 Profundidade radicular (Z)

### Interpolação ao longo do ciclo

```
Se DAP < DAP_inicio_veg:
  Z = 0,20 × Z_max      (raízes superficiais na emergência)

Se DAP entre veg e flo:
  progresso = (DAP - DAP_inicio_veg) / (DAP_inicio_flo - DAP_inicio_veg)
  Z = (0,20 + 0,80 × progresso) × Z_max

Se DAP ≥ DAP_inicio_flo:
  Z = Z_max
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CUL-11 | Z afeta diretamente a CAD. Raízes mais profundas → mais água disponível → irrigações menos frequentes. |
| R-CUL-12 | Z é atualizado diariamente em `PivotCropAssignment.root_depth_current_m`. |
| R-CUL-13 | Na germinação, Z é raso → CAD pequena → irrigações leves e frequentes. |

---

## 3.4 Fatores de estresse hídrico

### Coeficiente de estresse (Ks)

Quando o déficit ultrapassa a AFD, a planta reduz sua transpiração. O Ks modela essa redução:

```
Se deficit ≤ AFD:
  Ks = 1,0          (sem estresse)

Se deficit > AFD:
  Ks = (CAD - deficit) / (CAD - AFD)
  Ks = max(Ks, 0)   (limitado a zero)
```

### ETc ajustada pelo estresse

```
ETc_aj = ET₀ × Kc × Ks
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CUL-14 | Quando Ks < 1,0, o sistema deve alertar que a cultura está sob estresse hídrico. |
| R-CUL-15 | Quando Ks < 0,5, o sistema deve gerar alerta crítico: "Estresse hídrico severo — risco de perdas irreversíveis". |
| R-CUL-16 | O balanço hídrico padrão usa ETc (sem estresse) para calcular o déficit real. ETc_aj é usada para estimativas de produtividade (futuro). |
| R-CUL-17 | Estresse durante floração e enchimento é o mais danoso à produtividade. O cálculo de `productive_risk` amplifica o risco nesses estágios (multiplicador 1,3). |

### Sensibilidade por cultura e estágio (Ky — FAO-33)

Ky é o fator de resposta da produtividade ao estresse hídrico:

| Cultura | Germinação | Vegetativo | Floração | Enchimento | Maturação | Ciclo total |
|---|---|---|---|---|---|---|
| Soja | 0,20 | 0,20 | 0,80 | 0,75 | — | 0,85 |
| Milho | 0,40 | 0,40 | 1,50 | 0,50 | 0,20 | 1,25 |
| Algodão | 0,20 | 0,20 | 0,50 | 0,25 | — | 0,85 |

```
Perda de produtividade (%) ≈ Ky × (1 - ETc_aj/ETc) × 100
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-CUL-18 | Ky é usado para estimar o risco produtivo e priorizar irrigação. Estágios com Ky alto (floração do milho: 1,50) recebem prioridade máxima. |
| R-CUL-19 | O cálculo de `productive_risk` no WaterBalance deve considerar Ky do estágio: `risco = min(100, (deficit/AFD) × Ky_estágio × 100)`. |
| R-CUL-20 | Futuro: estimar perda de produtividade em kg/ha e R$/ha com base em Ky e preço da commodity. |

---

# 4. Balanço Hídrico

O balanço hídrico é o cálculo central da plataforma. Ele determina, dia a dia, o estado hídrico de cada pivô.

## 4.1 Conceito

O solo é um reservatório. Todo dia:
- Água **sai** do reservatório pela evapotranspiração (ETc).
- Água **entra** no reservatório pela precipitação efetiva (Pe) e pela irrigação aplicada (I).
- O **déficit** é quanto falta para o solo estar na capacidade de campo.

## 4.2 Equação diária

```
deficit(d) = max(0, deficit(d-1) + ETc(d) - Pe(d) - I(d))
```

### Variáveis

| Variável | Fonte | Unidade |
|---|---|---|
| deficit(d-1) | WaterBalance do dia anterior | mm |
| ETc(d) | ET₀(d) × Kc(d) | mm |
| Pe(d) | calculateEffectivePrecipitation(P(d)) | mm |
| I(d) | IrrigationEvent.applied_depth_mm do dia | mm |

### Variáveis derivadas

```
CAD(d) = (CC - PMP) × Z(d) × 1000
AFD(d) = CAD(d) × p_ajustado(d)
soil_storage(d) = CAD(d) - deficit(d)
```

## 4.3 Condição inicial

```
deficit(dia_0) = 0      (solo na capacidade de campo no início da safra)
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-BH-01 | O balanço hídrico é calculado uma vez por dia, por pivô, para a safra ativa. |
| R-BH-02 | O cálculo é executado em sequência cronológica. O dia D depende do dia D-1. Nunca calcular fora de ordem. |
| R-BH-03 | Déficit nunca é negativo. Se Pe + I > ETc + deficit_anterior, o excedente é percolação (perdido). `deficit = max(0, ...)`. |
| R-BH-04 | Se não houver dados climáticos para o dia, usar a última ET₀ disponível e marcar como "estimado". Gerar alerta. |
| R-BH-05 | Se uma irrigação for registrada retroativamente (evento do dia anterior), o sistema deve recalcular o balanço de todos os dias subsequentes. |
| R-BH-06 | O balanço do dia só é considerado final após o fechamento do dia (meia-noite no fuso da fazenda). Durante o dia, é "preliminar". |
| R-BH-07 | Quando o PivotCropAssignment muda de estágio (e portanto Kc e Z mudam), o balanço do dia seguinte já usa os novos valores. |
| R-BH-08 | Se o estágio é `colheita`, o sistema para de calcular balanço para aquele pivô naquela safra. |

## 4.4 Água disponível e déficit

### Interpretação do déficit

| Condição | Significado | Ação do sistema |
|---|---|---|
| deficit = 0 | Solo na capacidade de campo | Sem necessidade de irrigação |
| deficit < AFD | Água confortável para a planta | Monitorar |
| deficit = AFD | Limite de conforto atingido | Irrigar agora |
| AFD < deficit < CAD | Planta sob estresse hídrico (Ks < 1) | Irrigação urgente |
| deficit ≥ CAD | Ponto de murcha — dano irreversível | Emergência |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-BH-09 | Quando deficit ≥ AFD, gerar recomendação de irrigação com prioridade alta. |
| R-BH-10 | Quando deficit ≥ 50% da AFD, gerar recomendação com prioridade média. |
| R-BH-11 | Quando deficit < 50% da AFD, registrar prioridade baixa (monitorar). |
| R-BH-12 | Quando deficit ≥ 80% da CAD, gerar alerta crítico: "RISCO DE MURCHA — IRRIGAÇÃO EMERGENCIAL NECESSÁRIA". |

## 4.5 Lâmina de irrigação

### Lâmina líquida (LL)

É a quantidade de água que o solo precisa receber para retornar à capacidade de campo.

```
LL = deficit(d)
```

### Lâmina bruta (LB)

É a quantidade de água que o sistema de irrigação precisa aplicar, considerando as perdas.

```
LB = LL / Ef
```

Onde Ef = eficiência do sistema de irrigação (Pivot.system_efficiency).

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-BH-13 | A recomendação padrão é repor 100% do déficit (levar o solo à CC). |
| R-BH-14 | Em alguns cenários pode-se aplicar menos que 100% (irrigação deficitária controlada). Isto é configurável por pivô, mas o padrão é 100%. |
| R-BH-15 | LB > LL sempre (porque Ef < 1,0). |
| R-BH-16 | Eficiência de pivô central: 0,80 a 0,92. Padrão do sistema: 0,85. |
| R-BH-17 | Se VIB do solo for conhecida e a intensidade de aplicação do pivô for maior que VIB, a lâmina deve ser fracionada em múltiplas passadas. Gerar alerta de fracionamento. |

## 4.6 Volume e tempo de irrigação

### Volume

```
Volume (m³) = LB (mm) × Área (ha) × 10
```

### Tempo de irrigação

```
Tempo (h) = Volume (m³) / Vazão (m³/h)
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-BH-18 | Volume e tempo são calculados automaticamente e armazenados no WaterBalance diário. |
| R-BH-19 | Tempo > 24h indica que a irrigação não pode ser feita em um dia. O sistema deve alertar e considerar priorizar a lâmina parcial. |
| R-BH-20 | Tempo deve considerar a vazão real (se disponível via sensor) ou a vazão nominal (Pivot.flow_rate_m3h). |

---

# 5. Recomendação de Irrigação

A recomendação é a decisão que o sistema toma a partir do balanço hídrico. É a inteligência central da plataforma.

## 5.1 Qual pivô irrigar

### Critério de necessidade

Um pivô precisa de irrigação quando:

```
deficit(d) ≥ AFD(d) × fator_gatilho
```

O `fator_gatilho` padrão é 1,0 (irrigar quando deficit = AFD). Pode ser ajustado:
- 0,8 = irrigar antes (mais conservador, mais consumo de energia)
- 1,2 = irrigar depois (mais arriscado, menor consumo)

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-REC-01 | Pivôs com deficit ≥ AFD são candidatos obrigatórios à irrigação. |
| R-REC-02 | Pivôs com deficit entre 50% e 100% da AFD são candidatos recomendados. |
| R-REC-03 | Pivôs com deficit < 50% da AFD não devem ser recomendados (desperdício). |
| R-REC-04 | Pivôs com status = 'manutencao' não recebem recomendação (indisponíveis). |
| R-REC-05 | Pivôs com PivotCropAssignment.status ≠ 'ativo' não recebem recomendação. |

## 5.2 Quando irrigar

### Regras de janela de irrigação

| Regra | Detalhe |
|---|---|
| R-REC-06 | Horário preferencial: fora da ponta de energia (antes das 18h ou após as 21h). |
| R-REC-07 | Irrigação noturna é preferível: menor ET₀ (menos evaporação durante aplicação), tarifa fora de ponta, menor vento. |
| R-REC-08 | Se previsão de chuva > 10 mm nas próximas 24h e prioridade ≤ média: recomendar adiamento de 24h. |
| R-REC-09 | Se previsão de chuva, mas prioridade = alta e deficit > 80% AFD: NÃO adiar. O risco é alto demais para apostar na previsão. |
| R-REC-10 | Pivôs com estágio `floracao` ou `enchimento` devem ser irrigados o mais rápido possível (sem adiamento). |

## 5.3 Quanto irrigar

### Regras de lâmina

| Regra | Detalhe |
|---|---|
| R-REC-11 | Lâmina padrão: LB = deficit / eficiência (repor 100% do déficit). |
| R-REC-12 | Lâmina mínima: 5 mm. Lâminas menores são ineficientes (muita evaporação, pouca infiltração). Se LB calculada < 5 mm, não recomendar irrigação. |
| R-REC-13 | Lâmina máxima por passada: limitada pela VIB do solo e pela capacidade do pivô. Se LB > lâmina máxima por passada, recomendar fracionamento. |
| R-REC-14 | Em regime de escassez hídrica (reservatório < 30%), aplicar irrigação deficitária: LB = deficit × 0,7 / eficiência (repor apenas 70%). |

## 5.4 Tempo de irrigação

### Regras

| Regra | Detalhe |
|---|---|
| R-REC-15 | Tempo = Volume / Vazão. |
| R-REC-16 | Se tempo > 20h, recomendar fracionamento em 2 eventos. |
| R-REC-17 | Se tempo > horas disponíveis no dia (considerando horário de ponta), alertar para iniciar mais cedo ou fracionar. |

## 5.5 Prioridade

### Classificação

```
Se deficit ≥ 80% da AFD  → ALTA
Se deficit ≥ 50% da AFD  → MÉDIA
Se deficit < 50% da AFD  → BAIXA
```

### Ajustes de prioridade

| Condição | Ajuste |
|---|---|
| Estágio = floracao ou enchimento | Subir um nível (média → alta) |
| Ky do estágio > 1,0 | Subir um nível |
| Reservatório < 30% de capacidade | Descer um nível (priorizar economia) |
| Sensor de umidade indicando abaixo do threshold | Subir um nível |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-REC-18 | Prioridade é calculada automaticamente e armazenada em WaterBalance.priority. |
| R-REC-19 | A tabela de recomendação no dashboard é ordenada por prioridade (alta primeiro) e depois por deficit decrescente. |
| R-REC-20 | Apenas pivôs com prioridade alta ou média devem receber IrrigationSchedule automático. Prioridade baixa é apenas monitoramento. |

## 5.6 Risco produtivo

### Cálculo

```
risco_base = (deficit / AFD) × 100
multiplicador_estagio = Ky_estagio (se disponível) ou 1,3 para floracao/enchimento, 1,0 para demais
risco_final = clamp(risco_base × multiplicador_estagio, 0, 100)
```

### Classificação

| Risco | Faixa | Significado |
|---|---|---|
| Baixo | 0-30 | Planta confortável |
| Moderado | 30-60 | Atenção, irrigar em breve |
| Alto | 60-85 | Risco de perda de produtividade |
| Crítico | 85-100 | Perdas irreversíveis iminentes |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-REC-21 | Risco produtivo é exibido no dashboard em destaque visual (cores). |
| R-REC-22 | Risco ≥ 60 gera alerta. |
| R-REC-23 | Risco ≥ 85 gera alerta crítico e notificação imediata. |
| R-REC-24 | A Cotrim AI usa o risco produtivo como fator principal da sua recomendação. |

---

# 6. Programação de Irrigação

A programação transforma as recomendações em um plano operacional executável, considerando as restrições do mundo real.

## 6.1 Sequência dos pivôs

### Regras de ordenação

```
1º critério: Prioridade (alta > média > baixa)
2º critério: Risco produtivo (maior primeiro)
3º critério: Estágio fenológico (floracao/enchimento primeiro)
4º critério: Deficit absoluto (maior primeiro)
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-PRG-01 | A sequência de irrigação é gerada automaticamente com base nos critérios acima. |
| R-PRG-02 | O operador pode reorganizar manualmente a sequência. O sistema deve registrar que foi alteração manual. |
| R-PRG-03 | A sequência deve respeitar restrições de infraestrutura (ver abaixo). |

## 6.2 Restrições de infraestrutura

### Restrição de vazão simultânea

```
Soma das vazões dos pivôs operando simultaneamente ≤ Vazão máxima da fonte hídrica
```

| Regra | Detalhe |
|---|---|
| R-PRG-04 | Se múltiplos pivôs compartilham a mesma fonte hídrica (reservatório), o sistema não pode programar irrigação simultânea que exceda a capacidade do reservatório/captação. |
| R-PRG-05 | Futuramente, quando PumpStation estiver modelada: a soma das vazões não pode exceder a vazão da casa de bomba. |

### Restrição de reservatório

| Regra | Detalhe |
|---|---|
| R-PRG-06 | Antes de programar, verificar se o reservatório tem volume suficiente para o volume planejado. |
| R-PRG-07 | Se volume_planejado > (volume_atual - volume_mín_operacional): reduzir o número de pivôs programados ou aplicar lâmina reduzida. |
| R-PRG-08 | Considerar a taxa de recarga do reservatório: volume_disponível = (volume_atual - mín) + (recarga × horas_programação). |

### Restrição de energia

| Regra | Detalhe |
|---|---|
| R-PRG-09 | Evitar operação no horário de ponta (18h-21h por padrão). Pivôs programados devem iniciar de modo a terminar antes da ponta, ou iniciar após a ponta. |
| R-PRG-10 | Se inevitável operar na ponta (prioridade alta), registrar o consumo com tarifa de ponta e alertar sobre o custo elevado. |
| R-PRG-11 | A programação deve maximizar o uso do horário fora de ponta e reservado (madrugada). |

### Restrição de tempo

| Regra | Detalhe |
|---|---|
| R-PRG-12 | Horas úteis de irrigação no dia = 24h - horário de ponta (padrão: 21 horas úteis). |
| R-PRG-13 | Se a soma dos tempos de irrigação de todos os pivôs com prioridade alta excede as horas úteis, o sistema deve: (a) irrigar os de maior risco primeiro; (b) adiar os restantes para o dia seguinte; (c) alertar que há gargalo operacional. |
| R-PRG-14 | Pivôs que compartilham a mesma bomba/fonte não podem operar simultaneamente (a menos que a infraestrutura comporte). Modelar como operação sequencial por padrão. |

## 6.3 Fontes da programação

| Fonte | Código | Comportamento |
|---|---|---|
| Manual | `manual` | Operador cria a programação. Executa diretamente. |
| Automática | `automatica` | Sistema cria quando deficit ≥ AFD. Aguarda aprovação se configurado, senão executa. |
| Cotrim AI | `cotrim_ai` | IA analisa o conjunto e gera programação otimizada. Sempre aguarda aprovação. |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-PRG-15 | Programações automáticas são geradas diariamente após o cálculo do balanço hídrico. |
| R-PRG-16 | Programações da Cotrim AI consideram o conjunto completo de pivôs, restrições de infraestrutura e otimização de custo. |
| R-PRG-17 | Apenas um schedule pendente/aprovado por pivô por data. |
| R-PRG-18 | Adiamento: ao adiar um schedule, registrar data original, nova data e motivo. |

## 6.4 Ciclo de vida da programação

```
pendente → aprovada → executando → executada
                    ↘ cancelada
                    ↘ adiada → (nova programação na data adiada)
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-PRG-19 | Ao transitar para `executando`, criar automaticamente um IrrigationEvent e vincular. |
| R-PRG-20 | Ao concluir o IrrigationEvent, atualizar schedule para `executada`. |
| R-PRG-21 | Programações não executadas ao final do dia são automaticamente marcadas como `cancelada` com motivo "Prazo expirado". |
| R-PRG-22 | Uma programação cancelada ou adiada não conta como irrigação — o déficit continua acumulando. |

---

# 7. Energia

Energia é um módulo diferencial integrado ao manejo. Todo evento de irrigação tem um custo energético associado.

## 7.1 Consumo de energia (kWh)

### Fórmula

```
Consumo (kWh) = (Potência_CV × 0,7355 / η_motor) × Tempo (h)
```

| Variável | Fonte | Unidade |
|---|---|---|
| Potência_CV | Pivot.pump_power_cv | CV |
| 0,7355 | Fator de conversão CV → kW | kW/CV |
| η_motor | Pivot.motor_efficiency | adimensional |
| Tempo | Calculado (volume/vazão) ou medido | horas |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-ENE-01 | Consumo é calculado para cada IrrigationEvent ao concluir. |
| R-ENE-02 | Consumo estimado é calculado preventivamente no WaterBalance (estimated_energy_kwh) para planejamento. |
| R-ENE-03 | Se o consumo real (medido via horímetro/sensor) estiver disponível, prevalece sobre o calculado. |

## 7.2 Custo de energia (R$)

### Fórmula

```
Custo (R$) = Consumo (kWh) × Tarifa (R$/kWh)
```

### Tarifas por período

| Período | Código | Horário padrão | Tarifa relativa |
|---|---|---|---|
| Fora de ponta | `fora_ponta` | 00h-18h e 21h-24h | 1× (tarifa base) |
| Ponta | `ponta` | 18h-21h | 3× a 5× da tarifa base |
| Reservado | `reservado` | 21h30-06h (quando disponível) | 0,5× a 0,7× |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-ENE-04 | Tarifa padrão vem de Pivot.tariff_rate_kwh. |
| R-ENE-05 | Se a irrigação ocorre parcialmente na ponta, o custo deve ser rateado: horas_ponta × tarifa_ponta + horas_fora × tarifa_fora. |
| R-ENE-06 | Tarifa de ponta = tarifa_base × 3 (padrão). Configurável. |
| R-ENE-07 | O sistema deve calcular e exibir o sobrecusto de operar na ponta: `sobrecusto = custo_ponta - (horas_ponta × tarifa_fora × potência)`. |

## 7.3 Indicadores energéticos

### kWh/m³

```
kWh_por_m3 = Consumo (kWh) / Volume (m³)
```

Indicador de eficiência energética da irrigação. Quanto menor, mais eficiente.

### R$/mm/ha

```
custo_por_mm_ha = Custo (R$) / (Lâmina (mm) × Área (ha))
```

### R$/ha (por irrigação)

```
custo_por_ha = Custo (R$) / Área (ha)
```

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-ENE-08 | kWh/m³ é calculado e armazenado em EnergyRecord.kwh_per_m3. |
| R-ENE-09 | R$/mm/ha e R$/ha são calculados por services sob demanda (relatórios e dashboard). Não armazenados. |
| R-ENE-10 | kWh/m³ típico para pivô central: 0,15 a 0,45. Valores > 0,60 indicam ineficiência → gerar alerta. |
| R-ENE-11 | O dashboard deve exibir custo acumulado por cultura, por módulo e por pivô para a safra. |

## 7.4 Custo por pivô

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-ENE-12 | Custo por pivô = SUM(EnergyRecord.cost_brl) WHERE pivot_id = X AND season_id = Y. |
| R-ENE-13 | Exibir ranking de pivôs por custo acumulado na safra. |
| R-ENE-14 | Exibir custo médio por irrigação para cada pivô. |

## 7.5 Custo por cultura

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-ENE-15 | Custo por cultura = SUM dos custos dos pivôs que têm aquela cultura na safra ativa (via PivotCropAssignment). |
| R-ENE-16 | Exibir R$/ha por cultura para comparação de eficiência entre culturas. |

## 7.6 Rateio da conta de energia

### Fluxo de conciliação

```
1. Ao receber a conta de energia (EnergyBill), registrar o valor total real.
2. Calcular o total estimado: SUM(EnergyRecord.cost_brl) do mesmo mês e fazenda.
3. Calcular a variância: (real - estimado) / estimado × 100.
4. Ratear o valor REAL (não o estimado) entre pivôs/culturas.
```

### Métodos de rateio

| Método | Lógica | Quando usar |
|---|---|---|
| Por energia | Proporcional ao kWh consumido por cada pivô no mês | Mais justo (padrão) |
| Por volume | Proporcional ao m³ aplicado por cada pivô | Alternativa |
| Por área | Proporcional à área de cada pivô | Simplificado |

### Regras do sistema

| Regra | Detalhe |
|---|---|
| R-ENE-17 | Rateio padrão: por energia consumida (mais preciso). |
| R-ENE-18 | Ao ratear, gerar automaticamente registros de CostAllocation para cada pivô/cultura com category = 'energia'. |
| R-ENE-19 | Variância > 15% entre estimado e real: gerar alerta → pode indicar consumo não-irrigação, erro de cálculo ou furto de energia. |
| R-ENE-20 | Variância < -15%: gerar alerta → pode indicar pivô que operou e não registrou evento (irrigação não contabilizada). |

---

# 8. Alertas de Manejo

Alertas são a interface proativa do sistema. O sistema deve antecipar problemas, não esperar que o operador descubra.

## 8.1 Categorias de alerta

### Déficit hídrico

| Alerta | Condição | Severidade | Mensagem modelo |
|---|---|---|---|
| A-DEF-01 | deficit ≥ AFD | alto | "Pivô {code}: déficit atingiu a AFD ({deficit}mm). Irrigação recomendada." |
| A-DEF-02 | deficit ≥ 80% da CAD | critico | "Pivô {code}: déficit crítico ({deficit}mm / CAD {cad}mm). Risco de murcha permanente." |
| A-DEF-03 | productive_risk ≥ 60 | alto | "Pivô {code}: risco produtivo elevado ({risk}%). Cultura em {stage}." |
| A-DEF-04 | productive_risk ≥ 85 | critico | "Pivô {code}: risco produtivo CRÍTICO ({risk}%). Perdas irreversíveis iminentes." |
| A-DEF-05 | deficit crescendo por 5+ dias sem irrigação | medio | "Pivô {code}: sem irrigação há {days} dias. Déficit acumulando: {deficit}mm." |

### Sensor

| Alerta | Condição | Severidade | Mensagem modelo |
|---|---|---|---|
| A-SEN-01 | Leitura fora de min_threshold/max_threshold | alto | "Sensor {name}: leitura {value}{unit} fora do intervalo [{min}-{max}]." |
| A-SEN-02 | Sem leitura por > 3× reading_interval | medio | "Sensor {name}: offline há {hours}h. Última leitura: {last}." |
| A-SEN-03 | Sensor de umidade < 30% em zona radicular | alto | "Sensor {name} no pivô {code}: umidade do solo em {value}% — solo muito seco." |

### Equipamento / Operação

| Alerta | Condição | Severidade | Mensagem modelo |
|---|---|---|---|
| A-EQP-01 | Pivô com status 'alerta' | alto | "Pivô {code}: status de alerta reportado pelo equipamento." |
| A-EQP-02 | Vazão observada < 80% da vazão nominal | medio | "Pivô {code}: vazão real ({real}m³/h) abaixo de 80% da nominal ({nominal}m³/h). Verificar bomba ou obstrução." |
| A-EQP-03 | Pressão abaixo do mínimo (via sensor) | alto | "Pivô {code}: pressão baixa ({value} bar). Verificar bomba, filtro ou vazamento." |

### Reservatório

| Alerta | Condição | Severidade | Mensagem modelo |
|---|---|---|---|
| A-RES-01 | volume_atual < min_operational_level | critico | "Reservatório {name}: nível abaixo do mínimo operacional ({percent}%). Suspender irrigação." |
| A-RES-02 | volume_atual < 30% do max_capacity | alto | "Reservatório {name}: nível em {percent}%. Restringir irrigação a pivôs de prioridade alta." |
| A-RES-03 | volume_atual < 50% do max_capacity | medio | "Reservatório {name}: nível em {percent}%. Monitorar." |
| A-RES-04 | Autonomia estimada < 24h | alto | "Reservatório {name}: autonomia estimada de {hours}h. Planejar redução de operação." |

### Clima

| Alerta | Condição | Severidade | Mensagem modelo |
|---|---|---|---|
| A-CLI-01 | ET₀ > 8 mm/dia | info | "ET₀ elevada ({et0}mm). Demanda hídrica acima do normal." |
| A-CLI-02 | ET₀ calculada fora do intervalo 0,5-12 mm | medio | "ET₀ fora do intervalo esperado ({et0}mm). Verificar dados climáticos." |
| A-CLI-03 | Sem dados climáticos por > 2 dias | critico | "Sem dados climáticos há {days} dias. Recomendações automáticas suspensas." |
| A-CLI-04 | Vento > 7 m/s | medio | "Vento elevado ({wind}m/s). Uniformidade de irrigação comprometida." |
| A-CLI-05 | Vento > 10 m/s | alto | "Vento muito forte ({wind}m/s). Suspender irrigação." |
| A-CLI-06 | Previsão de chuva > 20 mm em 24h | info | "Chuva significativa prevista ({forecast}mm). Considerar adiar pivôs de baixa prioridade." |
| A-CLI-07 | Temperatura < 5°C ou > 42°C | alto | "Temperatura extrema ({temp}°C). Risco de estresse térmico para {culture}." |

### Energia

| Alerta | Condição | Severidade | Mensagem modelo |
|---|---|---|---|
| A-ENE-01 | Irrigação programada no horário de ponta | medio | "Pivô {code}: irrigação programada durante horário de ponta (18h-21h). Custo {x}× maior." |
| A-ENE-02 | kWh/m³ > 0,60 | medio | "Pivô {code}: eficiência energética baixa ({kwh_m3} kWh/m³). Verificar bomba ou dimensionamento." |
| A-ENE-03 | Variância conta vs estimado > 15% | alto | "Conta de energia {month}: variação de {variance}% entre real e estimado. Investigar." |

### Irrigação atrasada

| Alerta | Condição | Severidade | Mensagem modelo |
|---|---|---|---|
| A-IRR-01 | IrrigationSchedule com status 'pendente' e scheduled_date < hoje | alto | "Pivô {code}: irrigação programada para {date} não foi executada." |
| A-IRR-02 | IrrigationSchedule com status 'aprovada' há mais de 24h sem executar | medio | "Pivô {code}: irrigação aprovada há mais de 24h aguardando execução." |
| A-IRR-03 | IrrigationEvent em andamento há mais de 1,5× o tempo previsto | medio | "Pivô {code}: irrigação em andamento há {hours}h (previsto: {planned}h). Verificar operação." |

## 8.2 Regras gerais de alertas

| Regra | Detalhe |
|---|---|
| R-ALE-01 | Alertas são gerados automaticamente pelo sistema durante o processamento diário (balanço hídrico) e em tempo real (sensores). |
| R-ALE-02 | Alertas não duplicam: se já existe um alerta ativo (não resolvido) para a mesma entidade e categoria, não gerar outro. |
| R-ALE-03 | Alertas são resolvidos automaticamente quando a condição deixa de existir (ex.: deficit volta abaixo da AFD após irrigação). |
| R-ALE-04 | Alertas críticos devem ser exibidos em destaque no dashboard e na topbar (contagem de não lidos). |
| R-ALE-05 | Alertas podem ser reconhecidos (acknowledged) pelo operador — isto não resolve o alerta, mas indica que alguém viu e está ciente. |
| R-ALE-06 | Histórico de alertas é preservado indefinidamente para auditoria e análise de padrões. |
| R-ALE-07 | Futuro: alertas críticos geram notificação push/email para os usuários com permissão de irrigação na fazenda. |

---

## Resumo de todas as regras

| Módulo | Prefixo | Quantidade |
|---|---|---|
| Clima | R-CLI | 33 |
| Solo | R-SOL | 29 |
| Cultura | R-CUL | 20 |
| Balanço Hídrico | R-BH | 20 |
| Recomendação | R-REC | 24 |
| Programação | R-PRG | 22 |
| Energia | R-ENE | 20 |
| Alertas | R-ALE | 7 |
| **Total** | | **175 regras** |

| Módulo | Alertas | Quantidade |
|---|---|---|
| Déficit hídrico | A-DEF | 5 |
| Sensor | A-SEN | 3 |
| Equipamento | A-EQP | 3 |
| Reservatório | A-RES | 4 |
| Clima | A-CLI | 7 |
| Energia | A-ENE | 3 |
| Irrigação atrasada | A-IRR | 3 |
| **Total** | | **28 tipos de alerta** |
