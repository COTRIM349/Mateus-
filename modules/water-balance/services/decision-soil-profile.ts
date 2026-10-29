import { clipLayersToRootDepth, type SoilProfileLayer } from "@/modules/soil/services/soil-profile";

/** Values per registered soil layer; no per-layer sensor measurements are invented. */
export interface DecisionSoilLayer {
  startCm: number;
  endCm: number;
  layerCapacityMm: number;
  readilyDepletableMm: number;
  /** Estimated proportional allocation of whole-profile available storage (NOT measured). */
  estimatedArmMm: number;
  availableFraction: number;
  dtaMmPerCm: number;
  fieldCapacityPctVol: number;
  wiltingPointPctVol: number;
}

export interface DecisionSoilProfile {
  layers: DecisionSoilLayer[];
  ctaMm: number;
  craMm: number;
  estimatedArmMm: number;
  dtaMeanMmPerCm: number;
  factorWeekly: number;
  rootDepthCm: number;
}

/**
 * Per-layer CC/PMP/CTA/CRA are derived from the registered profile, clipped to
 * the pivot's calculated root zone. The balance engine stores only the total
 * ARM, so the breakdown shown in UI is explicitly an estimate based on uniform
 * fractional depletion. It must never be labelled as measured layer humidity.
 */
export function buildDecisionSoilProfile(input: {
  layers: SoilProfileLayer[];
  rootDepthMeters: number;
  wholeProfileCtaMm: number;
  wholeProfileCraMm: number;
  wholeProfileArmMm: number;
}): DecisionSoilProfile | null {
  const { layers, rootDepthMeters, wholeProfileCtaMm, wholeProfileCraMm, wholeProfileArmMm } = input;
  if (
    !Array.isArray(layers) || !layers.length ||
    !Number.isFinite(rootDepthMeters) || rootDepthMeters <= 0 ||
    ![wholeProfileCtaMm, wholeProfileCraMm, wholeProfileArmMm].every(Number.isFinite) ||
    wholeProfileCtaMm <= 0
  ) return null;

  const clipped = clipLayersToRootDepth(layers, rootDepthMeters)
    .filter(layer => Number.isFinite(layer.field_capacity) && Number.isFinite(layer.wilting_point)
      && layer.field_capacity > layer.wilting_point
      && Number.isFinite(layer.depth_start) && Number.isFinite(layer.depth_end)
      && layer.depth_end > layer.depth_start)
    .sort((a,b) => a.depth_start - b.depth_start);

  // Don't quietly bridge missing registered horizons or manufacture values.
  let reachCm = 0;
  const contiguous: typeof clipped = [];
  for (const layer of clipped) {
    if (layer.depth_start > reachCm + .001) break;
    if (layer.depth_end <= reachCm) continue;
    contiguous.push({ ...layer, depth_start: Math.max(layer.depth_start, reachCm) });
    reachCm = layer.depth_end;
  }
  if (!contiguous.length) return null;
  const capacities = contiguous.map(layer =>
    (layer.field_capacity - layer.wilting_point) * (layer.depth_end - layer.depth_start) * 10);
  const profileCta = capacities.reduce((sum,v) => sum+v,0);
  if (profileCta <= 0) return null;
  const fractionArm = Math.min(1,Math.max(0,wholeProfileArmMm / wholeProfileCtaMm));
  const factorWeekly = Math.min(1, Math.max(0, wholeProfileCraMm / wholeProfileCtaMm));
  const items = contiguous.map((layer,i): DecisionSoilLayer => ({
    startCm: layer.depth_start,
    endCm: layer.depth_end,
    layerCapacityMm: capacities[i],
    readilyDepletableMm: capacities[i] * factorWeekly,
    estimatedArmMm: capacities[i] * fractionArm,
    availableFraction: fractionArm,
    dtaMmPerCm: (layer.field_capacity - layer.wilting_point) * 10,
    fieldCapacityPctVol: layer.field_capacity * 100,
    wiltingPointPctVol: layer.wilting_point * 100,
  }));
  const depth = contiguous.reduce((sum,layer)=>sum+(layer.depth_end-layer.depth_start),0);
  return {
    layers: items,
    ctaMm: profileCta,
    craMm: profileCta*factorWeekly,
    estimatedArmMm: profileCta*fractionArm,
    dtaMeanMmPerCm: profileCta/depth,
    factorWeekly,
    rootDepthCm: Math.min(rootDepthMeters*100,reachCm),
  };
}
