import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CulturasPage() {
  return (
    <div>
      <PageHeader titulo="Culturas" descricao="Coeficientes agronômicos e estágios fenológicos" />
      <EmptyState
        title="Culturas"
        description="Cadastro de culturas com Kc por estágio, profundidade de raiz e fator de depleção. Disponível na próxima sprint."
      />
    </div>
  );
}
