import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function OrdemServicoPage() {
  return (
    <div className="space-y-8">
      <PageHeader titulo="Ordem de Serviço" descricao="Emissão e execução de OS de irrigação por módulo" />
      <EmptyState
        title="Ordens de Serviço"
        description="Formato Santa Colomba — planilha por módulo com OK, Pivô, Cultura, Percentual, Observação, Horímetro. Disponível na Sprint 16."
      />
    </div>
  );
}
