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
  negative: "text-red-600 dark:text-red-400",
  neutral: "text-gray-500 dark:text-gray-400",
};

export function StatCard({ metric }: { metric: StatMetric }) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{metric.title}</p>
      <p className="text-2xl font-bold text-graphite-900 dark:text-white">{metric.value}</p>
      <div className="mt-auto flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">{metric.description}</span>
        {metric.variation && (
          <span className={cn("text-xs font-semibold", trendClass[metric.trend ?? "neutral"])}>
            {metric.variation}
          </span>
        )}
      </div>
    </Card>
  );
}
