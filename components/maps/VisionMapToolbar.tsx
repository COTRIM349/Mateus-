"use client";

import { DRAWING_KINDS, DRAWING_KIND_CONFIG, VISION_LAYER_CONFIG, VISION_LAYERS, type DrawingKind, type VisionLayer } from "@/modules/vision-map/services";
import { cn } from "@/utils/cn";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-brand-600 text-white"
          : "bg-gray-100 text-graphite-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

export function VisionMapToolbar({
  layer,
  onLayer,
  drawKind,
  onDrawKind,
  busy,
  onRefreshOrbital,
}: {
  layer: VisionLayer;
  onLayer: (layer: VisionLayer) => void;
  drawKind: DrawingKind | "select";
  onDrawKind: (kind: DrawingKind | "select") => void;
  busy?: boolean;
  onRefreshOrbital?: () => void;
}) {
  return (
    <div className="space-y-3 border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-gray-500">
          Camadas
        </span>
        {VISION_LAYERS.map((id) => (
          <Chip key={id} active={layer === id} onClick={() => onLayer(id)}>
            {VISION_LAYER_CONFIG[id].label}
          </Chip>
        ))}
        {layer === "orbital" && onRefreshOrbital ? (
          <button
            type="button"
            onClick={onRefreshOrbital}
            disabled={busy}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:text-brand-400 dark:hover:bg-brand-900/20"
          >
            {busy ? "Atualizando…" : "Atualizar orbital"}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-graphite-400 dark:text-gray-500">
          Desenho
        </span>
        <Chip active={drawKind === "select"} onClick={() => onDrawKind("select")}>
          Selecionar
        </Chip>
        {DRAWING_KINDS.map((kind) => (
          <Chip key={kind} active={drawKind === kind} onClick={() => onDrawKind(kind)}>
            {DRAWING_KIND_CONFIG[kind].label}
          </Chip>
        ))}
      </div>
      {drawKind !== "select" ? (
        <p className="text-[11px] text-graphite-400 dark:text-gray-500">
          {drawKind === "anotacao"
            ? "Clique no mapa para marcar o ponto."
            : "Clique para vértices · Enter ou duplo clique fecha · Esc cancela. O desenho não move o pivô."}
        </p>
      ) : (
        <p className="text-[11px] text-graphite-400 dark:text-gray-500">
          {VISION_LAYER_CONFIG[layer].hint}
        </p>
      )}
    </div>
  );
}
