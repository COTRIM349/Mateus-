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
        "rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-graphite-700 dark:bg-graphite-900",
        className,
      )}
    >
      {children}
    </div>
  );
}
