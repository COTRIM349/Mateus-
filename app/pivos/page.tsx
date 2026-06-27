import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, type Coluna } from "@/components/ui/Table";
import { StatusBadge, PrioridadeBadge } from "@/components/ui/Badge";
import { pivos } from "@/lib/mock-data";
import { formatBRL, formatNumber } from "@/lib/format";
import type { Pivo } from "@/lib/types";

/** Colunas da listagem de pivôs. */
const colunas: Coluna<Pivo>[] = [
  { header: "Pivô", render: (p) => <span className="font-semibold">{p.id}</span> },
  { header: "Módulo", render: (p) => p.modulo },
  { header: "Cultura", render: (p) => p.cultura },
  { header: "Fase", render: (p) => <span className="text-gray-500">{p.fase}</span> },
  { header: "Área", align: "right", render: (p) => `${formatNumber(p.area)} ha` },
  { header: "Déficit", align: "right", render: (p) => `${formatNumber(p.deficit, 1)} mm` },
  { header: "Volume", align: "right", render: (p) => `${formatNumber(p.volume)} m³` },
  { header: "Energia", align: "right", render: (p) => `${formatNumber(p.energia)} kWh` },
  { header: "Custo", align: "right", render: (p) => formatBRL(p.custo) },
  { header: "Prioridade", align: "center", render: (p) => <PrioridadeBadge prioridade={p.prioridade} /> },
  { header: "Status", align: "center", render: (p) => <StatusBadge status={p.status} /> },
];

/** Página de listagem dos pivôs centrais. */
export default function PivosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Pivôs"
        descricao={`${pivos.length} pivôs centrais cadastrados`}
      />
      <Card>
        <Table colunas={colunas} dados={pivos} getKey={(p) => p.id} />
      </Card>
    </div>
  );
}
