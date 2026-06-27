import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/ui/ChartCard";
import { StatCard } from "@/components/ui/StatCard";
import { EnergiaPorCulturaChart } from "@/components/dashboard/charts/EnergiaPorCulturaChart";
import { Table, type Coluna } from "@/components/ui/Table";
import { pivos } from "@/lib/mock-data";
import { formatBRL, formatNumber } from "@/lib/format";
import type { Pivo } from "@/lib/types";

const energiaTotal = pivos.reduce((s, p) => s + p.energia, 0);
const custoTotal = pivos.reduce((s, p) => s + p.custo, 0);

/** Tabela de consumo energético por pivô. */
const colunas: Coluna<Pivo>[] = [
  { header: "Pivô", render: (p) => <span className="font-semibold">{p.id}</span> },
  { header: "Cultura", render: (p) => p.cultura },
  { header: "Tempo irrig.", align: "right", render: (p) => `${formatNumber(p.tempoIrrigacao, 1)} h` },
  { header: "Energia", align: "right", render: (p) => `${formatNumber(p.energia)} kWh` },
  { header: "Custo", align: "right", render: (p) => formatBRL(p.custo) },
];

/** Página de gestão de energia. */
export default function EnergiaPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Energia" descricao="Consumo energético estimado da operação" />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          metrica={{
            id: "energia-total",
            titulo: "Energia total estimada",
            valor: `${formatNumber(energiaTotal)} kWh`,
            descricao: "Consumo previsto para hoje",
          }}
        />
        <StatCard
          metrica={{
            id: "custo-energia",
            titulo: "Custo energético",
            valor: formatBRL(custoTotal),
            descricao: "Custo operacional do dia",
          }}
        />
        <StatCard
          metrica={{
            id: "consumo-medio",
            titulo: "Consumo médio por pivô",
            valor: `${formatNumber(energiaTotal / pivos.length)} kWh`,
            descricao: "Média entre os pivôs",
          }}
        />
      </section>

      <ChartCard titulo="Energia por cultura" subtitulo="Consumo estimado (kWh)">
        <EnergiaPorCulturaChart />
      </ChartCard>

      <Card>
        <h3 className="mb-4 text-sm font-semibold text-graphite-900">Consumo por pivô</h3>
        <Table colunas={colunas} dados={pivos} getKey={(p) => p.id} />
      </Card>
    </div>
  );
}
