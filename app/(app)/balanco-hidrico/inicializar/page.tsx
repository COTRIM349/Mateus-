"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

interface Parcel {
  id: string;
  pivot_id: string;
  culture_id: string;
  name: string | null;
  planting_date: string;
}

interface HydricAnchor {
  pivot_crop_assignment_id: string;
  effective_date: string;
  measured_at: string;
  source: "measured" | "field_capacity_confirmed";
  moisture_value: number | null;
  moisture_unit: "field_capacity_fraction" | "volume_pct" | "weight_pct";
  is_field_capacity: boolean;
  notes: string | null;
}

function localDateInputValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localTimeInputValue(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function unitLabel(unit: HydricAnchor["moisture_unit"]): string {
  if (unit === "volume_pct") return "% vol.";
  if (unit === "weight_pct") return "% grav.";
  return "% da CC";
}

export default function InicializarBalancoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [pivotNames, setPivotNames] = useState<Record<string, string>>({});
  const [cultureNames, setCultureNames] = useState<Record<string, string>>({});
  const [anchors, setAnchors] = useState<Record<string, HydricAnchor>>({});
  const [parcelId, setParcelId] = useState("");
  const [mode, setMode] = useState<"measured" | "field_capacity_confirmed">("measured");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"field_capacity_fraction" | "volume_pct" | "weight_pct">("field_capacity_fraction");
  const [effectiveDate, setEffectiveDate] = useState(localDateInputValue());
  const [measuredTime, setMeasuredTime] = useState(localTimeInputValue());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setParcels([]);
      setParcelId("");
      setAnchors({});
      return;
    }
    setLoading(true);
    const { data: pivots, error: pivotError } = await supabase
      .from("pivots")
      .select("id, name")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name");
    if (pivotError) {
      setMessage(pivotError.message);
      setLoading(false);
      return;
    }

    const ids = (pivots ?? []).map((p) => p.id as string);
    const { data: assignments, error: assignmentError } = ids.length > 0
      ? await supabase
          .from("pivot_crop_assignments")
          .select("id, pivot_id, culture_id, name, planting_date")
          .in("pivot_id", ids)
          .eq("active", true)
          .eq("status", "ativa")
          .order("planting_date", { ascending: false })
      : { data: [], error: null };
    if (assignmentError) {
      setMessage(assignmentError.message);
      setLoading(false);
      return;
    }

    const rows = (assignments ?? []) as Parcel[];
    const cultureIds = Array.from(new Set(rows.map((row) => row.culture_id)));
    const assignmentIds = rows.map((row) => row.id);
    const [{ data: cultures }, anchorRes] = await Promise.all([
      cultureIds.length > 0
        ? supabase.from("cultures").select("id, name").in("id", cultureIds)
        : Promise.resolve({ data: [] }),
      assignmentIds.length > 0
        ? supabase
            .from("hydric_initial_conditions")
            .select("pivot_crop_assignment_id,effective_date,measured_at,source,moisture_value,moisture_unit,is_field_capacity,notes")
            .in("pivot_crop_assignment_id", assignmentIds)
            .order("effective_date", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const latest: Record<string, HydricAnchor> = {};
    for (const row of (anchorRes.data ?? []) as HydricAnchor[]) {
      if (!latest[row.pivot_crop_assignment_id]) latest[row.pivot_crop_assignment_id] = row;
    }

    setPivotNames(Object.fromEntries((pivots ?? []).map((p) => [p.id as string, p.name as string])));
    setCultureNames(Object.fromEntries((cultures ?? []).map((c) => [c.id as string, c.name as string])));
    setAnchors(latest);
    setParcels(rows);
    setParcelId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => parcels.find((row) => row.id === parcelId) ?? null, [parcels, parcelId]);
  const currentAnchor = selected ? anchors[selected.id] ?? null : null;

  const save = async () => {
    setMessage("");
    if (!activeFarmId || !selected) {
      setMessage("Selecione uma parcela ativa.");
      return;
    }
    if (!effectiveDate || !measuredTime) {
      setMessage("Informe a data e a hora da aferição.");
      return;
    }
    if (effectiveDate < selected.planting_date) {
      setMessage("A data da calibração não pode ser anterior ao plantio da parcela.");
      return;
    }
    if (effectiveDate > localDateInputValue()) {
      setMessage("A calibração hídrica não pode ser lançada em data futura.");
      return;
    }

    const measuredAt = new Date(`${effectiveDate}T${measuredTime}:00`);
    if (!Number.isFinite(measuredAt.getTime())) {
      setMessage("Data/hora da aferição inválida.");
      return;
    }

    let moistureValue: number | null = null;
    if (mode === "measured") {
      const numeric = Number(value.replace(",", "."));
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        setMessage("Informe uma medição entre 0 e 100 para a unidade selecionada.");
        return;
      }
      moistureValue = numeric;
    }

    setSaving(true);
    const payload = {
      farm_id: activeFarmId,
      pivot_crop_assignment_id: selected.id,
      effective_date: effectiveDate,
      measured_at: measuredAt.toISOString(),
      source: mode,
      moisture_value: moistureValue,
      moisture_unit: mode === "field_capacity_confirmed" ? "field_capacity_fraction" : unit,
      is_field_capacity: mode === "field_capacity_confirmed",
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("hydric_initial_conditions")
      .upsert(payload, { onConflict: "pivot_crop_assignment_id,effective_date" });

    setSaving(false);
    if (error) {
      setMessage(`Não foi possível salvar: ${error.message}`);
      return;
    }

    setMessage("Calibração hídrica datada salva. O V3 usará essa condição como âncora e calculará a partir do dia seguinte, quando houver clima operacional aprovado.");
    setNotes("");
    await load();
  };

  const currentCondition = currentAnchor
    ? currentAnchor.source === "field_capacity_confirmed"
      ? `CC confirmada em ${currentAnchor.effective_date}`
      : `${currentAnchor.moisture_value ?? "—"} ${unitLabel(currentAnchor.moisture_unit)} em ${currentAnchor.effective_date}`
    : "Nenhuma calibração datada";

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Calibrar Balanço Hídrico"
        descricao="Registre uma condição hídrica datada para iniciar ou recalibrar o motor V3 sem alterar a data de plantio"
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800/40 dark:bg-blue-900/10 dark:text-blue-200">
        A calibração é uma <b>âncora do estado hídrico</b>, não uma alteração do ciclo da cultura. O sistema preserva plantio e DAE. A condição informada representa o estado ao final da data selecionada; o balanço diário é retomado no dia seguinte para não contar chuva, irrigação ou ET duas vezes.
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-graphite-800">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm md:col-span-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">Parcela ativa</span>
            <select
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-white/[0.1] dark:bg-graphite-900 dark:text-white"
            >
              {parcels.length === 0 ? <option value="">Nenhuma parcela ativa</option> : null}
              {parcels.map((row) => (
                <option key={row.id} value={row.id}>
                  {pivotNames[row.pivot_id] ?? "Pivô"} · {cultureNames[row.culture_id] ?? "Cultura"}{row.name ? ` · ${row.name}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.04]">
            <span className="text-gray-500 dark:text-gray-400">Última calibração: </span>
            <strong className="text-gray-900 dark:text-white">{currentCondition}</strong>
            {currentAnchor?.measured_at ? (
              <span className="ml-2 text-gray-500 dark:text-gray-400">({new Date(currentAnchor.measured_at).toLocaleString("pt-BR")})</span>
            ) : null}
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Data da aferição</span>
            <input
              type="date"
              value={effectiveDate}
              max={localDateInputValue()}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-white/[0.1] dark:bg-graphite-900 dark:text-white"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Hora da aferição</span>
            <input
              type="time"
              value={measuredTime}
              onChange={(e) => setMeasuredTime(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-white/[0.1] dark:bg-graphite-900 dark:text-white"
            />
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
            <input type="radio" checked={mode === "measured"} onChange={() => setMode("measured")} className="mt-1" />
            <span>
              <strong className="block text-gray-900 dark:text-white">Medição de campo</strong>
              <span className="text-xs text-gray-500 dark:text-gray-400">Preferencial quando existe aferição quantitativa da umidade.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
            <input type="radio" checked={mode === "field_capacity_confirmed"} onChange={() => setMode("field_capacity_confirmed")} className="mt-1" />
            <span>
              <strong className="block text-gray-900 dark:text-white">Capacidade de campo confirmada</strong>
              <span className="text-xs text-gray-500 dark:text-gray-400">Use somente quando o perfil realmente estiver nessa condição.</span>
            </span>
          </label>

          {mode === "measured" ? (
            <>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Valor medido</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-white/[0.1] dark:bg-graphite-900 dark:text-white"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Unidade</span>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as typeof unit)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-white/[0.1] dark:bg-graphite-900 dark:text-white"
                >
                  <option value="field_capacity_fraction">% da capacidade de campo</option>
                  <option value="volume_pct">Umidade volumétrica (%)</option>
                  <option value="weight_pct">Umidade gravimétrica (%)</option>
                </select>
              </label>
            </>
          ) : null}

          <label className="space-y-1.5 text-sm md:col-span-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">Observação</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: aferição após checagem em três pontos do pivô; perfil uniforme."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-white/[0.1] dark:bg-graphite-900 dark:text-white"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !selected}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar calibração hídrica"}
          </button>
          <Link href="/balanco-hidrico" className="text-sm font-semibold text-emerald-700 underline">Voltar ao balanço</Link>
          {message ? <p className="w-full text-sm text-gray-600 dark:text-gray-300">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
