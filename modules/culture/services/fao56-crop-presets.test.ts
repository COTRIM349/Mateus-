import { describe, it, expect } from "vitest";
import { buildFao56Anchors, FAO56_CROP_PRESETS } from "./fao56-crop-presets";
import { interpolatePiecewiseLinear } from "./agronomic-engine";

describe("FAO-56 crop presets", () => {
  it("gera 5 pontos com patamar inicial/médio e rampas de dev/senescência", () => {
    const a = buildFao56Anchors({ kcIni: 0.4, kcMid: 1.15, kcEnd: 0.5, lIni: 20, lDev: 30, lMid: 60, lLate: 25 });
    expect(a).toHaveLength(5);
    expect(a.map((p) => p.x_value)).toEqual([0, 20, 50, 110, 135]);
    // patamar inicial: Kc constante de 0 a 20
    expect(a[0].kc_value).toBe(0.4);
    expect(a[1].kc_value).toBe(0.4);
    // patamar médio: Kc constante de 50 a 110
    expect(a[2].kc_value).toBe(1.15);
    expect(a[3].kc_value).toBe(1.15);
    // fim do ciclo
    expect(a[4].kc_value).toBe(0.5);
  });

  it("interpolação reproduz patamar e rampa da FAO-56", () => {
    const a = buildFao56Anchors({ kcIni: 0.4, kcMid: 1.15, kcEnd: 0.5, lIni: 20, lDev: 30, lMid: 60, lLate: 25 });
    const pts = a.map((p) => ({ x: p.x_value, y: p.kc_value }));
    // dentro do patamar inicial → constante
    expect(interpolatePiecewiseLinear(pts, 10)).toBe(0.4);
    // meio do desenvolvimento (x=35, entre 20 e 50) → meio da rampa 0,4→1,15
    expect(interpolatePiecewiseLinear(pts, 35)).toBeCloseTo(0.775, 3);
    // dentro do patamar médio → constante
    expect(interpolatePiecewiseLinear(pts, 80)).toBe(1.15);
  });

  it("presets cobrem as culturas do Cerrado com Kc dentro de faixa físico-plausível", () => {
    const keys = FAO56_CROP_PRESETS.map((p) => p.key);
    // Soja tem 3 classes de ciclo; demais culturas, um preset padrão.
    expect(keys).toEqual(["soja-precoce", "soja-medio", "soja-tardio", "milho", "algodao", "feijao", "tabaco"]);
    expect(FAO56_CROP_PRESETS.filter((p) => p.crop === "Soja")).toHaveLength(3);
    for (const p of FAO56_CROP_PRESETS) {
      expect(p.kcIni).toBeGreaterThan(0);
      expect(p.kcMid).toBeGreaterThanOrEqual(p.kcIni);
      expect(p.kcMid).toBeLessThanOrEqual(1.3);
      expect(p.depletionP).toBeGreaterThan(0);
      expect(p.depletionP).toBeLessThan(1);
      expect(p.rootMaxM).toBeGreaterThan(0);
    }
  });
});
