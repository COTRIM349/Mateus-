import { cn } from "@/utils/cn";

export function TextArea({
  label,
  id,
  error,
  className,
  ...props
}: {
  label?: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-[13px] font-semibold tracking-wide text-graphite-600 dark:text-gray-400">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          "w-full rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition-all duration-150",
          "border-gray-200 text-graphite-800 placeholder:text-gray-400",
          "focus:border-santa-500 focus:ring-2 focus:ring-santa-100",
          "dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-500",
          "dark:focus:border-santa-400/50 dark:focus:bg-white/[0.06] dark:focus:ring-santa-800/30",
          error && "border-red-300 dark:border-red-500/60",
          className,
        )}
        rows={3}
        {...props}
      />
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}
