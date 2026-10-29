import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const page = read("app/(app)/balanco-hidrico/page.tsx");
const css = read("app/globals.css");
const panel = read("components/water-balance/DecisionMonitoringReferenceLayout.tsx");
const navigation = read("components/layout/TopNavigation.tsx");

describe("Decisão e Monitoramento — navegação padrão e identidade verde", () => {
  it("restaura a navegação superior e remove o menu lateral exclusivo da decisão", () => {
    expect(navigation).toContain('aria-label="Navegação principal"');
    expect(page).not.toContain("Navegação lateral do monitoramento");
    expect(page).not.toContain("<aside");
    expect(css).not.toContain('body:has(.decision-reference-shell) [data-irrigapro-topnav="true"] {\n    display: none;');
  });

  it("mantém o padrão de abas do sistema sem mudar os gráficos de Dados", () => {
    expect(page).toContain("<Tabs tabs={TABS}");
    const dados = page.split('{/* ── ABA DADOS:')[1]?.split('{/* ── ABA DECISÃO:')[0] ?? "";
    expect(dados).toContain("<Cockpit");
    expect(dados).toContain('mode="dados"');
    expect(dados).not.toContain("<DecisionMonitoringReferenceLayout");
  });

  it("pinta a página e os painéis de decisão com o verde da fazenda", () => {
    expect(css).toContain("background-color: #073326 !important");
    expect(css).toContain(".decision-reference-shell .season-audit-table td");
    expect(page).toContain("decision-tabs");
    expect(panel).toContain("bg-gradient-to-b from-[#0b4433] to-[#092e24]");
    expect(page).toContain('bg-[#0b382b]');
    expect(page).toContain('panel="auditoria"');
  });
});
