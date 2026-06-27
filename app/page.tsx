import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/ui/ChartCard";
import { CotrimAICard } from "@/components/dashboard/CotrimAICard";
import { RecommendationTable } from "@/components/dashboard/RecommendationTable";
import { DeficitPorPivoChart } from "@/components/dashboard/charts/DeficitPorPivoChart";
import { CustoPorCulturaChart } from "@/components/dashboard/charts/CustoPorCulturaChart";
import { VolumePorModuloChart } from "@/components/dashboard/charts/VolumePorModuloChart";
import { EnergiaPorCulturaChart } from "@/components/dashboard/charts/EnergiaPorCulturaChart";
import { metricasDashboard } from "@/lib/mock-data";

/**
 * Dashboard inicial da Cotrim Irrigação Pro.
 * Reúne métricas, recomendação da IA, tabela operacional e gráficos.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Dashboard"
        descricao="Visão geral da operação de irrigação — atualizado hoje"
      />

      {/* 8 cards de métricas */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricasDashboard.map((metrica) => (
          <StatCard key={metrica.id} metrica={metrica} />
        ))}
      </section>

      {/* Recomendação da Cotrim AI */}
      <CotrimAICard />

      {/* Tabela de recomendação de irrigação */}
      <RecommendationTable />

      {/* Gráficos */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard titulo="Déficit por pivô" subtitulo="Déficit hídrico atual (mm)">
          <DeficitPorPivoChart />
        </ChartCard>
        <ChartCard titulo="Custo por cultura" subtitulo="Custo estimado do dia (R$)">
          <CustoPorCulturaChart />
        </ChartCard>
        <ChartCard titulo="Volume aplicado por módulo" subtitulo="Distribuição do volume (m³)">
          <VolumePorModuloChart />
        </ChartCard>
        <ChartCard titulo="Energia por cultura" subtitulo="Consumo estimado (kWh)">
          <EnergiaPorCulturaChart />
        </ChartCard>
      </section>
    </div>
  );
}
