import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("layout corporativo Santa Colomba", () => {
  it("aplica uma mesma largura de menu e área útil responsiva", () => {
    expect(source("components/layout/Sidebar.tsx")).toContain("w-[264px]");
    expect(source("app/(app)/layout.tsx")).toContain("lg:pl-[264px]");
    expect(source("app/(app)/layout.tsx")).toContain("min-w-0 flex-1");
  });

  it("padroniza menu, títulos e componentes compartilhados", () => {
    expect(source("components/layout/Sidebar.tsx")).toContain("text-[14px]");
    expect(source("components/layout/PageHeader.tsx")).toContain("border-santa-500");
    expect(source("components/ui/Button.tsx")).toContain("bg-santa-600");
    expect(source("components/ui/Tabs.tsx")).toContain("bg-santa-600");
    expect(source("components/ui/Table.tsx")).toContain("bg-santa-50/60");
    expect(source("components/ui/Input.tsx")).toContain("focus:border-santa-500");
    expect(source("components/ui/Select.tsx")).toContain("focus:border-santa-500");
    expect(source("components/ui/TextArea.tsx")).toContain("focus:border-santa-500");
  });

  it("preserva a identidade visual e cores semânticas de irrigação", () => {
    expect(source("components/layout/Sidebar.tsx")).toContain("santa-colomba-logo-branca.png");
    expect(source("tailwind.config.ts")).toContain("brand: {");
    expect(source("components/ui/Badge.tsx")).toContain("bg-amber-50");
    expect(source("components/ui/Badge.tsx")).toContain("bg-red-50");
  });
});
