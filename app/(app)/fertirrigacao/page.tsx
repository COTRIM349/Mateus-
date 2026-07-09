"use client";

import { PageHeader } from "@/components/layout/PageHeader";

export default function FertirrigacaoPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Projeto Fertirrigação"
        descricao="Prancha técnica 3D — Sistema de fertirrigação em caixas para pivô central"
      />

      <div className="flex items-center gap-3">
        <a
          href="/fertirrigacao.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
          Abrir prancha em nova aba
        </a>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Arquivo autônomo — funciona offline
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
