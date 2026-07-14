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
    <Card className="relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand-500/60 to-brand-400/20" />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">{metric.title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-graphite-900 dark:text-white">{metric.value}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-graphite-400 dark:text-gray-500">{metric.description}</span>
        {metric.variation && (
          <span className={cn("text-[11px] font-semibold", trendClass[metric.trend ?? "neutral"])}>
            {metric.variation}
          </span>
        )}
      </div>
    </Card>
  );
}
