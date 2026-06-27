import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { mockRecommendations } from "@/shared/data";
import { formatBRL, formatNumber } from "@/utils/format";
import type { PivotIrrigationRecommendation } from "@/types/domain/pivot";

const columns: Column<PivotIrrigationRecommendation>[] = [
  { header: "Pivô", render: (r) => <span className="font-semibold">{r.pivotId}</span> },
  { header: "Módulo", render: (r) => r.moduleName },
  { header: "Cultura", render: (r) => r.cultureName },
  { header: "Fase", render: (r) => <span className="text-gray-500">{r.cropStage}</span> },
  { header: "Área", align: "right", render: (r) => `${formatNumber(r.area)} ha` },
  { header: "Déficit", align: "right", render: (r) => `${formatNumber(r.deficit, 1)} mm` },
  { header: "Volume", align: "right", render: (r) => `${formatNumber(r.volume)} m³` },
  { header: "Energia", align: "right", render: (r) => `${formatNumber(r.energy)} kWh` },
  { header: "Custo", align: "right", render: (r) => formatBRL(r.cost) },
  { header: "Prioridade", align: "center", render: (r) => <PriorityBadge priority={r.priority} /> },
  { header: "Status", align: "center", render: (r) => <StatusBadge status={r.status} /> },
];

export default function PivosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Pivôs"
        descricao={`${mockRecommendations.length} pivôs centrais cadastrados`}
      />
      <Card>
        <Table columns={columns} data={mockRecommendations} getKey={(r) => r.pivotId} />
      </Card>
    </div>
  );
}
