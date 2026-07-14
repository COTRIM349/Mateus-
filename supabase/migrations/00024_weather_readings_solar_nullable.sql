-- ============================================================================
-- Migration 00024: tornar solar_radiation nullable em weather_readings
-- ============================================================================
-- meteoblue (plano básico) não fornece radiação solar. Para permitir
-- ingestão sem valor fictício, a coluna precisa aceitar NULL.
-- Dados existentes com solar_radiation=0 permanecem inalterados.
-- ============================================================================

ALTER TABLE weather_readings
  ALTER COLUMN solar_radiation DROP NOT NULL;
