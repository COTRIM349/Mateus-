-- ============================================================================
-- Mapa Vision — desenhos geográficos + amostras de umidade orbital
-- Sem telemetria. Aditivo: não apaga dados operacionais.
-- ============================================================================

CREATE TABLE IF NOT EXISTS map_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'talhao','canal','cerca','estrada','reservatorio','anotacao'
  )),
  geometry JSONB NOT NULL,
  color TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE map_drawings IS
  'Geometrias desenhadas no Mapa Vision (talhão, canal, cerca, estrada, reservatório, anotação). GeoJSON em geometry. Não substitui a ficha do pivô.';
COMMENT ON COLUMN map_drawings.geometry IS
  'GeoJSON Geometry: Polygon, LineString ou Point. Coordenadas [lng, lat] WGS84.';

CREATE INDEX IF NOT EXISTS idx_map_drawings_farm ON map_drawings(farm_id);
CREATE INDEX IF NOT EXISTS idx_map_drawings_kind ON map_drawings(farm_id, kind);

ALTER TABLE map_drawings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_access_map_drawings ON map_drawings;
CREATE POLICY farm_access_map_drawings ON map_drawings
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));

CREATE TABLE IF NOT EXISTS orbital_moisture_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pivot_id UUID REFERENCES pivots(id) ON DELETE CASCADE,
  sampled_at DATE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  moisture_0_7 DOUBLE PRECISION,
  moisture_7_28 DOUBLE PRECISION,
  moisture_28_100 DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'open_meteo_soil',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pivot_id, sampled_at, source)
);

COMMENT ON TABLE orbital_moisture_samples IS
  'Umidade de superfície por modelo orbital/reanálise (Open-Meteo solo). m³/m³. Não substitui ARM/FAO-56 nem sensor de campo.';
COMMENT ON COLUMN orbital_moisture_samples.moisture_0_7 IS
  'Umidade volumétrica 0–7 cm (m³/m³). NULL = fonte sem dado.';
COMMENT ON COLUMN orbital_moisture_samples.moisture_7_28 IS
  'Umidade volumétrica 7–28 cm (m³/m³).';
COMMENT ON COLUMN orbital_moisture_samples.moisture_28_100 IS
  'Umidade volumétrica 28–100 cm (m³/m³).';

CREATE INDEX IF NOT EXISTS idx_orbital_moisture_farm_date
  ON orbital_moisture_samples(farm_id, sampled_at DESC);

ALTER TABLE orbital_moisture_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_access_orbital_moisture ON orbital_moisture_samples;
CREATE POLICY farm_access_orbital_moisture ON orbital_moisture_samples
  FOR ALL USING (farm_id IN (SELECT auth_farm_ids()));
