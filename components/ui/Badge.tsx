import { cn } from "@/utils/cn";
import type { OperationalStatus, Priority } from "@/types/domain/pivot";

const statusConfig: Record<OperationalStatus, { label: string; className: string }> = {
  irrigando:  { label: "Irrigando",  className: "bg-brand-50 text-brand-700 ring-1 ring-brand-200/60 dark:bg-brand-900/20 dark:text-brand-400 dark:ring-brand-700/30" },
  parado:     { label: "Parado",     className: "bg-gray-50 text-graphite-500 ring-1 ring-gray-200/60 dark:bg-graphite-800 dark:text-gray-400 dark:ring-graphite-600/30" },
  manutencao: { label: "Manutenção", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-700/30" },
  alerta:     { label: "Alerta",     className: "bg-red-50 text-red-700 ring-1 ring-red-200/60 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-700/30" },
};

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  alta:  { label: "Alta",  className: "bg-red-50 text-red-700 ring-1 ring-red-200/60 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-700/30" },
  media: { label: "Média", className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-700/30" },
  baixa: { label: "Baixa", className: "bg-gray-50 text-graphite-500 ring-1 ring-gray-200/60 dark:bg-graphite-800 dark:text-gray-400 dark:ring-graphite-600/30" },
};

export function StatusBadge({ status }: { status: OperationalStatus }) {
  const { label, className: cls } = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium", cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, className: cls } = priorityConfig[priority];
  return (
    <span className={cn("inline-flex rounded-lg px-2.5 py-1 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}
