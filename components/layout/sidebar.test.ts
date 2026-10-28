import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("sidebar compacta", () => {
  it("mantém identidade Santa Colomba, compacta, sem recorte de outra plataforma", () => {
    const sidebar = readFileSync(join(process.cwd(), "components/layout/Sidebar.tsx"), "utf8");
    const nav = readFileSync(join(process.cwd(), "config/navigation.ts"), "utf8");
    const layout = readFileSync(join(process.cwd(), "app/(app)/layout.tsx"), "utf8");
    const login = readFileSync(join(process.cwd(), "app/(auth)/login/page.tsx"), "utf8");
    const palette = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");

    expect(sidebar).toContain("w-[264px]");
    expect(sidebar).toContain("bg-santa-800");
    expect(sidebar).toContain("text-[14px]");
    expect(sidebar).toContain("Navegação principal");
    expect(sidebar).toContain("aria-expanded");
    expect(sidebar).toContain('src="/brand/santa-colomba-logo-branca.png"');
    expect(login).toContain('src="/brand/santa-colomba-logo-branca.png"');
    expect(existsSync(join(process.cwd(), "public/brand/santa-colomba-logo-branca.png"))).toBe(true);
    expect(login).toContain("bg-santa-700");
    expect(palette).toContain('600: "#286a6b"');
    expect(palette).toContain("brand: {");
    expect(sidebar).toContain(">IRRIGA PRO</");
    expect(nav).toContain('label: "Dashboard"');
    expect(nav).toContain("Cadastros");
    expect(nav).toContain("Manejo Diário");
    expect(nav).toContain('href: "/historico"');
    expect(nav).toContain('href: "/relatorios"');
    expect(nav).toContain('href: "/balanco-hidrico"');
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
    expect(layout).toContain("lg:pl-[264px]");
  });
});
