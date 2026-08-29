import { describe, expect, it } from "vitest";
import { operationalEtoMm } from "./operational-eto";

describe("operationalEtoMm", () => {
  it("prioriza a ETo calculada", () => {
    expect(operationalEtoMm({ et0_calculated: 5.2, et0_source: 4.8 })).toBe(5.2);
  });

  it("usa a ETo de modelo quando a calculada ainda não existe", () => {
    expect(operationalEtoMm({ et0_calculated: null, et0_source: 4.8 })).toBe(4.8);
  });

  it("não inventa ETo", () => {
    expect(operationalEtoMm({ et0_calculated: null, et0_source: null })).toBeNull();
  });
});
