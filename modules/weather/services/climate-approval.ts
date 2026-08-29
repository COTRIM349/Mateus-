import type { SupabaseClient } from "@supabase/supabase-js";
import { operationalEtoMm } from "./operational-eto";

export interface OperationalSelectionDay {
  date: string;
  selectedReadingId: string | null;
  selectedStationId: string | null;
  stationName: string | null;
  operationalApproved: boolean;
  approvedAt: string | null;
  approvalNote: string | null;
  qualityUsed: string | null;
  reason: string | null;
  fallbackUsed: boolean;
  etoMm: number | null;
  precipitationMm: number | null;
  dataKind: string | null;
  dataQuality: string | null;
  canApprove: boolean;
}

export interface OperationalSelectionSummary {
  farmId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  withSelection: number;
  approvedDays: number;
  pendingApproval: number;
  missingSelection: number;
  days: OperationalSelectionDay[];
}

function datesInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function listOperationalSelections(
  supabase: SupabaseClient,
  farmId: string,
  startDate: string,
  endDate: string,
): Promise<OperationalSelectionSummary> {
  const allDates = datesInRange(startDate, endDate);

  const { data: selections, error: selErr } = await supabase
    .from("weather_daily_selection")
    .select(
      "date, selected_reading_id, selected_station_id, operational_approved, approved_at, approval_note, quality_used, reason, fallback_used",
    )
    .eq("farm_id", farmId)
    .gte("date", startDate)
    .lte("date", endDate);
  if (selErr) throw new Error(selErr.message);

  const selectionByDate = new Map(
    (selections ?? []).map((s) => [s.date as string, s]),
  );

  const readingIds = Array.from(
    new Set(
      (selections ?? [])
        .map((s) => s.selected_reading_id as string | null)
        .filter(Boolean) as string[],
    ),
  );
  const stationIds = Array.from(
    new Set(
      (selections ?? [])
        .map((s) => s.selected_station_id as string | null)
        .filter(Boolean) as string[],
    ),
  );

  const readingsById = new Map<
    string,
    {
      et0_calculated: number | null;
      et0_source: number | null;
      precipitation: number | null;
      data_kind: string | null;
      data_quality: string | null;
    }
  >();
  if (readingIds.length > 0) {
    const { data: readings, error: rErr } = await supabase
      .from("weather_readings")
      .select("id, et0_calculated, et0_source, precipitation, data_kind, data_quality")
      .in("id", readingIds);
    if (rErr) throw new Error(rErr.message);
    for (const r of readings ?? []) {
      readingsById.set(r.id as string, {
        et0_calculated: r.et0_calculated as number | null,
        et0_source: r.et0_source as number | null,
        precipitation: r.precipitation as number | null,
        data_kind: r.data_kind as string | null,
        data_quality: r.data_quality as string | null,
      });
    }
  }

  const stationsById = new Map<string, string>();
  if (stationIds.length > 0) {
    const { data: stations, error: stErr } = await supabase
      .from("weather_stations")
      .select("id, name")
      .in("id", stationIds);
    if (stErr) throw new Error(stErr.message);
    for (const st of stations ?? []) {
      stationsById.set(st.id as string, st.name as string);
    }
  }

  const days: OperationalSelectionDay[] = allDates.map((date) => {
    const sel = selectionByDate.get(date);
    if (!sel) {
      return {
        date,
        selectedReadingId: null,
        selectedStationId: null,
        stationName: null,
        operationalApproved: false,
        approvedAt: null,
        approvalNote: null,
        qualityUsed: null,
        reason: null,
        fallbackUsed: false,
        etoMm: null,
        precipitationMm: null,
        dataKind: null,
        dataQuality: null,
        canApprove: false,
      };
    }

    const readingId = sel.selected_reading_id as string | null;
    const stationId = sel.selected_station_id as string | null;
    const reading = readingId ? readingsById.get(readingId) : undefined;
    const etoMm = reading ? operationalEtoMm(reading) : null;
    const canApprove = Boolean(readingId && etoMm != null);

    return {
      date,
      selectedReadingId: readingId,
      selectedStationId: stationId,
      stationName: stationId ? stationsById.get(stationId) ?? null : null,
      operationalApproved: sel.operational_approved === true,
      approvedAt: (sel.approved_at as string | null) ?? null,
      approvalNote: (sel.approval_note as string | null) ?? null,
      qualityUsed: (sel.quality_used as string | null) ?? null,
      reason: (sel.reason as string | null) ?? null,
      fallbackUsed: Boolean(sel.fallback_used),
      etoMm,
      precipitationMm: reading?.precipitation ?? null,
      dataKind: reading?.data_kind ?? null,
      dataQuality: reading?.data_quality ?? null,
      canApprove,
    };
  });

  const withSelection = days.filter((d) => d.selectedReadingId).length;
  const approvedDays = days.filter((d) => d.operationalApproved).length;
  const pendingApproval = days.filter((d) => d.canApprove && !d.operationalApproved).length;
  const missingSelection = days.length - withSelection;

  return {
    farmId,
    startDate,
    endDate,
    totalDays: days.length,
    withSelection,
    approvedDays,
    pendingApproval,
    missingSelection,
    days,
  };
}

export interface ApprovalMutationResult {
  updated: string[];
  skipped: Array<{ date: string; reason: string }>;
}

export async function approveOperationalSelections(
  supabase: SupabaseClient,
  farmId: string,
  dates: string[],
  userId: string,
  note?: string | null,
): Promise<ApprovalMutationResult> {
  const uniqueDates = Array.from(new Set(dates)).sort();
  const updated: string[] = [];
  const skipped: Array<{ date: string; reason: string }> = [];

  for (const date of uniqueDates) {
    const { data: sel, error: selErr } = await supabase
      .from("weather_daily_selection")
      .select("id, selected_reading_id")
      .eq("farm_id", farmId)
      .eq("date", date)
      .maybeSingle();
    if (selErr) {
      skipped.push({ date, reason: selErr.message });
      continue;
    }
    if (!sel?.selected_reading_id) {
      skipped.push({ date, reason: "sem leitura selecionada — sincronize o clima" });
      continue;
    }

    const { data: reading, error: rErr } = await supabase
      .from("weather_readings")
      .select("et0_calculated, et0_source")
      .eq("id", sel.selected_reading_id)
      .maybeSingle();
    if (rErr) {
      skipped.push({ date, reason: rErr.message });
      continue;
    }
    if (!reading || operationalEtoMm(reading) == null) {
      skipped.push({ date, reason: "leitura sem ETo válida" });
      continue;
    }

    const { error: upErr } = await supabase
      .from("weather_daily_selection")
      .update({
        operational_approved: true,
        approved_at: new Date().toISOString(),
        approved_by: userId,
        approval_note: note?.trim() || null,
      })
      .eq("id", sel.id);
    if (upErr) {
      skipped.push({ date, reason: upErr.message });
      continue;
    }
    updated.push(date);
  }

  return { updated, skipped };
}

export async function revokeOperationalSelections(
  supabase: SupabaseClient,
  farmId: string,
  dates: string[],
): Promise<ApprovalMutationResult> {
  const uniqueDates = Array.from(new Set(dates)).sort();
  const updated: string[] = [];
  const skipped: Array<{ date: string; reason: string }> = [];

  for (const date of uniqueDates) {
    const { data: sel, error: selErr } = await supabase
      .from("weather_daily_selection")
      .select("id")
      .eq("farm_id", farmId)
      .eq("date", date)
      .maybeSingle();
    if (selErr) {
      skipped.push({ date, reason: selErr.message });
      continue;
    }
    if (!sel) {
      skipped.push({ date, reason: "sem registro de seleção" });
      continue;
    }

    const { error: upErr } = await supabase
      .from("weather_daily_selection")
      .update({
        operational_approved: false,
        approved_at: null,
        approved_by: null,
        approval_note: null,
      })
      .eq("id", sel.id);
    if (upErr) {
      skipped.push({ date, reason: upErr.message });
      continue;
    }
    updated.push(date);
  }

  return { updated, skipped };
}
