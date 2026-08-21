import { describe, expect, it } from "vitest";
import {
  CLOSED_PARCEL_NO_LAUNCH,
  NO_ACTIVE_PARCEL_LAUNCH,
  assertParcelAcceptsOperationalLaunch,
  buildParcelClosePayload,
  buildParcelInsertRow,
  canDeleteParcel,
  canMutateParcelRecord,
  canReuseParcel,
  closeDateToIso,
  findBlockingActiveParcel,
  isActiveParcel,
  isHistoricParcel,
  snapshotCycleWater,
  suggestParcelName,
  validateParcelClose,
  validateParcelCycle,
  validatePlantedArea,
  type ParcelCycleDraft,
} from "./parcel-cycle";

function draft(overrides: Partial<ParcelCycleDraft> = {}): ParcelCycleDraft {
  return {
    name: "Pivô 31 · Soja · 2026/27",
    plantedArea: 80,
    pivotId: "pivot-31",
    pivotArea: 86,
    pivotSoilId: "soil-1",
    seasonId: "season-1",
    cultureId: "soy",
    cultureVarietyId: "tmg",
    plantingDate: "2026-10-15",
    emergenceDate: "2026-10-22",
    expectedHarvestDate: "2027-02-20",
    klOverride: null,
    notes: null,
    existingOnPivot: [],
    editingId: null,
    ...overrides,
  };
}

describe("ciclo da parcela", () => {
  it("parcela encerrada não pode ser reutilizada", () => {
    expect(canReuseParcel("encerrada")).toBe(false);
    expect(canReuseParcel("cancelada")).toBe(false);
    expect(canReuseParcel("ativa")).toBe(true);
  });

  it("classifica ativa vs histórico, inclusive legado só com active", () => {
    expect(isActiveParcel("ativa", true)).toBe(true);
    expect(isHistoricParcel("encerrada", false)).toBe(true);
    expect(isActiveParcel(null, true)).toBe(true);
    expect(isHistoricParcel(null, false)).toBe(true);
  });

  it("bloqueia segunda parcela ativa no mesmo pivô", () => {
    const blocking = findBlockingActiveParcel(
      [{ id: "old", pivot_id: "pivot-31", status: "ativa", active: true }],
      "pivot-31",
    );
    expect(blocking?.id).toBe("old");
    expect(
      findBlockingActiveParcel(
        [{ id: "old", pivot_id: "pivot-31", status: "encerrada", active: false }],
        "pivot-31",
      ),
    ).toBeUndefined();
  });
});

describe("validatePlantedArea", () => {
  it("aceita área menor ou igual à do pivô", () => {
    expect(validatePlantedArea(80, 86)).toBeNull();
    expect(validatePlantedArea(86, 86)).toBeNull();
    expect(validatePlantedArea(null, 86)).toBeNull();
  });

  it("rejeita área maior que a do pivô", () => {
    expect(validatePlantedArea(90, 86)).toMatch(/não pode ser maior/);
  });
});

describe("validateParcelCycle", () => {
  it("exige pivô, safra, cultura, solo do pivô e plantio", () => {
    expect(validateParcelCycle(draft({ pivotId: "" }))).toMatch(/pivô/);
    expect(validateParcelCycle(draft({ seasonId: "" }))).toMatch(/safra/);
    expect(validateParcelCycle(draft({ cultureId: "" }))).toMatch(/cultura/);
    expect(validateParcelCycle(draft({ pivotSoilId: null }))).toMatch(/solo/);
    expect(validateParcelCycle(draft({ plantingDate: "" }))).toMatch(/plantio/);
  });

  it("impede novo ciclo enquanto houver parcela ativa no pivô", () => {
    const error = validateParcelCycle(
      draft({
        existingOnPivot: [{ id: "old", pivot_id: "pivot-31", status: "ativa" }],
      }),
    );
    expect(error).toMatch(/Já existe parcela ativa/);
  });

  it("permite novo ciclo depois de encerrar", () => {
    expect(
      validateParcelCycle(
        draft({
          existingOnPivot: [{ id: "old", pivot_id: "pivot-31", status: "encerrada", active: false }],
        }),
      ),
    ).toBeNull();
  });
});

describe("buildParcelInsertRow", () => {
  it("cria ciclo ativo com solo do pivô e sem reutilizar id", () => {
    const row = buildParcelInsertRow(draft());
    expect(row.status).toBe("ativa");
    expect(row.active).toBe(true);
    expect(row.soil_id).toBe("soil-1");
    expect(row.culture_id).toBe("soy");
    expect(row).not.toHaveProperty("id");
  });
});

describe("buildParcelClosePayload", () => {
  it("encerra sem apagar: status histórico e active false", () => {
    const payload = buildParcelClosePayload({
      closeReason: "colheita",
      closeNote: "safra encerrada",
      yieldKgHa: 4200,
      closedAt: "2027-03-01T12:00:00.000Z",
      totalWaterAppliedMm: 187,
    });
    expect(payload.status).toBe("encerrada");
    expect(payload.active).toBe(false);
    expect(payload.close_reason).toBe("colheita");
    expect(payload.yield_kg_ha).toBe(4200);
    expect(payload.closed_at).toBe("2027-03-01T12:00:00.000Z");
    expect(payload.total_water_applied_mm).toBe(187);
    expect(payload.total_energy_kwh).toBeNull();
    expect(payload.total_cost).toBeNull();
  });
});

describe("encerramento e bloqueio de lançamento (Etapa I)", () => {
  it("exige data, motivo e parcela ativa", () => {
    expect(
      validateParcelClose({
        currentStatus: "ativa",
        closeReason: "colheita",
        closedAtYmd: "2027-02-20",
        plantingDate: "2026-10-15",
      }),
    ).toBeNull();
    expect(
      validateParcelClose({
        currentStatus: "encerrada",
        currentActive: false,
        closeReason: "colheita",
        closedAtYmd: "2027-02-20",
      }),
    ).toMatch(/ativa/);
    expect(
      validateParcelClose({
        currentStatus: "ativa",
        closeReason: "colheita",
        closedAtYmd: "",
      }),
    ).toMatch(/data/);
    expect(
      validateParcelClose({
        currentStatus: "ativa",
        closeReason: "colheita",
        closedAtYmd: "2026-09-01",
        plantingDate: "2026-10-15",
      }),
    ).toMatch(/anterior ao plantio/);
    expect(closeDateToIso("2027-02-20")).toBe("2027-02-20T12:00:00.000Z");
  });

  it("bloqueia lançamento no ciclo encerrado e exige parcela ativa", () => {
    expect(assertParcelAcceptsOperationalLaunch({ status: "ativa", active: true })).toBeNull();
    expect(assertParcelAcceptsOperationalLaunch({ status: "encerrada", active: false })).toBe(CLOSED_PARCEL_NO_LAUNCH);
    expect(assertParcelAcceptsOperationalLaunch(null)).toBe(NO_ACTIVE_PARCEL_LAUNCH);
    expect(canMutateParcelRecord("encerrada", false)).toBe(false);
    expect(canDeleteParcel("encerrada", false)).toBe(false);
    expect(canReuseParcel("encerrada")).toBe(false);
  });

  it("snapshot de água soma eventos e não inventa tarifa", () => {
    const snap = snapshotCycleWater([
      { depth_mm: 10, volume_m3: 8000 },
      { depth_mm: 5, volume_m3: 4000 },
    ]);
    expect(snap.total_water_applied_mm).toBe(15);
    expect(snap.total_volume_m3).toBe(12000);
    expect(snap.irrigation_count).toBe(2);
  });

  it("depois de encerrar, o pivô aceita novo ciclo", () => {
    expect(
      validateParcelCycle(
        draft({
          existingOnPivot: [{ id: "old", pivot_id: "pivot-31", status: "encerrada", active: false }],
        }),
      ),
    ).toBeNull();
  });
});

describe("suggestParcelName", () => {
  it("compõe nome operacional", () => {
    expect(suggestParcelName("Pivô 31", "Soja", "2026/27")).toBe("Pivô 31 · Soja · 2026/27");
  });
});
