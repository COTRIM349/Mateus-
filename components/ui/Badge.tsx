import { cn } from "@/utils/cn";
import type { OperationalStatus, Priority } from "@/types/domain/pivot";

const statusConfig: Record<OperationalStatus, { label: string; className: string }> = {
  irrigando:  { label: "Irrigando",  className: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400" },
  parado:     { label: "Parado",     className: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
  manutencao: { label: "Manutenção", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  alerta:     { label: "Alerta",     className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  alta:  { label: "Alta",  className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  media: { label: "Média", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
  baixa: { label: "Baixa", className: "bg-gray-100 text-gray-600 dark:bg-graphite-700 dark:text-gray-400" },
};

export function StatusBadge({ status }: { status: OperationalStatus }) {
  const { label, className: cls } = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, className: cls } = priorityConfig[priority];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}
