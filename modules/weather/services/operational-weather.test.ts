import { describe, expect, it } from "vitest";
import {
  assembleWeatherByDate,
  classifyMissingClimateDays,
  datesInRange,
  effectiveClimateEndDate,
  resolveClimateSeriesWindow,
} from "./operational-weather";

describe("assembleWeatherByDate", () => {
  const readings = [
    { id: "a", date: "2026-08-28", et0_calculated: 5.1, et0_source: 4.9, precipitation: 2 },
    { id: "b", date: "2026-08-29", et0_calculated: null, et0_source: 4.2, precipitation: 0 },
  ];

  it("usa a leitura selecionada mesmo sem aprovação", () => {
    const weather = assembleWeatherByDate(readings, [
      { date: "2026-08-28", selected_reading_id: "a" },
    ]);
    expect(weather["2026-08-28"]).toEqual({ et0: 5.1, precipitation: 2 });
  });

  it("preenche lacuna com ETo de modelo quando a calculada ainda não existe", () => {
    const weather = assembleWeatherByDate(readings, []);
    expect(weather["2026-08-29"]?.et0).toBe(4.2);
  });
});

describe("classifyMissingClimateDays", () => {
  it("trata o dia corrente como aberto, não histórico", () => {
    const result = classifyMissingClimateDays(["2026-08-28", "2026-08-29"], "2026-08-29");
    expect(result.historical).toEqual(["2026-08-28"]);
    expect(result.open).toEqual(["2026-08-29"]);
  });
});

describe("effectiveClimateEndDate", () => {
  it("recua a data fim quando o dia de hoje ainda não tem ETo", () => {
    const end = effectiveClimateEndDate(
      "2026-08-29",
      { "2026-08-28": { et0: 5, precipitation: 0 } },
      "2026-08-29",
    );
    expect(end).toBe("2026-08-28");
  });
});

describe("resolveClimateSeriesWindow", () => {
  it("não bloqueia o período do print quando só falta o dia corrente", () => {
    const weather = Object.fromEntries(
      datesInRange("2026-07-11", "2026-08-28").map((date) => [date, { et0: 5.4, precipitation: 0 }]),
    );
    const result = resolveClimateSeriesWindow("2026-07-11", "2026-08-29", weather, "2026-08-29");
    expect(result.blockingMessage).toBeNull();
    expect(result.seriesEnd).toBe("2026-08-28");
    expect(result.openMissing).toEqual(["2026-08-29"]);
    expect(result.notice).toContain("2026-08-29");
    expect(result.notice).toContain("2026-08-28");
    expect(result.blockingMessage ?? "").not.toContain("dado climático aprovado");
  });

  it("calcula o dia corrente quando a ETo de modelo já existe, sem exigir aprovação", () => {
    const weather = assembleWeatherByDate(
      [{ id: "b", date: "2026-08-29", et0_calculated: null, et0_source: 4.2, precipitation: 0 }],
      [{ date: "2026-08-29", selected_reading_id: "b" }],
    );
    const result = resolveClimateSeriesWindow("2026-08-29", "2026-08-29", weather, "2026-08-29");
    expect(result.blockingMessage).toBeNull();
    expect(result.seriesEnd).toBe("2026-08-29");
    expect(result.notice).toBeNull();
  });

  it("ainda bloqueia dia encerrado sem ETo", () => {
    const result = resolveClimateSeriesWindow(
      "2026-08-27",
      "2026-08-29",
      { "2026-08-29": { et0: 4.2, precipitation: 0 } },
      "2026-08-29",
    );
    expect(result.blockingMessage).toContain("2026-08-27");
    expect(result.blockingMessage).toContain("encerrado(s) sem ETo");
    expect(result.blockingMessage).not.toContain("dado climático aprovado");
  });
});
