import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isMeteoblueAgroCronAuthorized } from "./auth";

function request(token?: string): Request {
  return new Request("https://example.test/api/cron/meteoblue-agro", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("Meteoblue Agro cron authorization", () => {
  const vaultToken = "vault-token-used-only-in-test";
  const vaultHash = createHash("sha256").update(vaultToken).digest("hex");

  it("aceita o token cujo hash confere com o Vault", () => {
    expect(isMeteoblueAgroCronAuthorized(request(vaultToken), {
      supabaseSecretSha256: vaultHash,
    })).toBe(true);
  });

  it("mantem compatibilidade com CRON_SECRET da Vercel", () => {
    expect(isMeteoblueAgroCronAuthorized(request("vercel-secret"), {
      vercelSecret: "vercel-secret",
      supabaseSecretSha256: vaultHash,
    })).toBe(true);
  });

  it("rejeita token incorreto ou ausente", () => {
    expect(isMeteoblueAgroCronAuthorized(request("wrong"), {
      supabaseSecretSha256: vaultHash,
    })).toBe(false);
    expect(isMeteoblueAgroCronAuthorized(request(), {
      supabaseSecretSha256: vaultHash,
    })).toBe(false);
  });
});
