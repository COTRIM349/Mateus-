import { NextResponse } from "next/server";
import { pingMeteoblue } from "@/modules/weather/providers/meteoblue";

export async function GET() {
  const result = await pingMeteoblue({ latitude: -15.78, longitude: -47.93 });
  return NextResponse.json(result);
}
