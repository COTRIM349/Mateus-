import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bottomItems, navGroups, navItems, topLevelItems } from "../../config/navigation";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("navegação horizontal Santa Colomba", () => {
  it("usa o logotipo e o menu na parte superior, sem montar sidebar lateral", () => {
    const layout = source("app/(app)/layout.tsx");
    const topbar = source("components/layout/Topbar.tsx");
    const navigation = source("components/layout/TopNavigation.tsx");

    expect(layout).not.toContain("<Sidebar />");
    expect(layout).not.toContain("lg:pl-[264px]");
    expect(layout).toContain("<Topbar />");
    expect(topbar).toContain("<TopNavigation />");
    expect(topbar).toContain('src="/brand/santa-colomba-logo-branca.png"');
    expect(existsSync(join(process.cwd(), "public/brand/santa-colomba-logo-branca.png"))).toBe(true);
    expect(navigation).toContain('aria-label="Navegação principal"');
    expect(navigation).toContain('aria-label="Navegação para telas menores"');
    expect(navigation).toContain("aria-expanded");
  });

  it("dá acesso direto ao balanço hídrico sem duplicar a rota", () => {
    expect(topLevelItems[0]?.href).toBe("/");
    expect(topLevelItems[1]?.href).toBe("/balanco-hidrico");
    expect(navGroups.find((g) => g.label === "Manejo Diário")?.items.some((i) => i.href === "/balanco-hidrico")).toBe(false);
    expect(navItems.filter((i) => i.href === "/balanco-hidrico")).toHaveLength(1);
  });

  it("mantém todos os módulos e opções agrupadas no menu", () => {
    expect(navGroups.map((group) => group.label)).toEqual([
      "Cadastros", "Manejo Diário", "Lançamentos", "Energia & Custos",
    ]);
    expect(bottomItems.some((item) => item.href === "/configuracoes")).toBe(true);
    expect(navItems.some((item) => item.href === "/programacao")).toBe(true);
    expect(navItems.some((item) => item.href === "/lancamentos/irrigacao")).toBe(true);
    expect(new Set(navItems.map((item) => item.href)).size).toBe(navItems.length);
  });
});
