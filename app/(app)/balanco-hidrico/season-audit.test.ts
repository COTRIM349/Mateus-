import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "app/(app)/balanco-hidrico/page.tsx"), "utf8",
);
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("Decisão e Monitoramento — auditoria de toda a safra", () => {
  it("usa a série integral do motor para a safra, independente do filtro dos gráficos", () => {
    expect(source).toContain("const allSeasonRows: DailyBalanceRow[] = series.map(mapBalanceDay)");
    expect(source).toContain("allSeasonRows.filter((row) => row.date >= dateStart)");
    expect(source).toContain("setSeasonRows(allSeasonRows)");
    expect(source).toContain("const seasonSummary = useMemo(() => calculateSummary(seasonRows)");
    expect(source).toContain('panel="auditoria"');
    expect(source).toContain("rows={seasonRows}");
    expect(source).toContain("summary={seasonSummary}");
  });

  it("preserva os gráficos de Dados e não exibe a tabela nessa aba", () => {
    const dados = source.split('{activeTab === "dados"')[1]?.split('{activeTab === "decisao"')[0] ?? "";
    expect(dados).toContain("<Cockpit");
    expect(dados).toContain('mode="dados"');
    expect(dados).toContain("rows={balanceRows}");
    expect(dados).not.toContain("<BalanceTab");
    expect(dados).not.toContain('panel="auditoria"');
    expect(dados).not.toContain("Tabela detalhada do balanço");
  });

  it("mantém todos os campos, filtros, CSV e impressão somente em monitoramento", () => {
    expect(source).toContain('{ id: "decisao", label: "Decisão e Monitoramento" }');
    expect(source).toContain('if (panel === "auditoria")');
    expect(source).toContain("columns={columns} data={filteredRows}");
    expect(source).toContain("onClick={exportCsv}");
    expect(source).toContain("onClick={() => window.print()}");
    expect(source).toContain("Os dias anteriores à condição inicial do balanço não são estimados");
    expect(css).toContain(".season-audit-table th");
  });
});
