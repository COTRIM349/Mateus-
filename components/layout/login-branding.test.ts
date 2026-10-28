import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("identidade SCA Irriga Pro", () => {
  it("exibe o logotipo corporativo somente na tela de acesso", () => {
    const login = read("app/(auth)/login/page.tsx");
    const topbar = read("components/layout/Topbar.tsx");
    const sidebar = read("components/layout/Sidebar.tsx");
    expect(login).toContain('src="/brand/santa-colomba-logo-branca.png"');
    expect(login).toContain('alt="Logotipo da Santa Colomba"');
    expect(login).toContain("SCA");
    expect(login).toContain("IRRIGA");
    expect(login).toContain("PRO");
    expect(topbar).not.toContain("santa-colomba-logo-branca.png");
    expect(sidebar).not.toContain("santa-colomba-logo-branca.png");
    expect(read("constants/app.ts")).toContain('APP_NAME = "SCA IRRIGA PRO"');
  });
  it("preserva login Supabase, autenticação, recuperação de senha e menu", () => {
    const login = read("app/(auth)/login/page.tsx");
    expect(login).toContain("supabase.auth.signInWithPassword");
    expect(login).toContain('router.push("/")');
    expect(login).toContain('href="/recuperar-senha"');
    expect(login).toContain('type="password"');
    expect(read("components/layout/Topbar.tsx")).toContain("<TopNavigation />");
    expect(read("app/(auth)/recuperar-senha/page.tsx")).toContain("max-w-[440px]");
  });
});
