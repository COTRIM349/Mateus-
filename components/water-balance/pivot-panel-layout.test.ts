import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("painéis de manejo hídrico por pivô", () => {
  it("separa solo, cultura e clima e apresenta cada gráfico em largura total", () => {
    const page = source("app/(app)/balanco-hidrico/page.tsx");
    expect(page).toContain('role="tablist" aria-label="Painéis de manejo do pivô"');
    expect(page).toContain('panelView === "solo"');
    expect(page).toContain('panelView === "cultura"');
    expect(page).toContain('panelView === "clima"');
    // O gráfico antigo "Entradas e Consumo" foi removido somente da aba Solo.
    expect(page).not.toContain('>Entradas e Consumo</p>');
    expect(page).not.toContain("<EntradasConsumoChart");
    expect(page).not.toContain("CockpitSeriesToggles");
    // Curva de Kc da aba Cultura e painel RAS completo continuam disponíveis.
    expect(page).toContain("<SoilReservoirReferencePanel");
    expect(page).toContain('<KcCurveReadOnlyChart');
    expect(page).toContain("h-[58vh] min-h-[420px] max-h-[620px] w-full");
    expect(page).toContain("<PivotClimatePanel");
    expect(page).toContain("phenologyMarkers={phenologyMarkers}");
    expect(page).toContain("culture_variety_phenology_targets");
    expect(page).toContain("identity.varietyName");
    expect(page).not.toContain("Perfil explorado pela raiz");
    expect(page).toContain("Alertas inteligentes");
  });

  it("mantém chuva manual, eventos de irrigação e recálculo ao retornar", () => {
    const page = source("app/(app)/balanco-hidrico/page.tsx");
    const panel = source("components/water-balance/SoilReservoirReferencePanel.tsx");
    expect(page).toContain('.from("manual_rainfall_entries")');
    expect(page).toContain('.from("irrigation_events")');
    expect(page).toContain('window.addEventListener("focus", refreshOnReturn)');
    expect(panel).toContain("rows.map(buildRasPoint)");
    expect(panel).toContain("p.rainEffectiveMm");
    expect(panel).toContain("p.irrigationAppliedMm");
    expect(page).toContain("/lancamentos/chuvas?pivot=");
    expect(page).toContain("/lancamentos/irrigacao?pivot=");
    expect(panel).not.toContain("/lancamentos/chuvas");
    expect(panel).not.toContain("/lancamentos/irrigacao");
    expect(source("config/navigation.ts")).toContain('href: "/lancamentos/chuvas"');
  });

  it("não inventa temperaturas e distingue ETo/ETc da leitura da estação", () => {
    const chart = source("components/water-balance/PivotClimatePanel.tsx");
    expect(chart).toContain("tmax: finite(station?.tmax)");
    expect(chart).toContain("tmin: finite(station?.tmin)");
    expect(chart).toContain("tmean: finite(station?.tmean)");
    expect(chart).toContain("eto: finite(row.et0)");
    expect(chart).toContain("etc: finite(row.etc)");
    expect(chart).toContain("Sem temperaturas registradas");
  });
});
