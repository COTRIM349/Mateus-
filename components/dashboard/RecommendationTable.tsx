import { Card } from "@/components/ui/Card";
import { Table, type Coluna } from "@/components/ui/Table";
import { PrioridadeBadge, StatusBadge } from "@/components/ui/Badge";
import { pivos } from "@/lib/mock-data";
import { formatBRL, formatNumber } from "@/lib/format";
import type { Pivo } from "@/lib/types";

/** Colunas da tabela de recomendação de irrigação. */
const colunas: Coluna<Pivo>[] = [
  { header: "Pivô", render: (p) => <span className="font-semibold">{p.id}</span> },
  { header: "Cultura", render: (p) => p.cultura },
  { header: "Fase", render: (p) => <span className="text-gray-500">{p.fase}</span> },
  { header: "Área", align: "right", render: (p) => `${formatNumber(p.area)} ha` },
  { header: "Déficit", align: "right", render: (p) => `${formatNumber(p.deficit, 1)} mm` },
  {
    header: "Lâmina rec.",
    align: "right",
    render: (p) => `${formatNumber(p.laminaRecomendada, 1)} mm`,
  },
  {
    header: "Tempo irrig.",
    align: "right",
    render: (p) => `${formatNumber(p.tempoIrrigacao, 1)} h`,
  },
  { header: "Prioridade", align: "center", render: (p) => <PrioridadeBadge prioridade={p.prioridade} /> },
  { header: "Custo est.", align: "right", render: (p) => formatBRL(p.custo) },
  { header: "Status", align: "center", render: (p) => <StatusBadge status={p.status} /> },
];

/**
 * Tabela de recomendação de irrigação do dia, ordenada por prioridade.
 */
export function RecommendationTable() {
  // Ordena por prioridade (alta → baixa) e, dentro disso, por déficit.
  const ordem = { alta: 0, media: 1, baixa: 2 };
  const dados = [...pivos].sort(
    (a, b) => ordem[a.prioridade] - ordem[b.prioridade] || b.deficit - a.deficit,
  );

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-graphite-900">
            Recomendação de irrigação — hoje
          </h3>
          <p className="text-xs text-gray-500">Ordenada por prioridade e déficit</p>
        </div>
      </div>
      <Table colunas={colunas} dados={dados} getKey={(p) => p.id} />
    </Card>
  );
}
