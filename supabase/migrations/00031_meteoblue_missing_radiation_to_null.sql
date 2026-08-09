-- Meteoblue basic-day não fornece radiação solar. Os zeros legados eram
-- sentinelas de ausência e não medições reais; normalize-os para NULL.
UPDATE weather_readings
SET solar_radiation = NULL
WHERE origin = 'meteoblue'
  AND solar_radiation = 0;
