import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { navItems } from "@/config/navigation";

describe("sidebar compacta", () => {
  it("menu enxuto por blocos, no espírito de plataforma de manejo", () => {
    const sidebar = readFileSync(join(process.cwd(), "components/layout/Sidebar.tsx"), "utf8");
    const nav = readFileSync(join(process.cwd(), "config/navigation.ts"), "utf8");
    const layout = readFileSync(join(process.cwd(), "app/(app)/layout.tsx"), "utf8");

    expect(sidebar).toContain("w-[220px]");
    expect(sidebar).toContain("NavBranch");
    expect(nav).toContain("Gestão de Ativos");
    expect(nav).toContain("Operação e Manejo");
    expect(nav).toContain('label: "Irrigação"');
    expect(nav).toContain('label: "Home"');
    expect(nav).toContain('href: "/historico"');
    expect(nav).not.toContain("Manejo Diário");
    expect(layout).toContain("lg:pl-[220px]");
    expect(layout).not.toContain("lg:pl-[264px]");

    const hrefs = navItems.map((i) => i.href);
    expect(hrefs).toContain("/balanco-hidrico");
    expect(hrefs).toContain("/pivos");
    expect(hrefs).toContain("/clima");
    expect(hrefs).toContain("/historico");
  });
});
