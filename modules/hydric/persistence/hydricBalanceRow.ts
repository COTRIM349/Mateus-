/**
 * DTO tipado da tabela hydric_balance_daily (migration 00032).
 * Espelho serializável para trânsito servidor→cliente (App Router).
 */
import type { CoefficientMode, HydricState } from "@/modules/hydric/domain/glossary";
import type { DataNature } from "@/modules/hydric/domain/glossary";

export interface HydricBalanceRow {
  id: string;
  farm_id: string;
  pivot_id: string;
  parcel_id: string;
  zone: string;
  balance_date: string;         // YYYY-MM-DD
  engine_version: string;
  coefficient_mode: CoefficientMode;

  // entradas (snapshot)
  eto_mm: number | null;
  eto_source: string | null;
  eto_nature: DataNature | null;
  kc: number | null;
  kl: number | null;
  ke: number | null;
  root_depth_m: number | null;
  p_base: number | null;
  rainfall_mm: number | null;
  rainfall_effective_mm: number | null;
  irrigation_gross_mm: number | null;
  irrigation_effective_mm: number | null;
  application_efficiency: number | null;
  capillary_rise_mm: number | null;
  previous_arm_mm: number | null;

  // resultados
  cad_mm: number | null;
  afd_mm: number | null;
  arm_critico_mm: number | null;
  p_adjusted: number | null;
  etc_potential_mm: number | null;
  ks: number | null;
  etc_real_mm: number | null;
  arm_mm: number | null;
  dr_mm: number | null;
  pct_arm: number | null;
  deep_percolation_mm: number | null;
  hydric_state: HydricState | null;

  computed: boolean;
  missing_inputs: string[] | null;
  input_snapshot: Record<string, unknown> | null;
  formula_version: string | null;
  computed_at: string;
}
