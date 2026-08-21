-- ============================================================================
-- Etapa K — Relatórios de manejo e por parcela
-- ----------------------------------------------------------------------------
-- Aditivo. Sem DROP de dados. O CHECK ganha 'manejo' e 'por_parcela'.
-- 'executivo' permanece no CHECK para não invalidar histórico já gravado;
-- a UI deixa de gerar esse tipo.
-- ============================================================================

ALTER TABLE report_history DROP CONSTRAINT IF EXISTS report_history_report_type_check;

ALTER TABLE report_history ADD CONSTRAINT report_history_report_type_check
  CHECK (report_type IN (
    'manejo','diario','semanal','mensal','por_pivo','por_parcela','por_cultura','energetico','financeiro','executivo'
  ));

COMMENT ON COLUMN report_history.report_type IS
  'Tipos operacionais (Etapa K). Relatório executivo não é mais gerado na UI.';
