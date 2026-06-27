import { cn } from "@/lib/format";
import type { Prioridade, StatusOperacional } from "@/lib/types";

/** Rótulos e cores para cada status operacional. */
const statusMap: Record<StatusOperacional, { label: string; classe: string }> = {
  irrigando: { label: "Irrigando", classe: "bg-brand-100 text-brand-700" },
  parado: { label: "Parado", classe: "bg-gray-100 text-gray-600" },
  manutencao: { label: "Manutenção", classe: "bg-amber-100 text-amber-700" },
  alerta: { label: "Alerta", classe: "bg-red-100 text-red-700" },
};

/** Rótulos e cores para cada nível de prioridade. */
const prioridadeMap: Record<Prioridade, { label: string; classe: string }> = {
  alta: { label: "Alta", classe: "bg-red-100 text-red-700" },
  media: { label: "Média", classe: "bg-amber-100 text-amber-700" },
  baixa: { label: "Baixa", classe: "bg-gray-100 text-gray-600" },
};

/** Badge de status operacional. */
export function StatusBadge({ status }: { status: StatusOperacional }) {
  const { label, classe } = statusMap[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", classe)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/** Badge de prioridade. */
export function PrioridadeBadge({ prioridade }: { prioridade: Prioridade }) {
  const { label, classe } = prioridadeMap[prioridade];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", classe)}>
      {label}
    </span>
  );
}
