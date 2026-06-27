import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AlertasPage() {
  return (
    <div>
      <PageHeader titulo="Alertas" descricao="Notificações e ações pendentes" />
      <EmptyState
        title="Alertas"
        description="Painel de alertas com severidade, categoria e ações de reconhecimento. Disponível na próxima sprint."
      />
    </div>
  );
}
