"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { HydricMapOverlay } from "@/components/maps/HydricMapOverlay";
import { VisionMapToolbar } from "@/components/maps/VisionMapToolbar";
import { VisionMapLegend } from "@/components/maps/VisionMapLegend";
import { countMapStatuses, hydricDemandSummary, hydricMapDates } from "@/components/maps/hydric-map-markers";
import { useVisionMap } from "@/lib/hooks/use-vision-map";
import type { PivotHydricState } from "@/modules/water-balance/services";
import { DRAWING_KIND_LABELS } from "@/modules/vision-map/services";

const VisionMap = dynamic(
  () => import("@/components/maps/VisionMap").then((m) => ({ default: m.VisionMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(72vh,700px)] min-h-[480px] items-center justify-center bg-gray-50/50 dark:bg-graphite-800">
        <p className="text-sm text-graphite-400">Carregando mapa...</p>
      </div>
    ),
  },
);

export function VisionMapPanel({
  states,
  selectedId,
  onSelect,
  selectedDate,
  onSelectDate,
  overlay,
  mapClassName,
  emptyDescription,
}: {
  states: PivotHydricState[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  overlay?: ReactNode;
  mapClassName?: string;
  emptyDescription?: string;
}) {
  const dates = hydricMapDates(states);
  const activeDate = selectedDate ?? dates[dates.length - 1] ?? null;
  const vision = useVisionMap(states, activeDate);
  const counts = countMapStatuses(states, activeDate);
  const demand = hydricDemandSummary(states, activeDate);
  const selectedDrawing = vision.drawings.find((d) => d.id === vision.selectedDrawingId) ?? null;
  const hasCoords = vision.markers.length > 0 || vision.drawings.length > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-card dark:border-white/[0.06]">
      <VisionMapToolbar
        layer={vision.layer}
        onLayer={vision.setLayer}
        drawKind={vision.drawKind}
        onDrawKind={vision.setDrawKind}
        busy={vision.busy}
        onRefreshOrbital={vision.refreshOrbital}
      />

      {hasCoords ? (
        <>
          <div className="relative">
            <VisionMap
              pivots={vision.markers}
              drawings={vision.drawings}
              drawTool={vision.drawTool}
              highlightId={selectedId ?? undefined}
              selectedDrawingId={vision.selectedDrawingId}
              onSelect={(id) => {
                vision.setSelectedDrawingId(null);
                onSelect(id);
              }}
              onSelectDrawing={(id) => {
                onSelect(null);
                vision.setSelectedDrawingId(id);
              }}
              onDrawingComplete={(geometry) => {
                if (vision.drawKind === "select") return;
                void vision.createDrawing(vision.drawKind, geometry);
              }}
              className={mapClassName ?? "h-[min(72vh,700px)] min-h-[520px] w-full rounded-none border-0"}
            />
            {overlay ? <HydricMapOverlay onClose={() => onSelect(null)}>{overlay}</HydricMapOverlay> : null}
            {selectedDrawing && !overlay ? (
              <HydricMapOverlay onClose={() => vision.setSelectedDrawingId(null)}>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/90 p-4 text-white shadow-lg">
                  <p className="text-sm font-semibold">{selectedDrawing.name}</p>
                  <p className="mt-1 text-xs text-white/70">{DRAWING_KIND_LABELS[selectedDrawing.kind]}</p>
                  <button
                    type="button"
                    onClick={() => void vision.deleteDrawing(selectedDrawing.id)}
                    className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-700"
                  >
                    Excluir desenho
                  </button>
                </div>
              </HydricMapOverlay>
            ) : null}
          </div>
          <VisionMapLegend
            layer={vision.layer}
            counts={counts}
            dates={dates}
            selectedDate={activeDate}
            onSelectDate={onSelectDate}
            demand={demand}
            attribution={vision.layer === "orbital" ? vision.orbitalAttribution : null}
          />
        </>
      ) : (
        <EmptyState
          title="Nenhum pivô com parcela ativa"
          description={
            emptyDescription ??
            "O mapa mostra equipamentos com parcela em manejo. Cadastre ou reative uma parcela para o pivô voltar ao mapa."
          }
        />
      )}

      {vision.message ? (
        <p className="border-t border-amber-100 bg-amber-50/80 px-4 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
          {vision.message}
        </p>
      ) : null}
    </div>
  );
}
