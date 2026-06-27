import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function RateioPage() {
  return (
    <div>
      <PageHeader titulo="Rateio de Custos" descricao="Rateio por área, volume e cultura" />
      <EmptyState
        title="Rateio de Custos"
        description="Rateio de custos operacionais por área irrigada, volume aplicado e cultura. Disponível na próxima sprint."
      />
    </div>
  );
}
