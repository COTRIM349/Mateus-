import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SantaColombaAIPage() {
  return (
    <div className="space-y-8">
      <PageHeader titulo="Santa Colomba AI" descricao="Inteligência artificial para manejo" />
      <EmptyState
        title="Santa Colomba AI"
        description="Recomendações automatizadas de irrigação, análise de risco e otimização de programação. Disponível na próxima sprint."
      />
    </div>
  );
}
