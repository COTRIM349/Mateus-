import { describe, expect, it } from "vitest";
import { calculateReferenceEtoAsceEwri } from "./referenceEtoAsceEwri";
import { calculateReferenceEtoBlaneyCriddle } from "./referenceEtoBlaneyCriddle";
import { calculateReferenceEtoCamargo1971, camargoAdjustmentK } from "./referenceEtoCamargo1971";
import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import { calculateReferenceEtoIvanov } from "./referenceEtoIvanov";
import { calculateReferenceEtoJensenHaise } from "./referenceEtoJensenHaise";
import { calculateReferenceEtoLinacre } from "./referenceEtoLinacre";
import { calculateReferenceEtoMakkink } from "./referenceEtoMakkink";
import { calculateReferenceEtoPriestleyTaylor } from "./referenceEtoPriestleyTaylor";
import { calculateReferenceEtoThornthwaiteCamargo, photoperiodHours } from "./referenceEtoThornthwaiteCamargo";
import { calculateReferenceEtoTurc } from "./referenceEtoTurc";
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

describe("Turc 1961", () => {
  it("aplica a correção de umidade quando UR é inferior a 50%", () => {
    const result = calculateReferenceEtoTurc({
      temperatureMeanC: input.temperatureMeanC,
      relativeHumidityMeanPct: input.relativeHumidityMeanPct,
      solarRadiationMjM2Day: input.solarRadiationMjM2Day,
    });
    const correction = 1 + (50 - 45) / 70;
    const expected = 0.013 * 26.35 / (26.35 + 15) * (23.8856 * 21.3 + 50) * correction;

    expect(result.humidityCorrectionFactor).toBeCloseTo(correction, 12);
    expect(result.etoMmDay).toBeCloseTo(expected, 12);
    expect(result.qualityStatus).toBe("estimated");
  });

  it("não converte radiação ausente em zero", () => {
    const result = calculateReferenceEtoTurc({
      temperatureMeanC: input.temperatureMeanC,
      relativeHumidityMeanPct: input.relativeHumidityMeanPct,
      solarRadiationMjM2Day: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("solarRadiationMjM2Day");
  });
});

describe("Linacre 1977 para vegetação", () => {
  it("deriva o ponto de orvalho e usa altitude e latitude", () => {
    const result = calculateReferenceEtoLinacre({
      latitude: input.latitude,
      elevationM: input.elevationM,
      temperatureMeanC: input.temperatureMeanC,
      relativeHumidityMeanPct: input.relativeHumidityMeanPct,
    });
    const gamma = Math.log(0.45) + 17.27 * 26.35 / (237.3 + 26.35);
    const dewPoint = 237.3 * gamma / (17.27 - gamma);
    const adjustedTemperature = 26.35 + 0.006 * 853;
    const expected = (
      500 * adjustedTemperature / (100 - Math.abs(input.latitude))
      + 15 * (26.35 - dewPoint)
    ) / (80 - 26.35);

    expect(result.dewPointTemperatureC).toBeCloseTo(dewPoint, 12);
    expect(result.adjustedTemperatureC).toBeCloseTo(adjustedTemperature, 12);
    expect(result.etoMmDay).toBeCloseTo(expected, 12);
  });

  it("não calcula o ponto de orvalho sem umidade", () => {
    const result = calculateReferenceEtoLinacre({
      latitude: input.latitude,
      elevationM: input.elevationM,
      temperatureMeanC: input.temperatureMeanC,
      relativeHumidityMeanPct: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("relativeHumidityMeanPct");
  });
});

describe("Ivanov 1954", () => {
  it("mantém a equação mensal e expõe somente seu equivalente diário", () => {
    const result = calculateReferenceEtoIvanov({
      date: input.date,
      temperatureMeanC: input.temperatureMeanC,
      relativeHumidityMeanPct: input.relativeHumidityMeanPct,
    });
    const expectedMonth = 0.0018 * (26.35 + 25) ** 2 * (100 - 45);

    expect(result.daysInMonth).toBe(31);
    expect(result.etoMmMonth).toBeCloseTo(expectedMonth, 12);
    expect(result.etoMmDay).toBeCloseTo(expectedMonth / 31, 12);
  });

  it("não calcula sem umidade", () => {
    const result = calculateReferenceEtoIvanov({
      date: input.date,
      temperatureMeanC: input.temperatureMeanC,
      relativeHumidityMeanPct: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("relativeHumidityMeanPct");
  });
});

describe("Camargo 1971", () => {
  it("usa Ra, temperatura média e K definido pela normal anual", () => {
    const result = calculateReferenceEtoCamargo1971({
      date: input.date,
      latitude: input.latitude,
      temperatureMeanC: input.temperatureMeanC,
      temperatureMinC: input.temperatureMinC,
      temperatureMaxC: input.temperatureMaxC,
      climatologicalAnnualMeanTemperatureC: 23.77,
    });
    const expected = 0.0105
      * (result.extraterrestrialRadiationMjM2Day as number) * 0.408
      * (input.temperatureMeanC as number);

    expect(result.adjustmentK).toBe(0.0105);
    expect(result.etoMmDay).toBeCloseTo(expected, 12);
  });

  it("aplica as faixas de K sem interpolação implícita", () => {
    expect(camargoAdjustmentK(23.5)).toBe(0.01);
    expect(camargoAdjustmentK(24.5)).toBe(0.0105);
    expect(camargoAdjustmentK(25.5)).toBe(0.011);
    expect(camargoAdjustmentK(26.5)).toBe(0.0115);
    expect(camargoAdjustmentK(27.5)).toBe(0.012);
    expect(camargoAdjustmentK(28)).toBe(0.013);
  });

  it("não substitui a normal anual por temperatura recente", () => {
    const result = calculateReferenceEtoCamargo1971({
      date: input.date,
      latitude: input.latitude,
      temperatureMeanC: input.temperatureMeanC,
      temperatureMinC: input.temperatureMinC,
      temperatureMaxC: input.temperatureMaxC,
      climatologicalAnnualMeanTemperatureC: null,
    });
    expect(result.etoMmDay).toBeNull();
    expect(result.missingFields).toContain("climatologicalAnnualMeanTemperatureC");
  });
});
