import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ReservatoriosPage() {
  return (
    <div className="space-y-8">
      <PageHeader titulo="Reservatórios" descricao="Níveis, autonomia e recarga" />
      <EmptyState
        title="Reservatórios"
        description="Monitoramento de reservatórios com nível atual, autonomia estimada e taxa de recarga. Disponível na próxima sprint."
      />
    </div>
  );
}
