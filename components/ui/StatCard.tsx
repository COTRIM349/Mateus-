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
    <Card className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{metric.title}</p>
      <p className="text-3xl font-bold tracking-tight text-graphite-900 dark:text-white">{metric.value}</p>
      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-xs text-graphite-400 dark:text-gray-500">{metric.description}</span>
        {metric.variation && (
          <span className={cn("text-xs font-semibold", trendClass[metric.trend ?? "neutral"])}>
            {metric.variation}
          </span>
        )}
      </div>
    </Card>
  );
}
