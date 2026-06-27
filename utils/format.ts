import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "@/constants/app";

export function formatBRL(valor: number): string {
  return valor.toLocaleString(DEFAULT_LOCALE, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    maximumFractionDigits: 0,
  });
}

export function formatNumber(valor: number, casas = 0): string {
  return valor.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function formatPercent(valor: number, casas = 0): string {
  return `${formatNumber(valor, casas)}%`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(DEFAULT_LOCALE);
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(DEFAULT_LOCALE);
}
