-- Atualiza a semântica do quality gate climático diário.
-- A flag operational_approved é definida pelo resolver automático quando a
-- leitura passa por qualidade, faixa física e origem confiável. Intervenção
-- humana continua possível para exceções, mas não é exigida todo dia.

COMMENT ON COLUMN weather_daily_selection.operational_approved IS
  'Quality gate operacional diário: true quando a leitura selecionada passa automaticamente pelas regras de qualidade/origem ou por revisão autorizada; não exige clique manual diário.';
