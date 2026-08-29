import Link from "next/link";
import { Card } from "@/components/ui";
import type { BalanceReadinessResult } from "@/modules/water-balance/services";

const LEVEL_STYLES = {
  ok: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
} as const;

const LEVEL_DOT = {
  ok: "bg-green-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
} as const;

export function BalanceReadinessPanel({
  result,
  loading,
}: {
  result: BalanceReadinessResult | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-sm text-graphite-400 dark:text-gray-500">Verificando prontidão do balanço…</p>
      </Card>
    );
  }

  if (!result) return null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-graphite-400 dark:text-gray-500">
            Prontidão operacional
          </p>
          <p className="mt-1 text-sm font-semibold text-graphite-900 dark:text-white">
            {result.ready
              ? "Pronto para calcular o balanço"
              : `${result.blockingCount} pendência(s) bloqueando o cálculo`}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${result.ready ? LEVEL_STYLES.ok : LEVEL_STYLES.error}`}
        >
          {result.ready ? "Validado" : "Incompleto"}
        </span>
      </div>
      <ul className="mt-4 space-y-2">
        {result.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-2.5 dark:border-white/[0.06]"
          >
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[item.level]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-graphite-800 dark:text-white">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-graphite-500 dark:text-gray-400">{item.detail}</p>
            </div>
            {item.href && item.level !== "ok" && (
              <Link
                href={item.href}
                className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Resolver
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
