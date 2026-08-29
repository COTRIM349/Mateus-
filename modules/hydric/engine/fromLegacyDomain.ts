/**
 * Ponte NÃO-DESTRUTIVA: monta a entrada do motor v4 a partir dos dados de
 * domínio que as telas legadas já carregam (solo single-layer, cultura,
 * fase, clima, irrigação). Permite rodar o v4 em modo sombra sem migrar
 * o schema. Camadas reais (migration 00032) substituirão isto na Fatia 5.
 */
import type { SoilLayerCanonical, DailyBalanceInputV4 } from "./hydricEngineV4";

export interface LegacySoil {
  field_capacity: number;   // cm³/cm³ (volumétrico, como o legado usa)
  wilting_point: number;    // cm³/cm³
  effective_depth: number;  // m
}

/** Solo legado (1 camada volumétrica) → camada canônica única. */
export function legacySoilToLayer(soil: LegacySoil): SoilLayerCanonical {
  return {
    topM: 0,
    bottomM: soil.effective_depth,
    thetaCC: soil.field_capacity,
    thetaPMP: soil.wilting_point,
  };
}

export interface BuildV4InputArgs {
  soil: LegacySoil;
  kc: number;
  kl?: number;
  rootDepthM: number;
  pBase: number;
  /** null quando indisponível — NÃO usar 0 (spec §2). */
  eto: number | null;
  rainfall: number | null;
  irrigationGross: number | null;
  applicationEfficiency: number;
  previousArm: number;
}

export function buildV4Input(args: BuildV4InputArgs): DailyBalanceInputV4 {
  const layer = legacySoilToLayer(args.soil);
  return {
    eto: args.eto,
    kc: args.kc,
    kl: args.kl ?? 1,
    rootDepthM: args.rootDepthM,
    effectiveSoilDepthM: args.soil.effective_depth,
    layers: [layer],
    pBase: args.pBase,
    rainfall: args.rainfall,
    irrigationGross: args.irrigationGross,
    applicationEfficiency: args.applicationEfficiency,
    previousArm: args.previousArm,
    mode: "single",
  };
}
