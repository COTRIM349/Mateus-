import { describe, expect, it } from "vitest";
import { operationalEtoMm } from "./operational-eto";

describe("operationalEtoMm", () => {
  it("prefere et0_calculated sobre et0_source", () => {
    expect(operationalEtoMm({ et0_calculated: 5.2, et0_source: 4.8 })).toBe(5.2);
  });

  it("usa et0_source quando calculated é null", () => {
    expect(operationalEtoMm({ et0_calculated: null, et0_source: 4.8 })).toBe(4.8);
  });

  it("retorna null sem valores válidos", () => {
    expect(operationalEtoMm({ et0_calculated: null, et0_source: null })).toBeNull();
  });
});
