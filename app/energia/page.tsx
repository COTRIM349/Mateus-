import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/ui/ChartCard";
import { StatCard } from "@/components/ui/StatCard";
import { EnergiaPorCulturaChart } from "@/modules/dashboard/components/charts";
import { buildEnergyByCulture } from "@/modules/dashboard/services";
import { Table, type Column } from "@/components/ui/Table";
import { mockRecommendations, mockCultures } from "@/shared/data";
import { formatBRL, formatNumber } from "@/utils/format";
import { sum, average } from "@/utils/math";
import type { PivotIrrigationRecommendation } from "@/types/domain/pivot";

const totalEnergy = sum(mockRecommendations.map((r) => r.energy));
const totalCost = sum(mockRecommendations.map((r) => r.cost));
const avgEnergy = average(mockRecommendations.map((r) => r.energy));
const energyData = buildEnergyByCulture(mockRecommendations, mockCultures);

const columns: Column<PivotIrrigationRecommendation>[] = [
  { header: "Pivô", render: (r) => <span className="font-semibold">{r.pivotId}</span> },
  { header: "Cultura", render: (r) => r.cultureName },
  { header: "Tempo irrig.", align: "right", render: (r) => `${formatNumber(r.irrigationTime, 1)} h` },
  { header: "Energia", align: "right", render: (r) => `${formatNumber(r.energy)} kWh` },
  { header: "Custo", align: "right", render: (r) => formatBRL(r.cost) },
];

export default function EnergiaPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Energia" descricao="Consumo energético estimado da operação" />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard metric={{ id: "e1", title: "Energia total estimada", value: `${formatNumber(totalEnergy)} kWh`, description: "Consumo previsto para hoje" }} />
        <StatCard metric={{ id: "e2", title: "Custo energético", value: formatBRL(totalCost), description: "Custo operacional do dia" }} />
        <StatCard metric={{ id: "e3", title: "Consumo médio por pivô", value: `${formatNumber(avgEnergy)} kWh`, description: "Média entre os pivôs" }} />
      </section>

      <ChartCard title="Energia por cultura" subtitle="Consumo estimado (kWh)">
        <EnergiaPorCulturaChart data={energyData} />
      </ChartCard>

      <Card>
        <h3 className="mb-4 text-sm font-semibold text-graphite-900">Consumo por pivô</h3>
        <Table columns={columns} data={mockRecommendations} getKey={(r) => r.pivotId} />
      </Card>
    </div>
  );
}
