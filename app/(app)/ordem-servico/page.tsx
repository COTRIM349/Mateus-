import { PageHeader } from "@/components/layout/PageHeader";
import { OrdemServicoClient } from "./OrdemServicoClient";

export default function OrdemServicoPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Ordem de Serviço"
        descricao="Leia o PDF do TOTVS, confira os dados e gere a recomendação técnica para o WhatsApp"
      />
      <OrdemServicoClient />
    </div>
  );
}
