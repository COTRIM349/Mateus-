import { NextResponse } from "next/server";
import { pingMeteoblue } from "@/modules/weather/providers/meteoblue";

export async function GET() {
  const raw = process.env.METEOBLUE_API_KEY ?? "";
  const trimmed = raw.trim();

  const envDebug = {
    envVarExists: raw.length > 0,
    rawLength: raw.length,
    trimmedLength: trimmed.length,
    hasWhitespace: raw !== trimmed,
    prefix: trimmed.length >= 4 ? trimmed.slice(0, 4) + "…" : "(vazio)",
  };

  const result = await pingMeteoblue({ latitude: -15.78, longitude: -47.93 });

  return NextResponse.json({ ...result, envDebug });
}
