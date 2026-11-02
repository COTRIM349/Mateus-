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
  const resolved = [...markers]
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
    });

  // Defesa de interface: um código fenológico só pode aparecer uma vez.
  // Se houver duplicidade acidental no cadastro, a calibração ativa prevalece;
  // em empate, preservamos o primeiro marco da ordem agronômica.
  const unique = new Map<string, PhenologyChartMarker>();
  for (const marker of resolved) {
    const previous = unique.get(marker.code);
    if (!previous || (previous.origin !== "calibrado" && marker.origin === "calibrado")) {
      unique.set(marker.code, marker);
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.dae - b.dae);
}
