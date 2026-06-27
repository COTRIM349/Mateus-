import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ClimaPage() {
  return (
    <div>
      <PageHeader titulo="Clima" descricao="Dados meteorológicos e ET₀" />
      <EmptyState
        title="Clima"
        description="Painel meteorológico com leituras diárias, ET₀ calculada e histórico climático. Disponível na próxima sprint."
      />
    </div>
  );
}
