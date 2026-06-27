import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ProgramacaoPage() {
  return (
    <div>
      <PageHeader titulo="Programação" descricao="Agenda de irrigação e calendário operacional" />
      <EmptyState
        title="Programação"
        description="Planejamento e execução de irrigação com calendário, status de execução e histórico. Disponível na próxima sprint."
      />
    </div>
  );
}
