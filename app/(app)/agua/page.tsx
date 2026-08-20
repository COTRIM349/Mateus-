import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AguaPage() {
  return (
    <div className="space-y-8">
      <PageHeader titulo="Água" descricao="Fontes de água (rio, poço, reservatório, outorga)" />
      <EmptyState
        title="Cadastro de fontes de água"
        description="Cadastro central das fontes de água da fazenda com vazão, outorga, qualidade e vínculo aos pivôs. Disponível na próxima sprint."
      />
    </div>
  );
}
