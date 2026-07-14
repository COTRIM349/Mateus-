import { cn } from "@/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white shadow-soft hover:bg-brand-700 active:bg-brand-800 dark:bg-brand-500 dark:hover:bg-brand-600",
  secondary:
    "border border-gray-200 bg-white text-graphite-700 shadow-soft hover:bg-gray-50 active:bg-gray-100 dark:border-graphite-600 dark:bg-graphite-800 dark:text-gray-200 dark:hover:bg-graphite-700",
  ghost:
    "text-graphite-500 hover:bg-gray-100 hover:text-graphite-800 dark:text-gray-400 dark:hover:bg-graphite-800 dark:hover:text-gray-200",
  danger:
    "bg-red-600 text-white shadow-soft hover:bg-red-700 active:bg-red-800",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-xs gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-sm gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 dark:focus-visible:ring-offset-graphite-900",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
