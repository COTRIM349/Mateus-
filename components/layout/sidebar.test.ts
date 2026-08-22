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
    expect(nav).toContain('href: "/relatorios"');
    expect(nav).toContain('href: "/balanco-hidrico"');
    expect(nav).toContain('href: "/operacao/modelo"');
    expect(nav).not.toContain("Gestão de Ativos");
    expect(nav).not.toContain("Operação e Manejo");
    expect(nav).not.toContain('label: "Home"');
    expect(nav).not.toContain('href: "/agua"');
    expect(nav).not.toContain('href: "/alertas"');
    expect(nav).not.toContain('href: "/sensores"');
    expect(nav).not.toContain('href: "/reservatorios"');
    expect(nav).not.toContain('href: "/cotrim-ai"');
    expect(nav).not.toContain('href: "/ordem-servico"');
    expect(nav).not.toContain('href: "/lancamentos/chuvas"');
    expect(nav).not.toContain("Infraestrutura");
    expect(sidebar).not.toContain("tracking-[0.14em] text-brand-200");
    expect(layout).toContain("lg:pl-[240px]");
  });
});
