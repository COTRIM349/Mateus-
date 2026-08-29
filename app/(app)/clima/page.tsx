import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { ClimateDashboard } from "@/components/climate/dashboard/ClimateDashboard";

export default function ClimaPage() {
  return (
    <div>
      <PageHeader
        titulo="Clima"
        descricao="Condições meteorológicas, previsão e evapotranspiração de referência"
        acao={
          <Link
            href="/clima/observabilidade"
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[11px] font-bold text-graphite-600 shadow-sm transition-colors hover:border-brand-200 hover:text-brand-700 dark:border-white/[0.08] dark:bg-graphite-800 dark:text-gray-300"
          >
            Fechamento diário
          </Link>
        }
      />
      <ClimateDashboard />
    </div>
  );
}
