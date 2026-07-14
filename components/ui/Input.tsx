import { cn } from "@/utils/cn";

export function Input({
  label,
  id,
  error,
  className,
  ...props
}: {
  label?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition-all duration-150",
          "border-gray-200 text-graphite-800 placeholder:text-gray-400",
          "focus:border-brand-400 focus:ring-2 focus:ring-brand-100",
          "dark:border-graphite-600 dark:bg-graphite-800 dark:text-gray-100 dark:placeholder:text-gray-500",
          "dark:focus:border-brand-500 dark:focus:ring-brand-900/30",
          error && "border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-500/60",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
