import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p:string) => readFileSync(join(process.cwd(),p),"utf8");
const page=read("app/(app)/balanco-hidrico/page.tsx");
const decision=read("components/water-balance/DecisionMonitoringReferenceLayout.tsx");
const panel=read("components/water-balance/DecisionSoilLayerPanel.tsx");

describe("Decisão e Monitoramento — verde da fazenda com dados de solo por camada",()=>{
  it("usa os dados reais do perfil cadastrado e da última linha da safra",()=>{
    const onlyDecision=page.split('{/* ── ABA DECISÃO:')[1] ?? "";
    expect(onlyDecision).toContain("<DecisionSoilLayerPanel");
    expect(onlyDecision).toContain("soilLayers={soilLayers}");
    expect(onlyDecision).toContain("last={seasonRows[seasonRows.length - 1] ?? null}");
    expect(panel).toContain("buildDecisionSoilProfile");
    expect(panel).toContain("CRA / AFD do perfil");
    expect(panel).toContain("DTA média do perfil");
    expect(panel).toContain("ARM estimada (mm)");
    expect(panel).toContain("não representa uma medição");
  });
  it("remove ações de lançamento e programação da decisão, sem remover os registros reais",()=>{
    expect(decision).not.toContain("Programar irrigação");
    expect(decision).not.toContain("Registrar irrigação");
    expect(decision).not.toContain("Registrar chuva");
    const dados=page.split('{/* ── ABA DADOS:')[1]?.split('{/* ── ABA DECISÃO:')[0]??"";
    expect(dados).toContain("<Cockpit");
    expect(dados).toContain('mode="dados"');
    expect(page).toContain("/lancamentos/irrigacao");
    expect(page).toContain("/lancamentos/chuvas");
  });
  it("padroniza página e painéis brancos, com acentos institucionais verdes",()=>{
    expect(decision).toContain("border border-emerald-100 bg-white");
    expect(panel).toContain("border border-emerald-100 bg-white");
    expect(panel).toContain("bg-emerald-50/75");
    expect(panel).not.toContain('bg-[#07382b]');
    expect(page).toContain("decision-reference-shell");
  });
});
