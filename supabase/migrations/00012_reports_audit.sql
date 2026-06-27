-- Sprint 11: Relatórios Inteligentes — Audit Log
-- ===================================================

-- ── Audit log table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  user_name     TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL CHECK (action IN ('create','update','delete','export','generate','approve','reject','login','logout')),
  entity_type   TEXT NOT NULL,
  entity_id     UUID,
  entity_name   TEXT DEFAULT '',
  changes       JSONB DEFAULT '{}',
  metadata      JSONB DEFAULT '{}',
  ip_address    TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_farm ON audit_log(farm_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (farm_id IN (SELECT unnest(auth_farm_ids())));

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (farm_id IN (SELECT unnest(auth_farm_ids())));

-- ── Report history table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_history (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  user_name     TEXT NOT NULL DEFAULT '',
  report_type   TEXT NOT NULL CHECK (report_type IN ('diario','semanal','mensal','por_pivo','por_cultura','energetico','financeiro','executivo')),
  report_name   TEXT NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  parameters    JSONB DEFAULT '{}',
  format        TEXT NOT NULL CHECK (format IN ('pdf','xlsx','csv')),
  status        TEXT NOT NULL DEFAULT 'gerado' CHECK (status IN ('gerando','gerado','erro','expirado')),
  file_size_kb  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_report_history_farm ON report_history(farm_id);
CREATE INDEX idx_report_history_type ON report_history(report_type);
CREATE INDEX idx_report_history_created ON report_history(created_at DESC);

ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_history_select ON report_history
  FOR SELECT USING (farm_id IN (SELECT unnest(auth_farm_ids())));

CREATE POLICY report_history_insert ON report_history
  FOR INSERT WITH CHECK (farm_id IN (SELECT unnest(auth_farm_ids())));
