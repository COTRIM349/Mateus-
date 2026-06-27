import { Card } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { formatBRL, formatNumber } from "@/utils/format";
import type { PivotIrrigationRecommendation } from "@/types/domain/pivot";

const columns: Column<PivotIrrigationRecommendation>[] = [
  { header: "Pivô", render: (r) => <span className="font-semibold">{r.pivotId}</span> },
  { header: "Cultura", render: (r) => r.cultureName },
  { header: "Fase", render: (r) => <span className="text-gray-500">{r.cropStage}</span> },
  { header: "Área", align: "right", render: (r) => `${formatNumber(r.area)} ha` },
  { header: "Déficit", align: "right", render: (r) => `${formatNumber(r.deficit, 1)} mm` },
  { header: "Lâmina rec.", align: "right", render: (r) => `${formatNumber(r.recommendedDepth, 1)} mm` },
  { header: "Tempo irrig.", align: "right", render: (r) => `${formatNumber(r.irrigationTime, 1)} h` },
  { header: "Prioridade", align: "center", render: (r) => <PriorityBadge priority={r.priority} /> },
  { header: "Custo est.", align: "right", render: (r) => formatBRL(r.cost) },
  { header: "Status", align: "center", render: (r) => <StatusBadge status={r.status} /> },
];

export function RecommendationTable({
  recommendations,
}: {
  recommendations: PivotIrrigationRecommendation[];
}) {
  const priorityOrder = { alta: 0, media: 1, baixa: 2 };
  const sorted = [...recommendations].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.deficit - a.deficit,
  );

  return (
    <Card>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-graphite-900">
          Recomendação de irrigação — hoje
        </h3>
        <p className="text-xs text-gray-500">Ordenada por prioridade e déficit</p>
      </div>
      <Table columns={columns} data={sorted} getKey={(r) => r.pivotId} />
    </Card>
  );
}
