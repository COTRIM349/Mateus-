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
  initial_soil_moisture_pct: number | null;
  initial_moisture_unit: "field_capacity_fraction" | "volume_pct" | "weight_pct" | null;
  initial_moisture_is_cc: boolean | null;
  initial_condition_source: "measured" | "field_capacity_confirmed" | null;
}

export default function InicializarBalancoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [pivotNames, setPivotNames] = useState<Record<string, string>>({});
  const [cultureNames, setCultureNames] = useState<Record<string, string>>({});
  const [parcelId, setParcelId] = useState("");
  const [mode, setMode] = useState<"measured" | "field_capacity_confirmed">("measured");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"field_capacity_fraction" | "volume_pct" | "weight_pct">("field_capacity_fraction");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setParcels([]);
      setParcelId("");
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
          .select("id, pivot_id, culture_id, name, planting_date, initial_soil_moisture_pct, initial_moisture_unit, initial_moisture_is_cc, initial_condition_source")
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
    const { data: cultures } = cultureIds.length > 0
      ? await supabase.from("cultures").select("id, name").in("id", cultureIds)
      : { data: [] };

    setPivotNames(Object.fromEntries((pivots ?? []).map((p) => [p.id as string, p.name as string])));
    setCultureNames(Object.fromEntries((cultures ?? []).map((c) => [c.id as string, c.name as string])));
    setParcels(rows);
    setParcelId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "");
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => parcels.find((row) => row.id === parcelId) ?? null, [parcels, parcelId]);

  const save = async () => {
    setMessage("");
    if (!selected) {
      setMessage("Selecione uma parcela ativa.");
      return;
    }

    let payload: Record<string, unknown>;
    if (mode === "field_capacity_confirmed") {
      payload = {
        initial_soil_moisture_pct: null,
        initial_moisture_unit: "field_capacity_fraction",
        initial_moisture_is_cc: true,
        initial_condition_source: "field_capacity_confirmed",
      };
    } else {
      const numeric = Number(value.replace(",", "."));
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        setMessage("Informe uma medição entre 0 e 100 para a unidade selecionada.");
        return;
      }
      payload = {
        initial_soil_moisture_pct: numeric,
        initial_moisture_unit: unit,
        initial_moisture_is_cc: false,
        initial_condition_source: "measured",
      };
    }

    setSaving(true);
    const { error } = await supabase
      .from("pivot_crop_assignments")
      .update(payload)
      .eq("id", selected.id);
    if (error) {
      setSaving(false);
      setMessage(`Não foi possível salvar: ${error.message}`);
      return;
    }

    // A condição inicial altera toda a trajetória do ARM deste ciclo.
    const { error: invalidateError } = await supabase
      .from("water_balances")
      .delete()
      .eq("pivot_crop_assignment_id", selected.id)
      .eq("engine_version", "hydric-v2");
    setSaving(false);
    if (invalidateError) {
      setMessage(`Condição salva, mas houve erro ao invalidar balanços V2: ${invalidateError.message}`);
      return;
    }
    setMessage("Condição inicial confirmada. Abra o Balanço Hídrico e atualize para recalcular o ciclo V2.");
    await load();
  };

  const currentCondition = selected?.initial_condition_source === "field_capacity_confirmed"
    ? "Capacidade de campo confirmada"
    : selected?.initial_condition_source === "measured"
      ? `Medição: ${selected.initial_soil_moisture_pct ?? "—"} ${selected.initial_moisture_unit === "volume_pct" ? "% vol." : selected.initial_moisture_unit === "weight_pct" ? "% grav." : "% da CC"}`
      : "Não definida";

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Inicializar Balanço Hídrico"
        descricao="Defina uma condição inicial explícita e auditável para o ARM da parcela"
      />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800/40 dark:bg-blue-900/10 dark:text-blue-200">
        O sistema nunca assume capacidade de campo automaticamente. Use <b>medição de campo</b> sempre que houver umidade aferida. Se o perfil foi comprovadamente saturado e drenado até CC, selecione <b>Capacidade de campo confirmada</b>.
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
            <span className="text-gray-500 dark:text-gray-400">Condição atual: </span>
            <strong className="text-gray-900 dark:text-white">{currentCondition}</strong>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
            <input type="radio" checked={mode === "measured"} onChange={() => setMode("measured")} className="mt-1" />
            <span>
              <strong className="block text-gray-900 dark:text-white">Medição de campo</strong>
              <span className="text-xs text-gray-500 dark:text-gray-400">Preferencial quando existe aferição da umidade.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 dark:border-white/[0.08]">
            <input type="radio" checked={mode === "field_capacity_confirmed"} onChange={() => setMode("field_capacity_confirmed")} className="mt-1" />
            <span>
              <strong className="block text-gray-900 dark:text-white">Capacidade de campo confirmada</strong>
              <span className="text-xs text-gray-500 dark:text-gray-400">Use apenas quando essa condição for conhecida.</span>
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
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !selected}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Confirmar condição inicial"}
          </button>
          <Link href="/balanco-hidrico" className="text-sm font-semibold text-emerald-700 underline">Voltar ao balanço</Link>
          {message ? <p className="w-full text-sm text-gray-600 dark:text-gray-300">{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
