"use client";

/**
 * Cartão flutuante no mapa (estilo Scheduling / FieldNET):
 * o mapa permanece protagonista; o detalhe abre por cima, à direita.
 */
export function HydricMapOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1000] flex justify-end p-3 sm:p-4">
      <div className="pointer-events-auto flex max-h-full w-full max-w-[340px] flex-col gap-2">
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-zinc-950/80 text-lg leading-none text-white shadow-lg hover:bg-zinc-950"
          aria-label="Fechar detalhe do pivô"
        >
          ×
        </button>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
