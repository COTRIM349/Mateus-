/**
 * Funções utilitárias de formatação no padrão brasileiro (pt-BR).
 */

/** Formata um valor numérico como moeda (R$). */
export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Formata um número com separador de milhar e casas decimais opcionais. */
export function formatNumber(valor: number, casas = 0): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Concatena classes condicionais (helper simples no estilo `clsx`). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
