// ============================================================================
// modules/weather/diagnostics/architecture.test.ts
// ----------------------------------------------------------------------------
// Teste de arquitetura (Etapa 5, §13 e §16).
//
// Regra crítica: nenhum módulo operacional pode importar o módulo diagnóstico.
// Testes aqui rodam grep textual sobre os fontes — não bootam runtime.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

const OPERATIONAL_DIRS = [
  "modules/water-balance",
  "modules/irrigation",
  "modules/recommendation",
  "modules/scheduling",
  "modules/reports",
  "modules/costs",
  "modules/energy",
];

const FORBIDDEN_IMPORTS = [
  "@/modules/weather/diagnostics/",
  "modules/weather/diagnostics/",
  "@/components/climate/ClimateDiagnosticTab",
  "@/components/climate/EtoAuditView",
  "@/components/climate/ShadowModeBanner",
  "@/modules/weather/providers/openMeteoProvider",
  "@/modules/weather/normalizers/normalizeOpenMeteo",
  "@/modules/weather/calculations/referenceEtoFao56",
  "@/modules/weather/calculations/referenceEtoTypes",
  "@/modules/weather/config/climateSpecification",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (e === "node_modules" || e === ".next" || e === "__tests__") continue;
      out.push(...walk(p));
    } else if (
      (e.endsWith(".ts") || e.endsWith(".tsx")) &&
      !e.endsWith(".test.ts") &&
      !e.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("Arquitetura Shadow Mode — módulos operacionais NÃO importam diagnóstico", () => {
  for (const dir of OPERATIONAL_DIRS) {
    it(`nenhum arquivo em ${dir}/ importa a nova camada climática`, () => {
      const files = walk(join(REPO_ROOT, dir));
      const offenders: string[] = [];
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        for (const forbidden of FORBIDDEN_IMPORTS) {
          if (content.includes(forbidden)) {
            offenders.push(`${file} → ${forbidden}`);
          }
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});

describe("Arquitetura Shadow Mode — hook do balanço não usa diagnóstico", () => {
  it("lib/hooks/use-farm-hydric-state.ts não importa nada da nova camada", () => {
    const file = join(REPO_ROOT, "lib/hooks/use-farm-hydric-state.ts");
    const content = readFileSync(file, "utf8");
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(
        content.includes(forbidden),
        `${forbidden} não pode aparecer aqui`,
      ).toBe(false);
    }
  });
});

describe("Arquitetura Shadow Mode — irrigation.service permanece intocado", () => {
  it("modules/irrigation/services/irrigation.service.ts não importa referenceEtoFao56 novo", () => {
    const file = join(
      REPO_ROOT,
      "modules/irrigation/services/irrigation.service.ts",
    );
    const content = readFileSync(file, "utf8");
    // Não deve importar nada da nova cadeia
    expect(content).not.toContain("referenceEtoFao56");
    expect(content).not.toContain("openMeteoProvider");
    expect(content).not.toContain("normalizeOpenMeteo");
    expect(content).not.toContain("climateDiagnosticService");
  });
});
