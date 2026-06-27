import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ChartCard } from "@/components/ui/ChartCard";
import {
  CotrimAICard,
  RecommendationTable,
  DeficitPorPivoChart,
  CustoPorCulturaChart,
  VolumePorModuloChart,
  EnergiaPorCulturaChart,
} from "@/modules/dashboard";
import {
  buildDashboardMetrics,
  buildDeficitByPivot,
  buildCostByCulture,
  buildVolumeByModule,
  buildEnergyByCulture,
} from "@/modules/dashboard/services";
import { generateRecommendation } from "@/modules/ai/services";
import { mockRecommendations, mockCultures, mockModules } from "@/shared/data";

const metrics = buildDashboardMetrics(mockRecommendations);
const deficitData = buildDeficitByPivot(mockRecommendations);
const costData = buildCostByCulture(mockRecommendations, mockCultures);
const volumeData = buildVolumeByModule(mockRecommendations, mockModules);
const energyData = buildEnergyByCulture(mockRecommendations, mockCultures);
const aiRecommendation = generateRecommendation(mockRecommendations);

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Dashboard"
        descricao="Visão geral da operação de irrigação — atualizado hoje"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <StatCard key={m.id} metric={m} />
        ))}
      </section>

      <CotrimAICard recommendation={aiRecommendation} />

      <RecommendationTable recommendations={mockRecommendations} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Déficit por pivô" subtitle="Déficit hídrico atual (mm)">
          <DeficitPorPivoChart data={deficitData} />
        </ChartCard>
        <ChartCard title="Custo por cultura" subtitle="Custo estimado do dia (R$)">
          <CustoPorCulturaChart data={costData} />
        </ChartCard>
        <ChartCard title="Volume aplicado por módulo" subtitle="Distribuição do volume (m³)">
          <VolumePorModuloChart data={volumeData} />
        </ChartCard>
        <ChartCard title="Energia por cultura" subtitle="Consumo estimado (kWh)">
          <EnergiaPorCulturaChart data={energyData} />
        </ChartCard>
      </section>
    </div>
  );
}
