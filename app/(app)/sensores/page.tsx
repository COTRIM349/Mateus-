import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function SensoresPage() {
  return (
    <div>
      <PageHeader titulo="Sensores" descricao="Dispositivos IoT e leituras" />
      <EmptyState
        title="Sensores"
        description="Listagem de sensores com status, últimas leituras e histórico. Disponível na próxima sprint."
      />
    </div>
  );
}
