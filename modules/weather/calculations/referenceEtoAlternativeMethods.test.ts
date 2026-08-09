import { describe, expect, it } from "vitest";
import { calculateReferenceEtoAsceEwri } from "./referenceEtoAsceEwri";
import { calculateReferenceEtoBlaneyCriddle } from "./referenceEtoBlaneyCriddle";
import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import { calculateReferenceEtoJensenHaise } from "./referenceEtoJensenHaise";
import { calculateReferenceEtoMakkink } from "./referenceEtoMakkink";
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

describe("Blaney-Criddle FAO-24", () => {
  it("aplica temperatura média e porcentagem diária das horas anuais de luz", () => {
    const result = calculateReferenceEtoBlaneyCriddle({
      date: input.date,
      latitude: input.latitude,
      temperatureMeanC: input.temperatureMeanC,
      temperatureMinC: input.temperatureMinC,
      temperatureMaxC: input.temperatureMaxC,
    });
    const p = (result.photoperiodHours as number) / (12 * 365) * 100;
    const expected = p * (0.46 * (input.temperatureMeanC as number) + 8);

    expect(result.daylightAnnualPercentagePerDay).toBeCloseTo(p, 12);
    expect(result.etoMmDay).toBeCloseTo(expected, 12);
    expect(result.qualityStatus).toBe("estimated");
  });

  it("não calcula sem temperatura", () => {
    const result = calculateReferenceEtoBlaneyCriddle({
      date: input.date,
      latitude: input.latitude,
      temperatureMeanC: null,
      temperatureMinC: null,
      temperatureMaxC: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("temperatureMeanC");
  });
});

describe("Makkink 1957", () => {
  it("aplica o termo de radiação com C=0,61 e intercepto -0,12 mm/dia", () => {
    const result = calculateReferenceEtoMakkink(input);
    const expected = 0.61 * 0.408
      * (result.saturationSlopeKpaC as number)
      / ((result.saturationSlopeKpaC as number) + (result.psychrometricConstantKpaC as number))
      * (input.solarRadiationMjM2Day as number) - 0.12;

    expect(result.etoMmDay).toBeCloseTo(expected, 12);
    expect(result.coefficient).toBe(0.61);
    expect(result.qualityStatus).toBe("estimated");
  });

  it("não converte radiação ausente em zero", () => {
    const result = calculateReferenceEtoMakkink({
      ...input,
      solarRadiationMjM2Day: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("solarRadiationMjM2Day");
  });
});

describe("Jensen-Haise 1963 simplificado", () => {
  it("converte Rs em equivalente de água antes de aplicar o coeficiente térmico", () => {
    const result = calculateReferenceEtoJensenHaise({
      temperatureMeanC: input.temperatureMeanC,
      temperatureMinC: input.temperatureMinC,
      temperatureMaxC: input.temperatureMaxC,
      solarRadiationMjM2Day: input.solarRadiationMjM2Day,
    });
    const radiationMm = (input.solarRadiationMjM2Day as number) * 0.408;
    const expected = radiationMm * (0.025 * (input.temperatureMeanC as number) + 0.08);

    expect(result.solarRadiationEquivalentMmDay).toBeCloseTo(radiationMm, 12);
    expect(result.etoMmDay).toBeCloseTo(expected, 12);
    expect(result.qualityStatus).toBe("estimated");
  });

  it("preserva ausência de radiação", () => {
    const result = calculateReferenceEtoJensenHaise({
      temperatureMeanC: input.temperatureMeanC,
      temperatureMinC: input.temperatureMinC,
      temperatureMaxC: input.temperatureMaxC,
      solarRadiationMjM2Day: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("solarRadiationMjM2Day");
  });
});
