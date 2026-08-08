"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { ClimateObservabilityTab } from "@/components/climate/ClimateObservabilityTab";

export default function ClimateObservabilityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Observabilidade Climática"
        descricao="Saúde das fontes, consenso e ETo FAO-56 em Shadow Mode"
      />
      <ClimateObservabilityTab />
    </div>
  );
}
