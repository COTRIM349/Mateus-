import { createHash, timingSafeEqual } from "node:crypto";

// Hash SHA-256 do token aleatório guardado exclusivamente no Supabase Vault.
// O token original nunca é salvo no GitHub nem enviado ao navegador.
const SUPABASE_CRON_SECRET_SHA256 =
  "377e94c1a4ef8d17f2d1a85eaab291fa1f2929670ca80ad4a1b08fd0164cc260";

export function isMeteoblueAgroCronAuthorized(
  request: Request,
  options: { vercelSecret?: string; supabaseSecretSha256?: string } = {},
): boolean {
  const secret = options.vercelSecret ?? process.env.CRON_SECRET?.trim();
  const expectedSecretHash = options.supabaseSecretSha256
    ?? SUPABASE_CRON_SECRET_SHA256;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return false;
  if (secret && token === secret) return true;

  const receivedHash = createHash("sha256").update(token).digest();
  const expectedHash = Buffer.from(expectedSecretHash, "hex");
  return receivedHash.length === expectedHash.length
    && timingSafeEqual(receivedHash, expectedHash);
}
