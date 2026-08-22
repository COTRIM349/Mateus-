import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("sidebar compacta", () => {
  it("mantém identidade Cotrim, compacta, sem recorte de outra plataforma", () => {
    const sidebar = readFileSync(join(process.cwd(), "components/layout/Sidebar.tsx"), "utf8");
    const nav = readFileSync(join(process.cwd(), "config/navigation.ts"), "utf8");
    const layout = readFileSync(join(process.cwd(), "app/(app)/layout.tsx"), "utf8");

    expect(sidebar).toContain("w-[240px]");
    expect(sidebar).toContain("bg-forest-900");
    expect(sidebar).toContain("aria-expanded");
    expect(sidebar).toContain(">Cotrim</");
    expect(nav).toContain('label: "Dashboard"');
    expect(nav).toContain("Cadastros");
    expect(nav).toContain("Manejo Diário");
    expect(nav).toContain('href: "/historico"');
    expect(nav).not.toContain("Gestão de Ativos");
    expect(nav).not.toContain("Operação e Manejo");
    expect(nav).not.toContain('label: "Home"');
    expect(sidebar).not.toContain("tracking-[0.14em] text-brand-200");
    expect(layout).toContain("lg:pl-[240px]");
  });
});
