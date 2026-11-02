import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "app/(app)/central-manejo/page.tsx"),
  "utf8",
);

describe("Central de Manejo — dashboard amplo", () => {
  it("usa mapa grande e painel lateral de situação hídrica", () => {
    expect(source).toContain("Mapa hídrico operacional");
    expect(source).toContain("Situação hídrica");
    expect(source).toContain("h-[min(68vh,690px)]");
    expect(source).toContain("2xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.65fr)]");
  });

  it("mantém a área de manejo operacional sem a composição antiga meio a meio", () => {
    expect(source).toContain("Pivôs em manejo");
    expect(source).not.toContain('grid gap-4 xl:grid-cols-2');
    expect(source).not.toContain("rastreamento das cores do mapa");
  });


  it("mantém a auditoria da decisão e as rotinas de qualidade dos dados", () => {
    expect(source).toContain("decisionDataQuality");
    expect(source).toContain("Auditoria da decisão · últimos 7 dias");
    expect(source).toContain("buildDecisionAudit");
  });

  it("exibe as cinco faixas hídricas no painel lateral", () => {
    expect(source).toContain('status: "capacidade_campo"');
    expect(source).toContain('status: "boa_umidade"');
    expect(source).toContain('status: "atencao"');
    expect(source).toContain('status: "deficit_hidrico"');
    expect(source).toContain('status: "critico"');
  });
});
