// ============================================================================
// components/climate/ShadowModeBanner.tsx
// ----------------------------------------------------------------------------
// Banner fixo indicando que a aba Diagnóstico opera em Shadow Mode e NÃO
// alimenta o balanço hídrico nem a recomendação de irrigação.
// Usado exclusivamente pela aba Diagnóstico.
// ============================================================================

export function ShadowModeBanner() {
  return (
    <div
      role="status"
      className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-soft dark:border-amber-600/60 dark:bg-amber-950/50 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white"
        >
          !
        </span>
        <div>
          <p className="font-semibold">MODO DIAGNÓSTICO</p>
          <p className="text-amber-800 dark:text-amber-200/90">
            Estes dados ainda não são utilizados pelo balanço hídrico ou pela
            recomendação de irrigação.
          </p>
        </div>
      </div>
    </div>
  );
}
