import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { mockRecommendations, mockCultures } from "@/shared/data";
import { formatNumber } from "@/utils/format";
import { sum, average } from "@/utils/math";

export default function CulturasPage() {
  return (
    <div className="space-y-6">
      <PageHeader titulo="Culturas" descricao="Culturas em produção e seus indicadores agregados" />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mockCultures.map((cultura) => {
          const recs = mockRecommendations.filter((r) => r.cultureName === cultura);
          const totalArea = sum(recs.map((r) => r.area));
          const avgDeficit = average(recs.map((r) => r.deficit));

          return (
            <Card key={cultura} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-graphite-900">{cultura}</h3>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                  {recs.length} pivôs
                </span>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Área total</dt>
                  <dd className="font-medium">{formatNumber(totalArea)} ha</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Déficit médio</dt>
                  <dd className="font-medium">{formatNumber(avgDeficit, 1)} mm</dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
