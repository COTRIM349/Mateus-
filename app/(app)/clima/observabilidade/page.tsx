"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { ClimateObservabilityTab } from "@/components/climate/ClimateObservabilityTab";
import { ClimateV2RunNow } from "@/components/climate/ClimateV2RunNow";

export default function ClimateObservabilityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Observabilidade Climática"
        descricao="Saúde das fontes, consenso e ETo FAO-56 em Shadow Mode"
      />
      <ClimateV2RunNow />
      <ClimateObservabilityTab />
    </div>
  );
}
