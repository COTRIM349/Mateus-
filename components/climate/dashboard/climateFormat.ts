import type { ClimateCondition } from "@/modules/weather/dashboard/climateDashboard";

export function formatNumber(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function conditionLabel(condition: ClimateCondition): string {
  if (condition === "unknown") return "Condição indisponível";
  if (condition === "rain") return "Chuva";
  if (condition === "partly_cloudy") return "Parcialmente nublado";
  return "Céu aberto";
}

export function formatRelativeUpdate(timestamp: string | null): string {
  if (!timestamp) return "Atualização indisponível";
  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000),
  );
  if (elapsedMinutes < 1) return "Atualizado agora";
  if (elapsedMinutes < 60) return `Atualizado há ${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `Atualizado há ${hours} h`;
  return `Atualizado em ${new Date(timestamp).toLocaleDateString("pt-BR")}`;
}

export function weekdayLabel(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
  }).replace(".", "");
}
