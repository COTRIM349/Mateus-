"use client";

import { PageHeader } from "@/components/layout/PageHeader";

export default function FertirrigacaoPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Projeto Fertirrigação"
        descricao="Sistema simples — Caixa azul 20.000 L com bomba injetora para pivô central"
      />

      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/fertirrigacao.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          Abrir prancha técnica
        </a>
        <a
          href="/fertirrigacao_caixas_10mil_sketchup.zip"
          download
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-graphite-800 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:border-graphite-600 dark:bg-graphite-800 dark:text-gray-200 dark:hover:bg-graphite-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
          Baixar modelo 3D (SketchUp)
        </a>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          ZIP com DAE + RB + STL + README
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm dark:border-graphite-700">
        <iframe
          src="/fertirrigacao.html"
          title="Prancha técnica de fertirrigação"
          className="h-[calc(100vh-220px)] w-full border-0"
        />
      </div>
    </div>
  );
}
