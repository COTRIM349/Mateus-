import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function CotrimAIPage() {
  return (
    <div>
      <PageHeader titulo="Cotrim AI" descricao="Inteligência artificial para manejo" />
      <EmptyState
        title="Cotrim AI"
        description="Recomendações automatizadas de irrigação, análise de risco e otimização de programação. Disponível na próxima sprint."
      />
    </div>
  );
}
