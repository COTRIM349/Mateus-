/** Marcadores fenológicos cadastrados: sem interpolação fictícia de R1/R2. */
export interface PhenologyMarkerRow {
  id: string;
  stage_code: string;
  name: string;
  marker_order: number;
}

export interface PhenologyTargetRow {
  marker_id: string;
  expected_dae: number | null;
  calibrated_dae: number | null;
  use_calibrated: boolean;
  confidence?: "alta" | "media" | "baixa" | "nao_validada" | null;
}

export interface PhenologyChartMarker {
  code: string;
  label: string;
  dae: number;
  origin: "calibrado" | "esperado";
  confidence?: string | null;
}

export function buildPhenologyChartMarkers(
  markers: PhenologyMarkerRow[],
  targets: PhenologyTargetRow[],
): PhenologyChartMarker[] {
  const targetByMarker = new Map(targets.map((target) => [target.marker_id, target]));
  return [...markers]
    .sort((a, b) => a.marker_order - b.marker_order)
    .flatMap((marker) => {
      const target = targetByMarker.get(marker.id);
      if (!target) return [];
      const calibrated = target.use_calibrated === true
        && target.calibrated_dae != null && Number.isFinite(target.calibrated_dae);
      const dae = calibrated ? target.calibrated_dae : target.expected_dae;
      if (dae == null || !Number.isFinite(dae) || dae < 0) return [];
      return [{
        code: marker.stage_code.trim().toUpperCase(),
        label: marker.name,
        dae,
        origin: calibrated ? "calibrado" as const : "esperado" as const,
        ...(target.confidence ? { confidence: target.confidence } : {}),
      }];
    })
    .sort((a, b) => a.dae - b.dae);
}
