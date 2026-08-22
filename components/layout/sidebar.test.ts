import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("sidebar compacta", () => {
  it("menu lateral mais estreito, itens densos e grupos recolhíveis", () => {
    const sidebar = readFileSync(join(process.cwd(), "components/layout/Sidebar.tsx"), "utf8");
    const layout = readFileSync(join(process.cwd(), "app/(app)/layout.tsx"), "utf8");

    expect(sidebar).toContain('w-[240px]');
    expect(sidebar).toContain("py-1.5");
    expect(sidebar).toContain("aria-expanded");
    expect(sidebar).toContain("groupOpen");
    expect(sidebar).not.toContain("w-[264px]");
    expect(sidebar).not.toContain("py-2.5 text-[13.5px]");

    expect(layout).toContain("lg:pl-[240px]");
    expect(layout).not.toContain("lg:pl-[264px]");
  });
});
