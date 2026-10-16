/**
 * Erro do PostgREST (Supabase) quando a tabela não existe no schema cache —
 * tipicamente uma migration ainda não aplicada no banco. Código `PGRST205`.
 *
 * Use APENAS para degradar recursos OPCIONAIS com segurança (ex.: ETo manual,
 * chuva manual), nunca para tabelas essenciais: uma tabela de núcleo ausente
 * deve continuar falhando de forma visível.
 */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === "PGRST205") return true;
  return typeof e.message === "string" && /could not find the table/i.test(e.message);
}
