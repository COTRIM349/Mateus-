-- ============================================================================
-- Ordens de Serviço — histórico
-- Armazena as OS de retirada de insumos processadas na tela /ordem-servico,
-- com a recomendação técnica gerada (mensagem de WhatsApp e avisos).
-- Farm-scoped, no padrão das demais tabelas operacionais.
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,

  -- Cabeçalho da OS (transcrito do documento)
  os_number             TEXT NOT NULL,
  os_date               DATE,
  team                  TEXT,
  production_period     TEXT,
  operation_code        TEXT,
  operation_description  TEXT,

  -- Local de aplicação, como impresso na OS
  os_farm_name          TEXT,
  pivot_label           TEXT,
  quadrant              TEXT,
  area                  DOUBLE PRECISION,

  -- OS normalizada completa (para reabrir com exatidão)
  order_data            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Parâmetros operacionais informados no momento da geração
  application_rate      DOUBLE PRECISION,
  tank_capacity         DOUBLE PRECISION,

  -- Saída gerada
  whatsapp_message      TEXT,
  warnings              JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_orders_farm ON service_orders(farm_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_recent ON service_orders(farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_orders_number ON service_orders(farm_id, os_number);

-- RLS: acesso pela fazenda (mesmo padrão das demais tabelas farm-scoped).
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_access_service_orders" ON service_orders
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

-- Mantém updated_at.
CREATE TRIGGER trg_service_orders_updated
  BEFORE UPDATE ON service_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE service_orders IS
  'Histórico de Ordens de Serviço processadas, com a recomendação técnica gerada.';
COMMENT ON COLUMN service_orders.os_farm_name IS
  'Nome da fazenda como impresso na OS (texto livre do documento), distinto de farm_id (fazenda do sistema).';
COMMENT ON COLUMN service_orders.order_data IS
  'OS normalizada completa (ServiceOrder) para reabrir a recomendação sem perda.';
