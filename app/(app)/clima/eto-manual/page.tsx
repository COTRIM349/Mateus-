"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, EmptyState, Input } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

// ── Datas (sempre em horario local, sem passar por UTC) ─────────────────────
function toIso(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function todayIso(): string {
  return toIso(new Date());
}
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // meio-dia evita problema de fuso/DST
}
// Segunda-feira da semana que contem a data informada.
function mondayOf(iso: string): string {
  const dt = parseLocal(iso);
  const dow = dt.getDay(); // 0 dom .. 6 sab
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  return toIso(dt);
}
// Os 7 dias (seg..dom) a partir de uma segunda-feira.
function weekDates(mondayIso: string): string[] {
  const base = parseLocal(mondayIso);
  return Array.from({ length: 7 }, (_, i) => {
    const t = new Date(base);
    t.setDate(base.getDate() + i);
    return toIso(t);
  });
}
function fmtBr(iso: string): string {
  return iso.split("-").reverse().join("/");
}

interface EtoRow {
  date: string;
  eto_mm: number;
}

interface WeekRow {
  monday: string;
  sunday: string;
  eto_mm: number;
  days: number; // quantos dos 7 dias estao lancados
}

export default function EtoManualPage() {
  const { activeFarmId, farms } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const activeFarmName = useMemo(
    () => farms.find((f) => f.id === activeFarmId)?.name ?? "",
    [farms, activeFarmId],
  );

  const [weekRef, setWeekRef] = useState(todayIso());
  const [eto, setEto] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<EtoRow[]>([]);
  const [loading, setLoading] = useState(false);

  const monday = useMemo(() => mondayOf(weekRef), [weekRef]);
  const week = useMemo(() => weekDates(monday), [monday]);

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setRows([]);
      return;
    }
    setLoading(true);
    // Ultimas ~12 semanas de lancamentos manuais.
    const since = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 84);
      return toIso(d);
    })();
    const { data, error } = await supabase
      .from("manual_eto_entries")
      .select("date,eto_mm")
      .eq("farm_id", activeFarmId)
      .gte("date", since)
      .order("date", { ascending: false });
    if (!error) setRows((data ?? []) as EtoRow[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Agrupa os lancamentos por semana (segunda-feira) para exibir uma linha por semana.
  const weeks = useMemo<WeekRow[]>(() => {
    const byWeek = new Map<string, { sum: number; days: number }>();
    for (const r of rows) {
      const mon = mondayOf(r.date);
      const cur = byWeek.get(mon) ?? { sum: 0, days: 0 };
      cur.sum += Number(r.eto_mm);
      cur.days += 1;
      byWeek.set(mon, cur);
    }
    return Array.from(byWeek.entries())
      .map(([mon, v]) => {
        const sun = weekDates(mon)[6];
        return { monday: mon, sunday: sun, eto_mm: v.sum / v.days, days: v.days };
      })
      .sort((a, b) => (a.monday < b.monday ? 1 : -1));
  }, [rows]);

  const etoNum = Number(eto.replace(",", "."));
  const valid = Number.isFinite(etoNum) && etoNum > 0 && !!activeFarmId;

  async function salvar() {
    if (!valid || !activeFarmId) return;
    setSaving(true);
    setMsg(null);
    const payload = week.map((date) => ({ farm_id: activeFarmId, date, eto_mm: etoNum }));
    const { error } = await supabase
      .from("manual_eto_entries")
      .upsert(payload, { onConflict: "farm_id,date" });
    setSaving(false);
    if (error) {
      setMsg({ ok: false, text: `Erro ao salvar: ${error.message}` });
      return;
    }
    setMsg({
      ok: true,
      text: `ETo de ${etoNum.toLocaleString("pt-BR")} mm/dia aplicada aos 7 dias da semana de ${fmtBr(monday)}.`,
    });
    setEto("");
    void load();
  }

  return (
    <div>
      <PageHeader
        titulo="ETo manual"
        descricao="Lancamento da evapotranspiracao de referencia media da semana (modo por clima, sem API)"
      />

      {!activeFarmId ? (
        <EmptyState title="Selecione uma fazenda" description="Escolha a fazenda ativa para lancar a ETo." />
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-4 text-sm font-semibold text-graphite-700 dark:text-gray-200">
              Fazenda: <span className="text-brand-700 dark:text-brand-300">{activeFarmName}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                id="eto-week"
                label="Semana (qualquer dia dela)"
                type="date"
                value={weekRef}
                onChange={(e) => setWeekRef(e.target.value)}
              />
              <Input
                id="eto-value"
                label="ETo media (mm/dia)"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="ex.: 6,0"
                value={eto}
                onChange={(e) => setEto(e.target.value)}
              />
              <div className="flex items-end">
                <Button onClick={salvar} disabled={!valid || saving} className="w-full">
                  {saving ? "Salvando..." : "Aplicar na semana"}
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-graphite-500 dark:text-gray-400">
              Aplica o mesmo valor aos 7 dias da semana de <b>{fmtBr(monday)}</b> a{" "}
              <b>{fmtBr(week[6])}</b>. O motor usa esta ETo para o balanco por clima; lancar de novo
              sobrescreve a semana.
            </p>
            {msg && (
              <p
                className={`mt-3 text-sm font-medium ${
                  msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {msg.text}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold text-graphite-700 dark:text-gray-200">
              Semanas lancadas (ultimas 12)
            </div>
            {loading ? (
              <p className="text-sm text-graphite-500 dark:text-gray-400">Carregando...</p>
            ) : weeks.length === 0 ? (
              <EmptyState title="Nenhum lancamento" description="Ainda nao ha ETo manual lancada para esta fazenda." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-graphite-500 dark:text-gray-400">
                      <th className="py-2 pr-4">Semana</th>
                      <th className="py-2 pr-4 text-right">ETo (mm/dia)</th>
                      <th className="py-2 pr-4 text-right">Dias lancados</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.monday} className="border-t border-gray-100 dark:border-white/[0.06]">
                        <td className="py-2 pr-4">
                          {fmtBr(w.monday)} – {fmtBr(w.sunday)}
                        </td>
                        <td className="py-2 pr-4 text-right font-semibold tabular-nums">
                          {w.eto_mm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {w.days < 7 ? (
                            <span className="text-amber-600 dark:text-amber-400">{w.days}/7</span>
                          ) : (
                            <span>7/7</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300"
                            onClick={() => {
                              setWeekRef(w.monday);
                              setEto(String(w.eto_mm).replace(".", ","));
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
