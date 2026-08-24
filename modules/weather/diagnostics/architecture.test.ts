// ============================================================================
// modules/weather/diagnostics/architecture.test.ts
// ----------------------------------------------------------------------------
// Teste de arquitetura climática.
//
// Regra crítica: módulos operacionais não podem depender de diagnóstico,
// providers, normalizadores ou UI climática. O cálculo puro FAO-56 canônico é
// uma exceção intencional: ele foi promovido a núcleo matemático operacional.
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

/**
 * Dependências que continuam proibidas no domínio operacional. Note que
 * referenceEtoFao56/referenceEtoTypes NÃO estão aqui: são módulos matemáticos
 * puros, determinísticos e agora constituem a única implementação oficial de
 * ETo FAO-56 da plataforma.
 */
const FORBIDDEN_IMPORTS = [
  "@/modules/weather/diagnostics/",
  "modules/weather/diagnostics/",
  "@/components/climate/ClimateDiagnosticTab",
  "@/components/climate/EtoAuditView",
  "@/components/climate/ShadowModeBanner",
  "@/modules/weather/providers/openMeteoProvider",
  "@/modules/weather/normalizers/normalizeOpenMeteo",
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

describe("Arquitetura climática — módulos operacionais não importam diagnóstico/provider", () => {
  for (const dir of OPERATIONAL_DIRS) {
    it(`nenhum arquivo em ${dir}/ importa camada climática acoplada`, () => {
      const files = walk(join(REPO_ROOT, dir));
      const offenders: string[] = [];
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        for (const forbidden of FORBIDDEN_IMPORTS) {
          if (content.includes(forbidden)) offenders.push(`${file} → ${forbidden}`);
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});

describe("Arquitetura climática — hook do balanço não usa diagnóstico", () => {
  it("lib/hooks/use-farm-hydric-state.ts não importa dependências proibidas", () => {
    const file = join(REPO_ROOT, "lib/hooks/use-farm-hydric-state.ts");
    const content = readFileSync(file, "utf8");
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(content.includes(forbidden), `${forbidden} não pode aparecer aqui`).toBe(false);
    }
  });
});

describe("ETo operacional — implementação única", () => {
  it("irrigation.service usa o FAO-56 canônico sem importar provider/diagnóstico", () => {
    const file = join(REPO_ROOT, "modules/irrigation/services/irrigation.service.ts");
    const content = readFileSync(file, "utf8");
    expect(content).toContain("@/modules/weather/calculations/referenceEtoFao56");
    expect(content).not.toContain("openMeteoProvider");
    expect(content).not.toContain("normalizeOpenMeteo");
    expect(content).not.toContain("climateDiagnosticService");
  });
});
