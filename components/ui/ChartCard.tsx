import { Card } from "./Card";

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-5">
        <h3 className="text-[13px] font-bold tracking-tight text-graphite-800 dark:text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-graphite-400 dark:text-gray-500">{subtitle}</p>}
      </div>
      <div className="h-64 w-full">{children}</div>
    </Card>
  );
}
