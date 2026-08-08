import type { ClimateCondition } from "@/modules/weather/dashboard/climateDashboard";

export function ClimateWeatherIcon({
  condition,
  size = 56,
}: {
  condition: ClimateCondition;
  size?: number;
}) {
  if (condition === "unknown") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" fill="none">
        <path d="M17 43a11 11 0 0 1 1-21.9A15 15 0 0 1 46.5 26 9 9 0 0 1 46 44H17Z" className="fill-slate-200 dark:fill-slate-600" />
        <path d="M25 51h14" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (condition === "rain") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" fill="none">
        <path d="M18 39a11 11 0 0 1 1-21.9A15 15 0 0 1 47.5 22 9 9 0 0 1 47 40H18Z" className="fill-slate-300 dark:fill-slate-500" />
        <path d="m22 47-2 6m13-6-2 6m13-6-2 6" className="stroke-blue-500" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  if (condition === "partly_cloudy") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" fill="none">
        <circle cx="24" cy="23" r="12" className="fill-amber-400" />
        <path d="M17 45a10 10 0 0 1 .8-19.9A14 14 0 0 1 44.4 30 8 8 0 0 1 44 46H17Z" className="fill-slate-200 dark:fill-slate-500" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="14" className="fill-amber-400" />
      <path d="M32 6v8m0 36v8M6 32h8m36 0h8M13.5 13.5l5.7 5.7m25.6 25.6 5.7 5.7m-37 0 5.7-5.7m25.6-25.6 5.7-5.7" className="stroke-amber-400" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
