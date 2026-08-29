import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StationRow {
  id: string;
  name: string;
  data_source: string;
  source_priority: number;
}

interface ReadingRow {
  id: string;
  station_id: string;
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_mean: number | null;
  humidity: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  wind_speed: number | null;
  solar_radiation: number | null;
  precipitation: number | null;
  et0_calculated: number | null;
  et0_source: number | null;
  data_quality: string | null;
  data_kind: string | null;
  origin: string | null;
  imported_at: string | null;
}

interface SelectionRow {
  date: string;
  selected_station_id: string | null;
  selected_reading_id: string | null;
  quality_used: string | null;
  reason: string | null;
  fallback_used: boolean | null;
  operational_approved: boolean | null;
  selected_at: string | null;
}

function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateIso: string, offset: number): string {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function completeness(reading: ReadingRow | null): number {
  if (!reading) return 0;
  const values = [
    reading.temp_min,
    reading.temp_max,
    reading.humidity,
    reading.wind_speed,
    reading.solar_radiation,
  ];
  const present = values.filter((value) => value !== null && Number.isFinite(value)).length;
  return Math.round((present / values.length) * 100);
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const farmId = new URL(request.url).searchParams.get("farmId")?.trim();
  if (!farmId) {
    return NextResponse.json({ error: "farmId é obrigatório" }, { status: 400 });
  }

  const [stationsResult, virtualStationResult] = await Promise.all([
    supabase
      .from("weather_stations")
      .select("id,name,data_source,source_priority")
      .eq("farm_id", farmId)
      .eq("active", true)
      .order("source_priority", { ascending: true }),
    supabase
      .from("virtual_weather_stations")
      .select("timezone")
      .eq("farm_id", farmId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  if (stationsResult.error) {
    return NextResponse.json({ error: stationsResult.error.message }, { status: 422 });
  }
  if (virtualStationResult.error) {
    return NextResponse.json({ error: virtualStationResult.error.message }, { status: 422 });
  }

  const stations = (stationsResult.data ?? []) as StationRow[];
  const timezone = String(virtualStationResult.data?.[0]?.timezone ?? "America/Bahia");
  const today = localDate(new Date(), timezone);
  const startDate = addDays(today, -9);
  const stationIds = stations.map((station) => station.id);

  if (stationIds.length === 0) {
    return NextResponse.json({
      farmId,
      timezone,
      generatedAt: new Date().toISOString(),
      today,
      lastIngestion: null,
      rows: [],
    });
  }

  const [readingsResult, selectionsResult, ingestionResult] = await Promise.all([
    supabase
      .from("weather_readings")
      .select("id,station_id,date,temp_max,temp_min,temp_mean,humidity,humidity_min,humidity_max,wind_speed,solar_radiation,precipitation,et0_calculated,et0_source,data_quality,data_kind,origin,imported_at")
      .in("station_id", stationIds)
      .gte("date", startDate)
      .lte("date", today)
      .order("date", { ascending: false })
      .order("imported_at", { ascending: false }),
    supabase
      .from("weather_daily_selection")
      .select("date,selected_station_id,selected_reading_id,quality_used,reason,fallback_used,operational_approved,selected_at")
      .eq("farm_id", farmId)
      .gte("date", startDate)
      .lte("date", today)
      .order("date", { ascending: false }),
    supabase
      .from("climate_ingestion_runs")
      .select("provider,status,rows_inserted,rows_updated,rows_skipped,error_message,duration_ms,run_at")
      .eq("farm_id", farmId)
      .order("run_at", { ascending: false })
      .limit(1),
  ]);

  const queryError = readingsResult.error ?? selectionsResult.error ?? ingestionResult.error;
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 422 });
  }

  const readings = (readingsResult.data ?? []) as ReadingRow[];
  const selections = (selectionsResult.data ?? []) as SelectionRow[];
  const readingById = new Map(readings.map((reading) => [reading.id, reading]));
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const latestByDate = new Map<string, ReadingRow>();

  for (const reading of readings) {
    if (!latestByDate.has(reading.date)) latestByDate.set(reading.date, reading);
  }

  const selectionByDate = new Map(selections.map((selection) => [selection.date, selection]));
  const dates = Array.from({ length: 10 }, (_, index) => addDays(today, -index));

  const rows = dates.map((date) => {
    const selection = selectionByDate.get(date) ?? null;
    const selectedReading = selection?.selected_reading_id
      ? readingById.get(selection.selected_reading_id) ?? null
      : null;
    const reading = selectedReading ?? latestByDate.get(date) ?? null;
    const station = reading ? stationById.get(reading.station_id) ?? null : null;
    const operationalApproved = Boolean(selection?.operational_approved);

    const status =
      !reading || reading.et0_calculated === null
        ? "blocked"
        : operationalApproved
          ? "approved"
          : reading.data_quality === "ok"
            ? "review"
            : "partial";

    return {
      date,
      status,
      operationalApproved,
      completenessPct: completeness(reading),
      stationId: reading?.station_id ?? null,
      sourceLabel: station?.name ?? reading?.origin ?? null,
      provider: reading?.origin ?? station?.data_source ?? null,
      dataKind: reading?.data_kind ?? null,
      dataQuality: selection?.quality_used ?? reading?.data_quality ?? null,
      importedAt: reading?.imported_at ?? null,
      selectedAt: selection?.selected_at ?? null,
      fallbackUsed: Boolean(selection?.fallback_used),
      selectionReason: selection?.reason ?? null,
      temperatureMinC: reading?.temp_min ?? null,
      temperatureMaxC: reading?.temp_max ?? null,
      temperatureMeanC: reading?.temp_mean ?? null,
      relativeHumidityPct: reading?.humidity ?? null,
      relativeHumidityMinPct: reading?.humidity_min ?? null,
      relativeHumidityMaxPct: reading?.humidity_max ?? null,
      windSpeed2mMs: reading?.wind_speed ?? null,
      solarRadiationMjM2Day: reading?.solar_radiation ?? null,
      precipitationMm: reading?.precipitation ?? null,
      etoCalculatedMm: reading?.et0_calculated ?? null,
      etoProviderMm: reading?.et0_source ?? null,
    };
  });

  return NextResponse.json({
    farmId,
    timezone,
    generatedAt: new Date().toISOString(),
    today,
    lastIngestion: ingestionResult.data?.[0] ?? null,
    rows,
  });
}
