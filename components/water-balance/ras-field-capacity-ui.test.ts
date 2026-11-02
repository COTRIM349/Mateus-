import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panel = readFileSync(
  join(process.cwd(), "components/water-balance/SoilReservoirReferencePanel.tsx"),
  "utf8",
);

describe("RAS — referência à capacidade de campo sem falsa recomendação", () => {
  it("mantém CC como referência e separa déficit até CC de recomendação operacional", () => {
    expect(panel).toContain('label="Déficit até CC"');
    expect(panel).toContain("Referência para 100% da CC · não é recomendação");
    expect(panel).toContain("limite de manejo (AFD/CRA)");
    expect(panel).not.toContain('label="Irrigação recomendada"');
  });

  it("remove o balão Repor do gráfico", () => {
    expect(panel).not.toContain("Repor ");
    expect(panel).not.toContain("até CC do dia");
    expect(panel).not.toContain("hasReplacement");
  });
});
