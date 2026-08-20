import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default function LancamentoSensorialSoloPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Sensorial de Solo"
        descricao="Método tátil de avaliação da umidade — escala nota 1-9 por camada (USDA-NRCS · Embrapa)"
      />
      <EmptyState
        title="Método sensorial em construção"
        description="Cadastro por pivô + até 3 camadas com notas 1.0-9.0 (com conversão automática para % da CC). Escala oficial no banco (soil_sensory_scale). UI em desenvolvimento — Sprint 14 · Etapa 6."
      />
    </div>
  );
}
