-- ============================================================================
-- Etapa H — Registro do evento real de irrigação
-- ----------------------------------------------------------------------------
-- Aditivo. Sem DROP. depth_mm = lâmina bruta aplicada.
-- Volume e horas seguem as fórmulas operacionais. Custo/energia (Etapa J)
-- continuam nulos neste passo.
-- ============================================================================

ALTER TABLE irrigation_events ADD COLUMN IF NOT EXISTS parcel_id UUID
  REFERENCES pivot_crop_assignments(id) ON DELETE SET NULL;
ALTER TABLE irrigation_events ADD COLUMN IF NOT EXISTS operating_hours DOUBLE PRECISION
  CHECK (operating_hours IS NULL OR operating_hours >= 0);

CREATE INDEX IF NOT EXISTS idx_events_parcel ON irrigation_events(parcel_id);

COMMENT ON COLUMN irrigation_events.depth_mm IS
  'Lâmina bruta aplicada (mm). Entra no balanço como I; I_ef = I × eficiência.';
COMMENT ON COLUMN irrigation_events.volume_m3 IS
  'Volume (m³) = lâmina mm × área ha × 10.';
COMMENT ON COLUMN irrigation_events.operating_hours IS
  'Tempo de operação (h). Auto: volume / vazão; o operador pode informar.';
COMMENT ON COLUMN irrigation_events.parcel_id IS
  'Parcela (ciclo) no momento do evento. NULL em registros legados.';
COMMENT ON COLUMN irrigation_events.notes IS
  'Observação operacional do evento.';
COMMENT ON COLUMN irrigation_events.cost IS
  'Custo do evento. Preenchido na Etapa J a partir deste registro.';
COMMENT ON COLUMN irrigation_events.energy_kwh IS
  'Energia do evento. Preenchida na Etapa J a partir deste registro.';
