import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function FazendasPage() {
  return (
    <div>
      <PageHeader titulo="Fazendas" descricao="Gestão de fazendas e módulos produtivos" />
      <EmptyState
        title="Fazendas"
        description="Listagem de fazendas com módulos, pivôs e infraestrutura. Disponível na próxima sprint."
      />
    </div>
  );
}
