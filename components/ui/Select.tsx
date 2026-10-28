import { cn } from "@/utils/cn";

export function Select({
  label,
  id,
  error,
  options,
  className,
  ...props
}: {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-[15px] font-semibold tracking-wide text-graphite-600 dark:text-gray-400">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          "w-full rounded-xl border bg-white px-4 py-3 text-[16px] outline-none transition-all duration-150",
          "border-gray-200 text-graphite-800",
          "focus:border-santa-500 focus:ring-2 focus:ring-santa-100",
          "dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100",
          "dark:focus:border-santa-400/50 dark:focus:bg-white/[0.06] dark:focus:ring-santa-800/30",
          error && "border-red-300 dark:border-red-500/60",
          className,
        )}
        {...props}
      >
        <option value="">Selecione...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
