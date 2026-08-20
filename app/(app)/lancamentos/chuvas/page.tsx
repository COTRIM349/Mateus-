import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function LancamentoChuvasPage() {
  return (
    <div className="space-y-8">
      <PageHeader titulo="Lançamento de Chuvas" descricao="Registro manual de precipitação quando a estação falha" />
      <EmptyState
        title="Precipitação manual"
        description="Registro por fazenda/data de chuva medida em pluviômetro ou observada. Vira ground truth do balanço quando a estação não coleta. Disponível na Sprint 15."
      />
    </div>
  );
}
