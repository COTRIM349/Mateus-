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
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-graphite-900 dark:text-gray-200">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors",
          "border-gray-200 bg-gray-50 text-graphite-900 placeholder:text-gray-400",
          "focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100",
          "dark:border-graphite-600 dark:bg-graphite-800 dark:text-gray-100 dark:placeholder:text-gray-500",
          "dark:focus:border-brand-500 dark:focus:bg-graphite-800 dark:focus:ring-brand-900/30",
          error && "border-red-400 focus:border-red-400 focus:ring-red-100 dark:border-red-500",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
