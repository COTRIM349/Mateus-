import { Card } from "./Card";
import { cn } from "@/utils/cn";
import type { DashboardMetric } from "@/modules/dashboard/services";

const trendClass: Record<NonNullable<DashboardMetric["trend"]>, string> = {
  positive: "text-brand-600",
  negative: "text-red-600",
  neutral: "text-gray-500",
};

export function StatCard({ metric }: { metric: DashboardMetric }) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-500">{metric.title}</p>
      <p className="text-2xl font-bold text-graphite-900">{metric.value}</p>
      <div className="mt-auto flex items-center justify-between">
        <span className="text-xs text-gray-400">{metric.description}</span>
        {metric.variation && (
          <span className={cn("text-xs font-semibold", trendClass[metric.trend ?? "neutral"])}>
            {metric.variation}
          </span>
        )}
      </div>
    </Card>
  );
}
