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
        <label htmlFor={id} className="block text-sm font-medium text-graphite-900">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-sm text-graphite-900 outline-none transition-colors",
          "border-gray-200 bg-gray-50 placeholder:text-gray-400",
          "focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100",
          error && "border-red-400 focus:border-red-400 focus:ring-red-100",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
