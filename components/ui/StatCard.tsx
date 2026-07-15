import { Card } from "./Card";
import { cn } from "@/utils/cn";

interface StatMetric {
  id: string;
  title: string;
  value: string;
  description?: string;
  variation?: string;
  trend?: "positive" | "negative" | "neutral";
}

const trendClass: Record<NonNullable<StatMetric["trend"]>, string> = {
  positive: "text-brand-600 dark:text-brand-400",
  negative: "text-red-500 dark:text-red-400",
  neutral: "text-graphite-400 dark:text-gray-500",
};

export function StatCard({ metric }: { metric: StatMetric }) {
  return (
    <Card className="group relative overflow-hidden p-5 transition-colors duration-200 hover:border-gray-200 dark:hover:border-white/[0.1]">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-500 via-brand-400/50 to-transparent" />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">{metric.title}</p>
      <p className="mt-2 text-[26px] font-extrabold leading-none tracking-tight text-graphite-900 tabular-nums dark:text-white">{metric.value}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-graphite-400 dark:text-gray-500">{metric.description}</span>
        {metric.variation && (
          <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", trendClass[metric.trend ?? "neutral"])}>
            {metric.variation}
          </span>
        )}
      </div>
    </Card>
  );
}
