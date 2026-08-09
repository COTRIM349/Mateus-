import { describe, expect, it } from "vitest";
import { calculateReferenceEtoAsceEwri } from "./referenceEtoAsceEwri";
import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import { calculateReferenceEtoPriestleyTaylor } from "./referenceEtoPriestleyTaylor";
import { calculateReferenceEtoThornthwaiteCamargo, photoperiodHours } from "./referenceEtoThornthwaiteCamargo";
import type { ReferenceEtoInput } from "./referenceEtoTypes";

const input: ReferenceEtoInput = {
  date: "2026-08-08",
  latitude: -14.775986,
  elevationM: 853,
  temperatureMinC: 19,
  temperatureMaxC: 33.7,
  temperatureMeanC: 26.35,
  relativeHumidityMinPct: null,
  relativeHumidityMaxPct: null,
  relativeHumidityMeanPct: 45,
  actualVapourPressureKpa: null,
  windSpeedMs: 1.2,
  windMeasurementHeightM: 2,
  solarRadiationMjM2Day: 21.3,
  surfacePressureKpa: null,
};

describe("ASCE-EWRI ETos diária", () => {
  it("é numericamente idêntica ao FAO-56 diário para a mesma superfície curta", () => {
    const fao = calculateReferenceEtoFao56(input);
    const asce = calculateReferenceEtoAsceEwri(input);

    expect(asce.etoMmDay).toBeCloseTo(fao.etoMmDay as number, 12);
    expect(asce.referenceSurface).toBe("short_grass");
    expect(asce.formulaVersion).toBe("asce-ewri-2005-etos-daily-v1");
  });
});

describe("Priestley-Taylor diária", () => {
  it("aplica alpha 1,26 ao termo energético e não depende do termo aerodinâmico", () => {
    const result = calculateReferenceEtoPriestleyTaylor(input);
    const expected = 1.26 * 0.408
      * (result.saturationSlopeKpaC as number)
      / ((result.saturationSlopeKpaC as number) + (result.psychrometricConstantKpaC as number))
      * (result.netRadiationMjM2Day as number);

    expect(result.etoMmDay).toBeCloseTo(expected, 10);
    expect(result.etoMmDay as number).toBeGreaterThan(0);
    expect(result.qualityStatus).toBe("estimated");
  });

  it("preserva ausência de radiação", () => {
    const result = calculateReferenceEtoPriestleyTaylor({
      ...input,
      solarRadiationMjM2Day: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("netRadiationMjM2Day");
  });
});

describe("Thornthwaite-Camargo 1999", () => {
  it("usa Tef=0,36(3Tmax-Tmin), normal anual e fotoperíodo", () => {
    const result = calculateReferenceEtoThornthwaiteCamargo({
      date: "2026-08-08",
      latitude: -14.775986,
      temperatureMinC: 19,
      temperatureMaxC: 33.7,
      climatologicalAnnualMeanTemperatureC: 24.2,
    });

    expect(result.effectiveTemperatureC).toBeCloseTo(29.556, 3);
    expect(result.photoperiodHours).toBeCloseTo(11.426, 2);
    expect(result.etoMmDay as number).toBeGreaterThan(3);
    expect(result.etoMmDay as number).toBeLessThan(7);
    expect(result.qualityStatus).toBe("estimated");
  });

  it("não substitui a normal anual por temperatura recente", () => {
    const result = calculateReferenceEtoThornthwaiteCamargo({
      date: "2026-08-08",
      latitude: -14.775986,
      temperatureMinC: 19,
      temperatureMaxC: 33.7,
      climatologicalAnnualMeanTemperatureC: null,
    });

    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("climatologicalAnnualMeanTemperatureC");
  });

  it("calcula fotoperíodo fisicamente plausível", () => {
    expect(photoperiodHours("2026-08-08", -14.775986)).toBeCloseTo(11.426, 2);
  });
});
