import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SolosPage() {
  return (
    <div>
      <PageHeader titulo="Solos" descricao="Parâmetros hídricos e tipos de solo" />
      <EmptyState
        title="Solos"
        description="Cadastro de solos com capacidade de campo, ponto de murcha, densidade e infiltração. Disponível na próxima sprint."
      />
    </div>
  );
}
