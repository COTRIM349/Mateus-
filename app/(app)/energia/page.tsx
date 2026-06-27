import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function EnergiaPage() {
  return (
    <div>
      <PageHeader titulo="Energia" descricao="Consumo energético e tarifação" />
      <EmptyState
        title="Energia"
        description="Consumo por pivô, custo por período tarifário e análise de eficiência energética. Disponível na próxima sprint."
      />
    </div>
  );
}
