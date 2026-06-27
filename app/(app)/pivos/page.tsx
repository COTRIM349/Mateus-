import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function PivosPage() {
  return (
    <div>
      <PageHeader titulo="Pivôs" descricao="Cadastro e monitoramento de pivôs centrais" />
      <EmptyState
        title="Pivôs Centrais"
        description="Listagem completa dos pivôs com status operacional, cultura, déficit e recomendações. Disponível na próxima sprint."
      />
    </div>
  );
}
