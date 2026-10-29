import { describe, expect, it } from "vitest";
import { buildDecisionSoilProfile } from "./decision-soil-profile";
import type { SoilProfileLayer } from "@/modules/soil/services/soil-profile";

const layers: SoilProfileLayer[] = [
  {depth_start:0,depth_end:20,field_capacity:0.133,wilting_point:0.057},
  {depth_start:20,depth_end:40,field_capacity:0.132,wilting_point:0.056},
  {depth_start:40,depth_end:60,field_capacity:0.132,wilting_point:0.056},
];
describe("Perfil de água por camadas — auditoria de Decisão", () => {
  it("usa somente camadas exploradas, com CTA e CRA depletável em mm, DTA em mm/cm", () => {
    const profile = buildDecisionSoilProfile({
      layers,rootDepthMeters:.35,wholeProfileCtaMm:26.6,
      wholeProfileCraMm:13.3,wholeProfileArmMm:18.62,
    });
    expect(profile).not.toBeNull();
    expect(profile!.layers).toHaveLength(2);
    expect(profile!.layers[0].startCm).toBe(0);
    expect(profile!.layers[0].endCm).toBe(20);
    expect(profile!.layers[1].endCm).toBe(35);
    expect(profile!.layers[0].layerCapacityMm).toBeCloseTo(15.2, 5);
    expect(profile!.layers[1].layerCapacityMm).toBeCloseTo(11.4, 5);
    expect(profile!.ctaMm).toBeCloseTo(26.6, 5);
    expect(profile!.craMm).toBeCloseTo(13.3, 5);
    expect(profile!.dtaMeanMmPerCm).toBeCloseTo(0.76,5);
    expect(profile!.estimatedArmMm).toBeCloseTo(18.62,5);
    expect(profile!.layers[0].estimatedArmMm).toBeCloseTo(10.64,5);
    expect(profile!.layers[0].fieldCapacityPctVol).toBeCloseTo(13.3,5);
    expect(profile!.layers[0].wiltingPointPctVol).toBeCloseTo(5.7,5);
  });
  it("não inventa dados em lacunas ou extrapola profundidade de raiz", () => {
    const profile = buildDecisionSoilProfile({layers:[layers[0],layers[2]],rootDepthMeters:.6,
      wholeProfileCtaMm:45.6,wholeProfileCraMm:22.8,wholeProfileArmMm:45.6});
    expect(profile?.layers).toHaveLength(1);
    expect(profile?.rootDepthCm).toBe(20);
    expect(profile?.ctaMm).toBeCloseTo(15.2,5);
  });
  it("não mostra valores por camada sem perfil registrado", () => {
    expect(buildDecisionSoilProfile({layers:[],rootDepthMeters:.6,wholeProfileCtaMm:45,
      wholeProfileCraMm:20,wholeProfileArmMm:30})).toBeNull();
  });
  it("limita frações físicas e nunca informa ARM estimado acima da CTA", () => {
    const p=buildDecisionSoilProfile({layers,rootDepthMeters:.6,wholeProfileCtaMm:45.6,
      wholeProfileCraMm:70,wholeProfileArmMm:100});
    expect(p!.factorWeekly).toBe(1);
    expect(p!.estimatedArmMm).toBeCloseTo(p!.ctaMm,5);
    expect(p!.layers.every(l=>l.estimatedArmMm<=l.layerCapacityMm)).toBe(true);
  });
});
