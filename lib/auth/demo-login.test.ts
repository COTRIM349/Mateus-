import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_LOGIN, DEMO_LOGIN_LABEL } from "./demo-login";

describe("login de demonstração", () => {
  it("expõe e-mail e senha de viewer na tela de login", () => {
    expect(DEMO_LOGIN.email).toBe("demo@cotrim.app");
    expect(DEMO_LOGIN.password.length).toBeGreaterThanOrEqual(12);
    const src = readFileSync(join(process.cwd(), "app/(auth)/login/page.tsx"), "utf8");
    expect(src).toContain("DEMO_LOGIN");
    expect(src).toContain("DEMO_LOGIN_LABEL");
    expect(src).toContain("/balanco-hidrico");
  });
});
