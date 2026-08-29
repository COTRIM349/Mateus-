"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { ClimateObservabilityTab } from "@/components/climate/ClimateObservabilityTab";
import { ClimateV2RunNow } from "@/components/climate/ClimateV2RunNow";
import { useAuth } from "@/components/providers";
import { ClimateAdminEtoAudit } from "@/components/climate/ClimateAdminEtoAudit";

export default function ClimateObservabilityPage() {
  const { profile, loading } = useAuth();
  if (loading) return <div className="py-16 text-center text-sm text-graphite-400">Verificando acesso…</div>;
  if (profile?.role !== "admin") return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/[0.08] dark:text-red-300">Acesso exclusivo para administradores.</div>;
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Dados climáticos administrativos"
        descricao="Comparação técnica das APIs, consenso e auditoria completa da ETo"
      />
      <ClimateV2RunNow />
      <ClimateObservabilityTab />
      <ClimateAdminEtoAudit />
    </div>
  );
}
