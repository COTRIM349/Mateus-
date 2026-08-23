"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

interface ManualRainfallEntry {
  id: string;
  date: string;
  precipitation_mm: number;
  source: "pluviometer" | "field_observation";
  notes: string | null;
  measured_at: string;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function LancamentoChuvasPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [date, setDate] = useState(todayYmd());
  const [precipitation, setPrecipitation] = useState("");
  const [source, setSource] = useState<"pluviometer" | "field_observation">("pluviometer");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ManualRainfallEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 60);
    const { data, error } = await supabase
      .from("manual_rainfall_entries")
      .select("id, date, precipitation_mm, source, notes, measured_at")
      .eq("farm_id", activeFarmId)
      .gte("date", start.toISOString().slice(0, 10))
      .order("date", { ascending: false });
    if (error) {
      setMessage(`Erro ao carregar chuvas: ${error.message}`);
    } else {
      setRows((data ?? []) as ManualRainfallEntry[]);
    }
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setMessage("");
    if (!activeFarmId) {
      setMessage("Selecione uma fazenda.");
      return;
    }
    const mm = Number(precipitation.replace(",", "."));
    if (!date) {
      setMessage("Informe a data da chuva.");
      return;
    }
    if (!Number.isFinite(mm) || mm < 0 || mm > 500) {
      setMessage("Informe uma chuva válida entre 0 e 500 mm.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("manual_rainfall_entries")
      .upsert(
        {
          farm_id: activeFarmId,
          date,
          precipitation_mm: mm,
          source,
          notes: notes.trim() || null,
          measured_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "farm_id,date" },
      );
    setSaving(false);

    if (error) {
      setMessage(`Não foi possível salvar: ${error.message}`);
      return;
    }
    setMessage("Chuva salva. Balanços V2 posteriores foram invalidados para recálculo.");
    setPrecipitation("");
    setNotes("");
    await load();
  };

  const edit = (row: ManualRainfallEntry) => {
    setDate(row.date);
    setPrecipitation(String(row.precipitation_mm));
    setSource(row.source);
    setNotes(row.notes ?? "");
    setMessage("Registro carregado para edição.");
  };

  const remove = async (row: ManualRainfallEntry) => {
    setMessage("");
    const { error } = await supabase
      .from("manual_rainfall_entries")
      .delete()
      .eq("id", row.id);
    if (error) {
      setMessage(`Não foi possível excluir: ${error.message}`);
      return;
    }
    setMessage("Registro excluído. Balanços V2 posteriores foram invalidados para recálculo.");
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Lançamento de Chuvas"
        descricao="Registro da precipitação medida em campo para corrigir a chuva usada no manejo"
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-graphite-700 dark:bg-graphite-800">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Chuva medida</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            A chuva manual tem prioridade sobre a precipitação virtual, mas não substitui a ETo aprovada da estação.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Data</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayYmd()}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-graphite-600 dark:bg-graphite-900 dark:text-white"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Chuva (mm)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="500"
              step="0.1"
              value={precipitation}
              onChange={(e) => setPrecipitation(e.target.value)}
              placeholder="Ex.: 18,5"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-graphite-600 dark:bg-graphite-900 dark:text-white"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Origem</span>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as "pluviometer" | "field_observation")}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-graphite-600 dark:bg-graphite-900 dark:text-white"
            >
              <option value="pluviometer">Pluviômetro</option>
              <option value="field_observation">Observação de campo</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Observação</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-graphite-600 dark:bg-graphite-900 dark:text-white"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !activeFarmId}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar chuva"}
          </button>
          {message ? <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p> : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-graphite-700 dark:bg-graphite-800">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-graphite-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Últimos 60 dias</h2>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-gray-500">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">Nenhuma chuva manual lançada neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 dark:bg-graphite-900 dark:text-gray-300">
                <tr>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Chuva</th>
                  <th className="px-5 py-3">Origem</th>
                  <th className="px-5 py-3">Observação</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-graphite-700">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-gray-800 dark:text-gray-200">{row.date}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white">{row.precipitation_mm.toFixed(1)} mm</td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300">
                      {row.source === "pluviometer" ? "Pluviômetro" : "Observação de campo"}
                    </td>
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-300">{row.notes || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => edit(row)} className="mr-3 font-medium text-emerald-700 hover:underline">
                        Editar
                      </button>
                      <button type="button" onClick={() => remove(row)} className="font-medium text-red-600 hover:underline">
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
