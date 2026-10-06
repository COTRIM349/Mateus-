"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, EmptyState, Input } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

// ── Types ───────────────────────────────────────────────────────────────────

interface SlotRow {
  pivot_id: string;
  pump_house_id: string | null;
  sequence_order: number;
  duration_h: number;
  gross_depth: number;
  volume_m3: number;
  slot_status: string;
  justification: string | null;
}

interface OSRow {
  pivotId: string;
  pivotName: string;
  cultureName: string;
  pumpHouseName: string;
  grossDepth: number;
  durationH: number;
  volumeM3: number;
  slotStatus: string;
  justification: string;
}

interface ManualFields {
  ok: boolean;
  percent: string;
  horimetroInicial: string;
  horimetroFinal: string;
  obs: string;
}

const emptyFields = (): ManualFields => ({ ok: false, percent: "", horimetroInicial: "", horimetroFinal: "", obs: "" });

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function OrdemServicoPage() {
  const { activeFarmId, profile } = useAuth();
  const supabase = createClient();

  const [osDate, setOsDate] = useState(todayISO());
  const [responsavel, setResponsavel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [rows, setRows] = useState<OSRow[]>([]);
  const [fields, setFields] = useState<Record<string, ManualFields>>({});

  const storageKey = useMemo(
    () => (activeFarmId ? `os:${activeFarmId}:${osDate}` : null),
    [activeFarmId, osDate],
  );

  // Carrega os campos manuais (OK, percentimetro, horimetro, observacao) salvos localmente.
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setFields(raw ? (JSON.parse(raw) as Record<string, ManualFields>) : {});
      const rawResp = window.localStorage.getItem(`${storageKey}:resp`);
      setResponsavel(rawResp ?? "");
    } catch {
      setFields({});
    }
  }, [storageKey]);

  const persistFields = useCallback(
    (next: Record<string, ManualFields>) => {
      setFields(next);
      if (storageKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
    },
    [storageKey],
  );

  const setField = useCallback(
    (pivotId: string, patch: Partial<ManualFields>) => {
      persistFields({ ...fields, [pivotId]: { ...(fields[pivotId] ?? emptyFields()), ...patch } });
    },
    [fields, persistFields],
  );

  // Carrega a programação gravada (daily_schedules + schedule_slots) para a data escolhida.
  const loadSchedule = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sched } = await supabase
        .from("daily_schedules")
        .select("id, status")
        .eq("farm_id", activeFarmId)
        .eq("schedule_date", osDate)
        .maybeSingle();

      if (!sched) {
        setScheduleStatus(null);
        setRows([]);
        setLoading(false);
        return;
      }
      setScheduleStatus((sched as { status: string }).status);
      const schedId = (sched as { id: string }).id;

      const [{ data: slotsData }, { data: pivotsData }, { data: phData }, { data: assignData }] =
        await Promise.all([
          supabase
            .from("schedule_slots")
            .select("pivot_id, pump_house_id, sequence_order, duration_h, gross_depth, volume_m3, slot_status, justification")
            .eq("schedule_id", schedId)
            .order("sequence_order"),
          supabase.from("pivots").select("id, name").eq("farm_id", activeFarmId),
          supabase.from("pump_houses").select("id, name").eq("farm_id", activeFarmId),
          supabase.from("pivot_crop_assignments").select("pivot_id, culture_id"),
        ]);

      const pivotName = new Map(((pivotsData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
      const phName = new Map(((phData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
      const pivotCulture = new Map(((assignData ?? []) as { pivot_id: string; culture_id: string }[]).map((a) => [a.pivot_id, a.culture_id]));

      const cultureIds = Array.from(new Set(Array.from(pivotCulture.values())));
      const cultureName = new Map<string, string>();
      if (cultureIds.length > 0) {
        const { data: cultData } = await supabase.from("cultures").select("id, name").in("id", cultureIds);
        ((cultData ?? []) as { id: string; name: string }[]).forEach((c) => cultureName.set(c.id, c.name));
      }

      const slots = (slotsData ?? []) as SlotRow[];
      const built: OSRow[] = slots
        // OS = o que vai rodar: ignora cancelado/concluido
        .filter((s) => s.slot_status !== "cancelado" && s.slot_status !== "concluido")
        .map((s) => ({
          pivotId: s.pivot_id,
          pivotName: pivotName.get(s.pivot_id) ?? s.pivot_id,
          cultureName: cultureName.get(pivotCulture.get(s.pivot_id) ?? "") ?? "—",
          pumpHouseName: (s.pump_house_id && phName.get(s.pump_house_id)) || "Sem casa de bomba",
          grossDepth: s.gross_depth ?? 0,
          durationH: s.duration_h ?? 0,
          volumeM3: s.volume_m3 ?? 0,
          slotStatus: s.slot_status,
          justification: s.justification ?? "",
        }));
      setRows(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar a programação");
    } finally {
      setLoading(false);
    }
  }, [activeFarmId, osDate, supabase]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Agrupa por casa de bomba (módulo), na ordem da sequência.
  const groups = useMemo(() => {
    const map = new Map<string, OSRow[]>();
    for (const r of rows) {
      if (!map.has(r.pumpHouseName)) map.set(r.pumpHouseName, []);
      map.get(r.pumpHouseName)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  const totalMarcados = rows.filter((r) => fields[r.pivotId]?.ok).length;

  const onResp = (v: string) => {
    setResponsavel(v);
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`${storageKey}:resp`, v);
      } catch {
        /* ignore */
      }
    }
  };

  function exportarCSV() {
    const linhas: string[][] = [];
    linhas.push([`ORDEM DE SERVICO - ${osDate}`, "", "Responsavel:", responsavel || (profile?.id ?? "")]);
    linhas.push([]);
    linhas.push(["Modulo", "OK", "Pivo", "Cultura", "Percentimetro", "Lamina(mm)", "Tempo(h)", "Horim.inicial", "Horim.final", "Observacao"]);
    for (const [mod, list] of groups) {
      for (const r of list) {
        const f = fields[r.pivotId] ?? emptyFields();
        linhas.push([
          mod,
          f.ok ? "X" : "",
          r.pivotName,
          r.cultureName,
          f.percent,
          r.grossDepth.toFixed(1),
          r.durationH.toFixed(1),
          f.horimetroInicial,
          f.horimetroFinal,
          f.obs,
        ]);
      }
    }
    const csv = linhas.map((l) => l.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OS_${osDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const acoes = (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <Input id="os-date" label="Data da OS" type="date" value={osDate} onChange={(e) => setOsDate(e.target.value)} />
      <Input id="os-resp" label="Responsável" value={responsavel} onChange={(e) => onResp(e.target.value)} placeholder="quem recebe a OS" />
      <Button variant="secondary" onClick={() => window.print()}>🖨️ Imprimir / PDF</Button>
      <Button variant="secondary" onClick={exportarCSV}>📗 Exportar CSV</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Ordem de Serviço"
        descricao="Formato Santa Colomba — por módulo (casa de bomba). Gerada manualmente a partir da programação do dia."
        acao={acoes}
      />

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block">
        <h2 className="text-lg font-bold">ORDEM DE SERVIÇO — {osDate.split("-").reverse().join("/")}</h2>
        <p className="text-sm">Karitel / Rio do Meio · Responsável: {responsavel || "—"}</p>
      </div>

      {loading ? (
        <Card>
          <p className="text-sm text-graphite-400">Carregando…</p>
        </Card>
      ) : error ? (
        <Card>
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sem programação para esta data"
          description="Gere a programação do dia na tela de Programação; a OS é montada a partir dela. Depois volte aqui, marque os pivôs e preencha percentímetro, horímetro e observações."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-sm text-graphite-500 print:hidden">
            <span>Pivôs na OS: <strong>{rows.length}</strong></span>
            <span>Marcados (OK): <strong>{totalMarcados}</strong></span>
            {scheduleStatus && <span>Programação: <strong>{scheduleStatus}</strong></span>}
          </div>

          {groups.map(([mod, list]) => (
            <Card key={mod} className="overflow-x-auto p-0">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
                <h3 className="text-sm font-bold text-brand-700 dark:text-brand-400">{mod}</h3>
                <span className="text-xs text-graphite-400">{list.length} pivô(s)</span>
              </div>
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-graphite-400 dark:border-white/[0.06]">
                    <th className="px-3 py-2 text-center">OK</th>
                    <th className="px-3 py-2 text-left">Pivô</th>
                    <th className="px-3 py-2 text-left">Cultura</th>
                    <th className="px-3 py-2 text-center">Percentímetro</th>
                    <th className="px-3 py-2 text-right">Lâmina (mm)</th>
                    <th className="px-3 py-2 text-right">Tempo (h)</th>
                    <th className="px-3 py-2 text-center">Horím. inicial</th>
                    <th className="px-3 py-2 text-center">Horím. final</th>
                    <th className="px-3 py-2 text-left">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const f = fields[r.pivotId] ?? emptyFields();
                    const bloqueado = r.slotStatus === "bloqueado";
                    return (
                      <tr
                        key={r.pivotId}
                        className={`border-b border-gray-50 dark:border-white/[0.04] ${bloqueado ? "bg-red-50/60 dark:bg-red-500/5" : f.ok ? "bg-brand-50/60 dark:bg-brand-500/5" : ""}`}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={f.ok}
                            onChange={(e) => setField(r.pivotId, { ok: e.target.checked })}
                            className="h-4 w-4 accent-brand-600"
                          />
                        </td>
                        <td className="px-3 py-2 text-left font-medium">
                          {r.pivotName}
                          {bloqueado && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">bloqueado</span>}
                        </td>
                        <td className="px-3 py-2 text-left text-graphite-500">{r.cultureName}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            value={f.percent}
                            onChange={(e) => setField(r.pivotId, { percent: e.target.value })}
                            className="w-20 rounded-md border border-gray-200 px-2 py-1 text-center text-sm dark:border-white/[0.1] dark:bg-white/[0.04]"
                            placeholder="%"
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.grossDepth.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.durationH.toFixed(1)}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            value={f.horimetroInicial}
                            onChange={(e) => setField(r.pivotId, { horimetroInicial: e.target.value })}
                            className="w-24 rounded-md border border-gray-200 px-2 py-1 text-center text-sm dark:border-white/[0.1] dark:bg-white/[0.04]"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            value={f.horimetroFinal}
                            onChange={(e) => setField(r.pivotId, { horimetroFinal: e.target.value })}
                            className="w-24 rounded-md border border-gray-200 px-2 py-1 text-center text-sm dark:border-white/[0.1] dark:bg-white/[0.04]"
                          />
                        </td>
                        <td className="px-3 py-2 text-left">
                          <input
                            value={f.obs}
                            onChange={(e) => setField(r.pivotId, { obs: e.target.value })}
                            className="w-full min-w-[160px] rounded-md border border-gray-200 px-2 py-1 text-sm dark:border-white/[0.1] dark:bg-white/[0.04]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))}

          <div className="hidden pt-8 text-sm print:block">
            <p>Operador: ____________________________ &nbsp;&nbsp;&nbsp; Encarregado: ____________________________</p>
          </div>
        </>
      )}
    </div>
  );
}
