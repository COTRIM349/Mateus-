import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function LancamentoIrrigacaoPage() {
  return (
    <div className="space-y-8">
      <PageHeader titulo="Lançamento de Irrigação" descricao="Registro manual de lâmina aplicada por pivô/dia" />
      <EmptyState
        title="Lâmina aplicada"
        description="Boletim diário de irrigação por pivô: lâmina bruta, horas de operação, percentímetro efetivo. Alimenta o balanço hídrico como valor real. Disponível na Sprint 15."
      />
    </div>
  );
}
