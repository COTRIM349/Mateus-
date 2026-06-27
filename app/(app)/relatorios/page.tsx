import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function RelatoriosPage() {
  return (
    <div>
      <PageHeader titulo="Relatórios" descricao="Relatórios operacionais e agronômicos" />
      <EmptyState
        title="Relatórios"
        description="Geração de relatórios operacionais, agronômicos e comparativos por safra. Disponível na próxima sprint."
      />
    </div>
  );
}
