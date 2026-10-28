import { describe, expect, it } from "vitest";
import { buildPhenologyChartMarkers } from "./phenology-chart-markers";

const markers = [
  { id: "r1", stage_code: "r1", name: "Início do florescimento", marker_order: 1 },
  { id: "r2", stage_code: "R2", name: "Florescimento pleno", marker_order: 2 },
  { id: "r3", stage_code: "R3", name: "Início da formação de vagens", marker_order: 3 },
];

describe("marcos fenológicos reais no gráfico Kc", () => {
  it("ordena R1/R2 e prioriza somente a calibração ativa", () => {
    const targets = [
      { marker_id: "r1", expected_dae: 40, calibrated_dae: 42, use_calibrated: true },
      { marker_id: "r2", expected_dae: 50, calibrated_dae: 55, use_calibrated: false },
      { marker_id: "r3", expected_dae: 61, calibrated_dae: null, use_calibrated: false },
    ];
    expect(buildPhenologyChartMarkers(markers, targets)).toEqual([
      { code: "R1", label: "Início do florescimento", dae: 42, origin: "calibrado" },
      { code: "R2", label: "Florescimento pleno", dae: 50, origin: "esperado" },
      { code: "R3", label: "Início da formação de vagens", dae: 61, origin: "esperado" },
    ]);
  });

  it("não inventa datas para estádio sem alvo cadastrado", () => {
    const targets = [
      { marker_id: "r1", expected_dae: null, calibrated_dae: null, use_calibrated: false },
      { marker_id: "r2", expected_dae: 53, calibrated_dae: null, use_calibrated: false },
    ];
    expect(buildPhenologyChartMarkers(markers, targets).map((x) => x.code)).toEqual(["R2"]);
  });

  it("não usa calibração inválida ou negativa", () => {
    const targets = [
      { marker_id: "r1", expected_dae: 35, calibrated_dae: Number.NaN, use_calibrated: true },
      { marker_id: "r2", expected_dae: -7, calibrated_dae: null, use_calibrated: false },
    ];
    expect(buildPhenologyChartMarkers(markers, targets)).toEqual([
      { code: "R1", label: "Início do florescimento", dae: 35, origin: "esperado" },
    ]);
  });
});
