"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { ClimateDailyCloseAdmin } from "@/components/climate/ClimateDailyCloseAdmin";
import { ClimateObservabilityTab } from "@/components/climate/ClimateObservabilityTab";
import { ClimateAdminEtoAudit } from "@/components/climate/ClimateAdminEtoAudit";
import { useAuth } from "@/components/providers";

export default function ClimateObservabilityPage() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="py-16 text-center text-sm text-graphite-400">Verificando acesso…</div>;
  }

  if (profile?.role !== "admin") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/[0.08] dark:text-red-300">
        Acesso exclusivo para administradores.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Fechamento climático diário"
        descricao="Coleta automática das APIs, validação das variáveis meteorológicas e cálculo interno da ETo FAO-56"
      />

      <ClimateDailyCloseAdmin />

      <details className="rounded-2xl border border-gray-100 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-graphite-800">
        <summary className="cursor-pointer text-xs font-bold text-graphite-600 dark:text-gray-300">
          Diagnóstico avançado das APIs
        </summary>
        <div className="mt-5 space-y-6">
          <p className="text-xs leading-relaxed text-graphite-400">
            Esta área é apenas técnica. Os candidatos de 30 minutos, consenso e métodos alternativos não definem sozinhos a ETo operacional diária.
          </p>
          <ClimateObservabilityTab />
          <ClimateAdminEtoAudit />
        </div>
      </details>
    </div>
  );
}
