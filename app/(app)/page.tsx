"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/ui/ChartCard";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/components/providers";

const placeholderMetrics = [
  { id: "pivots",   title: "Pivôs cadastrados",     value: "10",      description: "Total na fazenda ativa" },
  { id: "area",     title: "Área irrigada",          value: "757 ha",  description: "Total sob irrigação" },
  { id: "active",   title: "Pivôs irrigando",        value: "5",       description: "Operando agora" },
  { id: "alerts",   title: "Alertas ativos",         value: "2",       description: "Requerem atenção", trend: "negative" as const, variation: "+1" },
  { id: "deficit",  title: "Déficit médio",          value: "—",       description: "Aguardando dados climáticos" },
  { id: "volume",   title: "Volume do dia",          value: "—",       description: "Aguardando balanço hídrico" },
  { id: "energy",   title: "Energia estimada",       value: "—",       description: "Aguardando cálculos" },
  { id: "cost",     title: "Custo estimado",         value: "—",       description: "Aguardando tarifação" },
];

function PlaceholderChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-gray-200 dark:border-graphite-700">
      <span className="text-sm text-gray-400 dark:text-gray-500">{label}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { profile, farms, activeFarmId } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Dashboard"
        descricao={activeFarm ? `${activeFarm.name} · Visão geral` : "Visão geral da operação"}
      />

      {profile && (
        <Card className="border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-brand-800 dark:text-brand-300">
                Bem-vindo, {profile.name.split(" ")[0]}!
              </p>
              <p className="mt-0.5 text-sm text-brand-700 dark:text-brand-400">
                A plataforma está em fase de configuração inicial.
                Os módulos de manejo hídrico, energia e custos serão ativados nas próximas sprints.
              </p>
            </div>
          </div>
        </Card>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {placeholderMetrics.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Déficit por pivô" subtitle="Aguardando balanço hídrico">
          <PlaceholderChart label="Gráfico de barras — Déficit hídrico (mm)" />
        </ChartCard>
        <ChartCard title="Custo por cultura" subtitle="Aguardando tarifação">
          <PlaceholderChart label="Gráfico de barras — Custo estimado (R$)" />
        </ChartCard>
        <ChartCard title="Volume por módulo" subtitle="Aguardando cálculos">
          <PlaceholderChart label="Gráfico de pizza — Distribuição de volume (m³)" />
        </ChartCard>
        <ChartCard title="Energia por cultura" subtitle="Aguardando dados">
          <PlaceholderChart label="Gráfico de área — Consumo (kWh)" />
        </ChartCard>
      </section>
    </div>
  );
}
