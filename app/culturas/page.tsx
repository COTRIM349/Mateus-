import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { culturas, pivos } from "@/lib/mock-data";
import { formatNumber } from "@/lib/format";

/** Página com um resumo agronômico por cultura (dados fictícios). */
export default function CulturasPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Culturas"
        descricao="Culturas em produção e seus indicadores agregados"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {culturas.map((cultura) => {
          const pivosCultura = pivos.filter((p) => p.cultura === cultura);
          const area = pivosCultura.reduce((s, p) => s + p.area, 0);
          const deficitMedio =
            pivosCultura.reduce((s, p) => s + p.deficit, 0) /
            (pivosCultura.length || 1);

          return (
            <Card key={cultura} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-graphite-900">{cultura}</h3>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                  {pivosCultura.length} pivôs
                </span>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Área total</dt>
                  <dd className="font-medium">{formatNumber(area)} ha</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Déficit médio</dt>
                  <dd className="font-medium">{formatNumber(deficitMedio, 1)} mm</dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
