import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CustosPage() {
  return (
    <div className="space-y-8">
      <PageHeader titulo="Custos" descricao="Tarifas de energia, custos por mm/ha e histórico de faturas" />
      <EmptyState
        title="Central de custos"
        description="Tarifas por fazenda/módulo, custos operacionais por pivô e safra, histórico de faturas de energia. Disponível na próxima sprint."
      />
    </div>
  );
}
