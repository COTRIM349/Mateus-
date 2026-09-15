// ============================================================================
//  Fator de disponibilidade hídrica (f / p) — Doorenbos & Kassam (1979)
// ----------------------------------------------------------------------------
//  Tabela 2: f em função do GRUPO DE CULTURA (1-4) e da evapotranspiração
//  máxima ETm (≈ ETc potencial, mm/dia). Substitui o ajuste FAO-56 quando a
//  cultura tem um grupo definido; interpola linearmente em ETm.
// ============================================================================

export type CropAvailabilityGroup = 1 | 2 | 3 | 4;

// Colunas de ETm (mm/dia) da Tabela 2.
const ETM_COLUMNS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

// f[grupo][coluna de ETm]. Fonte: Doorenbos & Kassam (1979).
const F_TABLE: Record<CropAvailabilityGroup, number[]> = {
  1: [0.500, 0.425, 0.350, 0.300, 0.250, 0.225, 0.200, 0.200, 0.175],
  2: [0.675, 0.575, 0.475, 0.400, 0.350, 0.325, 0.275, 0.250, 0.225],
  3: [0.800, 0.700, 0.600, 0.500, 0.450, 0.425, 0.375, 0.350, 0.300],
  4: [0.875, 0.800, 0.700, 0.600, 0.550, 0.500, 0.450, 0.425, 0.400],
};

/**
 * f (fator de disponibilidade) para um grupo, interpolado linearmente na ETm.
 * ETm fora de [2,10] é limitada aos extremos da tabela.
 */
export function availabilityFactor(group: CropAvailabilityGroup, etmMmDay: number): number {
  const row = F_TABLE[group];
  const etm = Number.isFinite(etmMmDay) ? etmMmDay : 5;
  const lo = ETM_COLUMNS[0];
  const hi = ETM_COLUMNS[ETM_COLUMNS.length - 1];
  if (etm <= lo) return row[0];
  if (etm >= hi) return row[row.length - 1];
  // localiza o intervalo [ETM_COLUMNS[i], ETM_COLUMNS[i+1]] que contém etm
  for (let i = 0; i < ETM_COLUMNS.length - 1; i += 1) {
    const a = ETM_COLUMNS[i];
    const b = ETM_COLUMNS[i + 1];
    if (etm >= a && etm <= b) {
      const t = (etm - a) / (b - a);
      const f = row[i] + t * (row[i + 1] - row[i]);
      return Math.round(f * 1000) / 1000;
    }
  }
  return row[row.length - 1];
}

// ── Classificação de cultura → grupo (rodapés da Tabela 2) ──────────────────
// Palavras-chave normalizadas (sem acento, minúsculas). Casamento por inclusão.
const GROUP_KEYWORDS: Record<CropAvailabilityGroup, string[]> = {
  1: ["cebola", "pimentao", "pimenta", "batata"],
  2: ["banana", "repolho", "uva", "videira", "ervilha", "tomate"],
  3: ["alfafa", "feijao", "citros", "citrus", "laranja", "amendoim", "abacaxi", "girassol", "melancia", "melao", "trigo"],
  4: ["algodao", "milho", "azeitona", "oliveira", "acafrao", "sorgo", "soja", "beterraba", "cana", "fumo", "tabaco"],
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Grupo (1-4) da cultura pelo nome, conforme os rodapés da Tabela 2.
 * Retorna null quando não reconhece — aí o motor mantém o método FAO-56.
 */
export function cropGroupByName(cultureName: string | null | undefined): CropAvailabilityGroup | null {
  if (!cultureName) return null;
  const n = normalize(cultureName);
  const groups: CropAvailabilityGroup[] = [1, 2, 3, 4];
  for (const g of groups) {
    if (GROUP_KEYWORDS[g].some((kw) => n.includes(kw))) return g;
  }
  return null;
}
