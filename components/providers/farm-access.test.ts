import { describe, expect, it } from "vitest";
import {
  DEFAULT_FARM_TIMEZONE,
  buildOperationalFarmAccess,
  selectInitialFarmId,
  type FarmAccessRow,
} from "./farm-access";

function row(overrides: Partial<NonNullable<FarmAccessRow["farms"]>> = {}): FarmAccessRow {
  return {
    is_default: false,
    farms: {
      id: "farm-1",
      name: "Karitel",
      timezone: "America/Bahia",
      active: true,
      latitude: -14.775966667,
      longitude: -45.566452778,
      ...overrides,
    },
  };
}

describe("buildOperationalFarmAccess", () => {
  it("mantém somente fazendas ativas com coordenadas válidas", () => {
    const access = buildOperationalFarmAccess([
      row(),
      row({ id: "inactive", active: false }),
      row({ id: "invalid-dms", latitude: 143856.75, longitude: 45142.49 }),
    ]);

    expect(access.map((farm) => farm.id)).toEqual(["farm-1"]);
  });

  it("aplica timezone seguro quando o cadastro não informa um", () => {
    const access = buildOperationalFarmAccess([row({ timezone: null })]);
    expect(access[0]?.timezone).toBe(DEFAULT_FARM_TIMEZONE);
  });
});

describe("selectInitialFarmId", () => {
  const farms = [
    { id: "a", name: "A", timezone: "America/Bahia", isDefault: false },
    { id: "b", name: "B", timezone: "America/Bahia", isDefault: true },
  ];

  it("restaura somente uma seleção ainda operacional", () => {
    expect(selectInitialFarmId(farms, "a")).toBe("a");
    expect(selectInitialFarmId(farms, "farm-inativa")).toBe("b");
  });

  it("usa a primeira fazenda quando não existe padrão e retorna null sem acesso", () => {
    expect(selectInitialFarmId([{ ...farms[0], isDefault: false }], null)).toBe("a");
    expect(selectInitialFarmId([], null)).toBeNull();
  });
});
