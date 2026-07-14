import { cn } from "@/utils/cn";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white p-6 shadow-card dark:border-graphite-700/50 dark:bg-graphite-900 dark:shadow-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
