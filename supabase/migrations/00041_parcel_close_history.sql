-- ============================================================================
-- Etapa I — Encerramento da parcela e histórico
-- ----------------------------------------------------------------------------
-- Aditivo. Sem DROP. Encerrar NÃO apaga o ciclo nem reutiliza o registro.
-- Lançamentos novos exigem parcela ativa. Água do ciclo = soma dos eventos.
-- Custo/energia continuam nulos até a Etapa J.
-- ============================================================================

COMMENT ON COLUMN pivot_crop_assignments.closed_at IS
  'Data/hora de encerramento do ciclo. Obrigatória ao encerrar. Histórico permanente.';
COMMENT ON COLUMN pivot_crop_assignments.close_reason IS
  'Motivo do encerramento (colheita, falha, clima, decisão gerencial, outro).';
COMMENT ON COLUMN pivot_crop_assignments.total_water_applied_mm IS
  'Snapshot da lâmina bruta (mm) somada dos irrigation_events no encerramento. Não apagar.';
COMMENT ON COLUMN pivot_crop_assignments.total_energy_kwh IS
  'Energia do ciclo. Preenchida na Etapa J — não inventar tarifa no encerramento.';
COMMENT ON COLUMN pivot_crop_assignments.total_cost IS
  'Custo do ciclo. Preenchido na Etapa J a partir dos eventos reais.';

-- Impede apagar ou reutilizar parcela encerrada (nova cultura = novo registro).
CREATE OR REPLACE FUNCTION prevent_reuse_closed_parcel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('encerrada', 'cancelada') THEN
      RAISE EXCEPTION 'Parcela encerrada não pode ser apagada. O histórico é permanente.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('encerrada', 'cancelada') THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Parcela encerrada não pode ser reaberta. Crie um novo ciclo no pivô.';
    END IF;
    IF NEW.culture_id IS DISTINCT FROM OLD.culture_id
       OR NEW.pivot_id IS DISTINCT FROM OLD.pivot_id
       OR NEW.planting_date IS DISTINCT FROM OLD.planting_date THEN
      RAISE EXCEPTION 'Parcela encerrada não pode ser reutilizada para outra cultura. Crie um novo ciclo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_reuse_closed_parcel ON pivot_crop_assignments;
CREATE TRIGGER trg_prevent_reuse_closed_parcel
  BEFORE UPDATE OR DELETE ON pivot_crop_assignments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_reuse_closed_parcel();

-- Lançamento novo não entra em ciclo encerrado (parcel_id NULL = legado).
CREATE OR REPLACE FUNCTION require_active_parcel_for_launch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  st text;
BEGIN
  IF NEW.parcel_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status INTO st FROM pivot_crop_assignments WHERE id = NEW.parcel_id;
  IF st IS DISTINCT FROM 'ativa' THEN
    RAISE EXCEPTION 'Parcela encerrada: não é possível lançar neste ciclo. Abra um novo ciclo no pivô.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_irrigation_active_parcel ON irrigation_events;
CREATE TRIGGER trg_irrigation_active_parcel
  BEFORE INSERT ON irrigation_events
  FOR EACH ROW
  EXECUTE FUNCTION require_active_parcel_for_launch();

DROP TRIGGER IF EXISTS trg_sensory_active_parcel ON soil_sensory_readings;
CREATE TRIGGER trg_sensory_active_parcel
  BEFORE INSERT ON soil_sensory_readings
  FOR EACH ROW
  EXECUTE FUNCTION require_active_parcel_for_launch();

COMMENT ON FUNCTION prevent_reuse_closed_parcel() IS
  'Etapa I: histórico permanente — sem DELETE e sem reutilizar cultura/pivô/plantio.';
COMMENT ON FUNCTION require_active_parcel_for_launch() IS
  'Etapa I: irrigação e sensorial novos só em parcela ativa.';
