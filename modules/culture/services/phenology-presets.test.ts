import { describe, it, expect } from "vitest";
import { cropKindFromName, resolveCycleDays, stageFraction, expectedDae } from "./phenology-presets";

describe("phenology presets", () => {
  it("identifica a cultura pelo nome", () => {
    expect(cropKindFromName("Soja")).toBe("soja");
    expect(cropKindFromName("Milho (grão)")).toBe("milho");
    expect(cropKindFromName("Algodão")).toBe("algodao");
    expect(cropKindFromName("Feijão")).toBe("outro");
  });

  it("resolve ciclo do obtentor, senão default por classe", () => {
    expect(resolveCycleDays("soja", 132, "medio")).toBe(132);
    expect(resolveCycleDays("soja", null, "precoce")).toBe(110);
    expect(resolveCycleDays("soja", null, "tardio")).toBe(140);
    expect(resolveCycleDays("soja", null, null)).toBe(120);
    expect(resolveCycleDays("milho", 0, "medio")).toBe(150); // 0 = inválido → default
  });

  it("VE fica em 0 DAE (emergência) e R8 no fim do ciclo", () => {
    expect(stageFraction("soja", "VE", "emergencia")).toBe(0);
    expect(expectedDae("soja", "VE", "emergencia", 125)).toBe(0);
    expect(expectedDae("soja", "R8", "maturacao", 120)).toBe(120);
  });

  it("R5 da soja cai em ~2/3 do ciclo", () => {
    expect(expectedDae("soja", "R5", "enchimento_graos", 120)).toBe(79); // round(0.66*120)
  });

  it("usa fallback por fase quando o código é desconhecido", () => {
    expect(stageFraction("soja", "ZZ", "florescimento")).toBe(0.45);
    expect(stageFraction("soja", "ZZ", null)).toBeNull();
  });
});
