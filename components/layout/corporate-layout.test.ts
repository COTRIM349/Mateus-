import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("layout corporativo horizontal Santa Colomba", () => {
  it("aplica barra superior fixa e conteúdo em largura total", () => {
    const layout = source("app/(app)/layout.tsx");
    const topbar = source("components/layout/Topbar.tsx");
    const navigation = source("components/layout/TopNavigation.tsx");

    expect(layout).toContain("max-w-[1920px]");
    expect(layout).not.toContain("lg:pl-[264px]");
    expect(topbar).toContain("sticky top-0");
    expect(topbar).toContain("bg-santa-800");
    expect(topbar).toContain("Selecionar fazenda");
    expect(navigation).toContain("lg:flex");
    expect(navigation).toContain("lg:hidden");
  });

  it("preserva tipografia, cores corporativas e formulários", () => {
    expect(source("components/layout/PageHeader.tsx")).toContain("border-santa-500");
    expect(source("components/ui/Button.tsx")).toContain("bg-santa-600");
    expect(source("components/ui/Tabs.tsx")).toContain("bg-santa-600");
    expect(source("components/ui/Table.tsx")).toContain("bg-santa-50/60");
    expect(source("components/ui/Input.tsx")).toContain("focus:border-santa-500");
    expect(source("components/ui/Select.tsx")).toContain("focus:border-santa-500");
  });

  it("não altera a semântica de alerta do manejo hídrico", () => {
    expect(source("tailwind.config.ts")).toContain("brand: {");
    expect(source("components/ui/Badge.tsx")).toContain("bg-amber-50");
    expect(source("components/ui/Badge.tsx")).toContain("bg-red-50");
    expect(source("config/navigation.ts")).toContain("Balanço Hídrico");
  });
});
