import type { AIRecommendation } from "@/modules/ai/services/ai.service";

export function CotrimAICard({ recommendation }: { recommendation: AIRecommendation }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-graphite-900 to-graphite-800 p-6 text-white shadow-soft">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl" />

      <div className="relative flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a4 4 0 014 4v1a4 4 0 010 8v1a4 4 0 01-8 0v-1a4 4 0 010-8V7a4 4 0 014-4z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h.01M15 12h.01" />
          </svg>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Cotrim AI</h3>
            <span className="rounded-lg bg-brand-500/20 px-2 py-0.5 text-xs font-medium text-brand-300">
              Recomendação do dia
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-200">
            {recommendation.summary}
          </p>
        </div>
      </div>
    </div>
  );
}
