import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function BalancoHidricoPage() {
  return (
    <div>
      <PageHeader titulo="Balanço Hídrico" descricao="Acompanhamento diário de déficit e armazenamento" />
      <EmptyState
        title="Balanço Hídrico"
        description="Tabela diária por pivô com ETc, precipitação, irrigação, déficit acumulado e recomendação. Disponível na próxima sprint."
      />
    </div>
  );
}
