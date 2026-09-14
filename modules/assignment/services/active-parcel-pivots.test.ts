import { describe, expect, it } from "vitest";
import {
  activeParcelPivotIds,
  filterPivotsWithActiveParcel,
  type ActiveParcelPivotLink,
} from "./active-parcel-pivots";

describe("pivôs elegíveis para o balanço hídrico", () => {
  it("mantém apenas vínculo explicitamente ativo em manejo", () => {
    const rows: ActiveParcelPivotLink[] = [
      { pivot_id: "pv-01", active: true, status: "ativa" },
      { pivot_id: "pv-legado", active: true, status: null },
      { pivot_id: "pv-encerrado", active: false, status: "encerrada" },
      { pivot_id: "pv-inconsistente", active: true, status: "encerrada" },
      { pivot_id: null, active: true, status: "ativa" },
    ];

    expect([...activeParcelPivotIds(rows)]).toEqual(["pv-01", "pv-legado"]);
  });

  it("remove duplicidade de parcelas e preserva a ordem dos pivôs", () => {
    const pivots = [
      { id: "pv-03", name: "PV 03" },
      { id: "pv-01", name: "PV 01" },
      { id: "pv-02", name: "PV 02" },
    ];
    const assignments: ActiveParcelPivotLink[] = [
      { pivot_id: "pv-01", active: true, status: "ativa" },
      { pivot_id: "pv-01", active: true, status: null },
      { pivot_id: "pv-03", active: false, status: "encerrada" },
    ];

    expect(filterPivotsWithActiveParcel(pivots, assignments).map((pivot) => pivot.id)).toEqual(["pv-01"]);
  });
});
