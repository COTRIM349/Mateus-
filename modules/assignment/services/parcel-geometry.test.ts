import { describe, expect, it } from "vitest";
import {
  formatParcelAngles,
  isFullCircleParcel,
  parcelAnglesOverlap,
  parcelManagedAreaHa,
  parseParcelAngles,
  sectorFraction,
  sweepAngleDeg,
} from "./parcel-geometry";

describe("sweepAngleDeg", () => {
  it("315–360 é o quadrante NO (45°)", () => {
    expect(sweepAngleDeg(315, 360)).toBe(45);
  });

  it("350–20 atravessa o norte", () => {
    expect(sweepAngleDeg(350, 20)).toBe(30);
  });

  it("0–360 é o pivô inteiro", () => {
    expect(sweepAngleDeg(0, 360)).toBe(360);
    expect(isFullCircleParcel(0, 360)).toBe(true);
    expect(isFullCircleParcel(null, null)).toBe(true);
    expect(sweepAngleDeg(90, 90)).toBe(0);
    expect(isFullCircleParcel(90, 90)).toBe(false);
  });
});

describe("parseParcelAngles", () => {
  it("vazio nos dois campos = pivô inteiro", () => {
    expect(parseParcelAngles("", "")).toEqual({ startDeg: null, endDeg: null, error: null });
  });

  it("um campo só é erro", () => {
    expect(parseParcelAngles("315", "")).toMatchObject({ error: expect.stringMatching(/inicial e o final/) });
  });

  it("grava 315–360 como quadrante", () => {
    expect(parseParcelAngles("315", "360")).toEqual({ startDeg: 315, endDeg: 360, error: null });
  });
});

describe("parcelAnglesOverlap", () => {
  it("quadrantes vizinhos (315–360 e 0–90) não se sobrepõem", () => {
    expect(
      parcelAnglesOverlap({ startDeg: 315, endDeg: 360 }, { startDeg: 0, endDeg: 90 }),
    ).toBe(false);
  });

  it("detecta sobreposição e pivô inteiro contra quadrante", () => {
    expect(
      parcelAnglesOverlap({ startDeg: 300, endDeg: 20 }, { startDeg: 0, endDeg: 45 }),
    ).toBe(true);
    expect(
      parcelAnglesOverlap({ startDeg: null, endDeg: null }, { startDeg: 0, endDeg: 90 }),
    ).toBe(true);
  });
});

describe("parcelManagedAreaHa", () => {
  it("usa área plantada quando informada; senão fração do pivô", () => {
    expect(parcelManagedAreaHa(86, 20, 0, 90)).toBe(20);
    expect(parcelManagedAreaHa(80, null, 0, 90)).toBe(20);
    expect(sectorFraction(null, null)).toBe(1);
  });
});

describe("formatParcelAngles", () => {
  it("rótulo operacional", () => {
    expect(formatParcelAngles(null, null)).toBe("Pivô inteiro");
    expect(formatParcelAngles(315, 360)).toBe("315°–360°");
  });
});
