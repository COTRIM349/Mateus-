import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bottomItems, navGroups, navItems, topLevelItems } from "../../config/navigation";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("navegação horizontal Santa Colomba", () => {
  it("mostra marca textual no interior e mantém o menu superior sem logo corporativa", () => {
    const layout = source("app/(app)/layout.tsx");
    const topbar = source("components/layout/Topbar.tsx");
    const navigation = source("components/layout/TopNavigation.tsx");

    expect(layout).not.toContain("<Sidebar />");
    expect(layout).not.toContain("lg:pl-[264px]");
    expect(layout).toContain("<Topbar />");
    expect(topbar).toContain("<TopNavigation />");
    expect(topbar).toContain("SCA");
    expect(topbar).toContain("IRRIGA");
    expect(topbar).not.toContain('src="/brand/santa-colomba-logo-branca.png"');
    expect(source("components/layout/Sidebar.tsx")).not.toContain('src="/brand/santa-colomba-logo-branca.png"');
    expect(source("app/(auth)/login/page.tsx")).toContain('src="/brand/santa-colomba-logo-branca.png"');
    expect(existsSync(join(process.cwd(), "public/brand/santa-colomba-logo-branca.png"))).toBe(true);
    expect(navigation).toContain('aria-label="Navegação principal"');
    expect(navigation).toContain('aria-label="Navegação para telas menores"');
    expect(navigation).toContain("aria-expanded");
  });

  it("mantém balanço hídrico dentro de Manejo Diário sem duplicar a rota", () => {
    expect(topLevelItems[0]?.href).toBe("/");
    expect(topLevelItems.some((item) => item.href === "/balanco-hidrico")).toBe(false);
    expect(navGroups.find((g) => g.label === "Manejo Diário")?.items.some((i) => i.href === "/balanco-hidrico")).toBe(true);
    expect(navItems.filter((i) => i.href === "/balanco-hidrico")).toHaveLength(1);
  });

  it("mantém navegação principal enxuta e preserva os registros operacionais", () => {
    expect(navGroups.map((group) => group.label)).toEqual([
      "Manejo Diário", "Cadastros", "Energia",
    ]);
    expect(topLevelItems.some((item) => item.href === "/clima")).toBe(true);
    expect(navItems.some((item) => item.href === "/operacao/decisao")).toBe(false);
    expect(bottomItems.some((item) => item.href === "/configuracoes")).toBe(true);
    expect(navItems.some((item) => item.href === "/programacao")).toBe(true);
    expect(navItems.some((item) => item.href === "/lancamentos/irrigacao")).toBe(true);
    expect(new Set(navItems.map((item) => item.href)).size).toBe(navItems.length);
  });
});
