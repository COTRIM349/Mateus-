"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, EmptyState, Input } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";

// Cor da marca Santa Colomba (extraida do material da fazenda)
const BRAND = "#286A6C";
const BRAND_SOFT = "#E7F0F0";
const LOGO = "/brand/santa-colomba-logo-branca.png";

// ── Types ───────────────────────────────────────────────────────────────────

interface SlotRow {
  pivot_id: string;
  sequence_order: number;
  duration_h: number;
  gross_depth: number;
  slot_status: string;
  justification: string | null;
}

interface OSRow {
  pivotId: string;
  pivotName: string;
  cultureName: string;
  casaName: string;
  moduleName: string;
  pumpPower: number;
  grossDepth: number;
  durationH: number;
  slotStatus: string;
}

interface ManualFields {
  percent: string;
  horimetroInicial: string;
  horimetroFinal: string;
  obs: string;
}

const emptyFields = (): ManualFields => ({ percent: "", horimetroInicial: "", horimetroFinal: "", obs: "" });
const todayISO = () => new Date().toISOString().slice(0, 10);
const brBR = (n: number, d = 1) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// ── Page ────────────────────────────────────────────────────────────────────

export default function OrdemServicoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [osDate, setOsDate] = useState(todayISO());
  const [responsavel, setResponsavel] = useState("");
  const [farmName, setFarmName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OSRow[]>([]);
  const [fields, setFields] = useState<Record<string, ManualFields>>({});

  const storageKey = useMemo(() => (activeFarmId ? `os:${activeFarmId}:${osDate}` : null), [activeFarmId, osDate]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setFields(raw ? (JSON.parse(raw) as Record<string, ManualFields>) : {});
    } catch {
      setFields({});
    }
    try {
      setResponsavel(window.localStorage.getItem(`os:resp:${activeFarmId}`) ?? "");
    } catch {
      /* ignore */
    }
  }, [storageKey, activeFarmId]);

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
    (pivotId: string, patch: Partial<ManualFields>) =>
      persistFields({ ...fields, [pivotId]: { ...(fields[pivotId] ?? emptyFields()), ...patch } }),
    [fields, persistFields],
  );

  const onResp = (v: string) => {
    setResponsavel(v);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`os:resp:${activeFarmId}`, v);
      } catch {
        /* ignore */
      }
    }
  };

  const loadSchedule = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: farm } = await supabase.from("farms").select("name").eq("id", activeFarmId).maybeSingle();
      setFarmName((farm as { name: string } | null)?.name ?? "");

      const { data: sched } = await supabase
        .from("daily_schedules")
        .select("id")
        .eq("farm_id", activeFarmId)
        .eq("schedule_date", osDate)
        .maybeSingle();

      if (!sched) {
        setRows([]);
        setLoading(false);
        return;
      }
      const schedId = (sched as { id: string }).id;

      const [{ data: slotsData }, { data: pivotsData }, { data: modData }, { data: phData }, { data: phpData }, { data: assignData }] =
        await Promise.all([
          supabase
            .from("schedule_slots")
            .select("pivot_id, sequence_order, duration_h, gross_depth, slot_status, justification")
            .eq("schedule_id", schedId)
            .order("sequence_order"),
          supabase.from("pivots").select("id, name, pump_power, module_id").eq("farm_id", activeFarmId),
          supabase.from("production_modules").select("id, name").eq("farm_id", activeFarmId),
          supabase.from("pump_houses").select("id, name").eq("farm_id", activeFarmId),
          supabase.from("pump_house_pivots").select("pivot_id, pump_house_id"),
          supabase.from("pivot_crop_assignments").select("pivot_id, culture_id"),
        ]);

      const pivotById = new Map(
        ((pivotsData ?? []) as { id: string; name: string; pump_power: number; module_id: string | null }[]).map((p) => [p.id, p]),
      );
      const modName = new Map(((modData ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
      const phName = new Map(((phData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
      const casaByPivot = new Map(
        ((phpData ?? []) as { pivot_id: string; pump_house_id: string }[]).map((pp) => [pp.pivot_id, pp.pump_house_id]),
      );
      const cultureByPivot = new Map(
        ((assignData ?? []) as { pivot_id: string; culture_id: string }[]).map((a) => [a.pivot_id, a.culture_id]),
      );

      const cultureIds = Array.from(new Set(Array.from(cultureByPivot.values())));
      const cultureName = new Map<string, string>();
      if (cultureIds.length > 0) {
        const { data: cultData } = await supabase.from("cultures").select("id, name").in("id", cultureIds);
        ((cultData ?? []) as { id: string; name: string }[]).forEach((c) => cultureName.set(c.id, c.name));
      }

      const slots = (slotsData ?? []) as SlotRow[];
      const built: OSRow[] = slots
        .filter((s) => s.slot_status !== "cancelado" && s.slot_status !== "concluido")
        .map((s) => {
          const piv = pivotById.get(s.pivot_id);
          const casaId = casaByPivot.get(s.pivot_id);
          return {
            pivotId: s.pivot_id,
            pivotName: piv?.name ?? s.pivot_id,
            cultureName: cultureName.get(cultureByPivot.get(s.pivot_id) ?? "") ?? "—",
            casaName: (casaId && phName.get(casaId)) || "—",
            moduleName: (piv?.module_id && modName.get(piv.module_id)) || "Sem módulo",
            pumpPower: piv?.pump_power ?? 0,
            grossDepth: s.gross_depth ?? 0,
            durationH: s.duration_h ?? 0,
            slotStatus: s.slot_status,
          };
        });
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

  // Agrupa por MÓDULO (production_modules)
  const groups = useMemo(() => {
    const map = new Map<string, OSRow[]>();
    for (const r of rows) {
      if (!map.has(r.moduleName)) map.set(r.moduleName, []);
      map.get(r.moduleName)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [rows]);

  const demandaModulo = (list: OSRow[]) => list.reduce((acc, r) => acc + (r.pumpPower || 0), 0);

  function exportarCSV() {
    const linhas: string[][] = [];
    linhas.push([`ORDEM DE SERVICO - ${osDate}`, "", "Responsavel:", responsavel]);
    linhas.push([]);
    for (const [mod, list] of groups) {
      linhas.push([`MODULO: ${mod}`]);
      linhas.push(["Casa", "Pivo", "Cultura", "Percentimetro", "Lamina(mm)", "Tempo(h)", "Horim.inicial", "Horim.final", "Observacoes/Orientacoes"]);
      for (const r of list) {
        const f = fields[r.pivotId] ?? emptyFields();
        linhas.push([r.casaName, r.pivotName, r.cultureName, f.percent, brBR(r.grossDepth), brBR(r.durationH), f.horimetroInicial, f.horimetroFinal, f.obs]);
      }
      linhas.push([`Demanda da OS (potencia dos pivos): ${brBR(demandaModulo(list), 0)} kW`]);
      linhas.push([]);
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

  const dataBR = osDate.split("-").reverse().join("/");

  const acoes = (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <Input id="os-date" label="Data da OS" type="date" value={osDate} onChange={(e) => setOsDate(e.target.value)} />
      <Input id="os-resp" label="Responsável" value={responsavel} onChange={(e) => onResp(e.target.value)} placeholder="nome" />
      <Button variant="secondary" onClick={() => window.print()}>🖨️ Imprimir / PDF</Button>
      <Button variant="secondary" onClick={exportarCSV}>📗 Exportar CSV</Button>
    </div>
  );

  const thCls = "px-3 py-2 text-[11px] font-bold uppercase tracking-wide";
  const tdInput = "w-full rounded-md border border-gray-200 px-2 py-1 text-sm dark:border-white/[0.1] dark:bg-white/[0.04] print:border-0";

  return (
    <div className="space-y-6">
      <PageHeader titulo="Ordem de Serviço" descricao="Formato Santa Colomba — por módulo (casa de bomba). Gerada manualmente a partir da programação do dia." acao={acoes} />

      {/* Cabeçalho da marca (tela e impressão) */}
      <div
        className="flex items-center justify-between rounded-2xl px-6 py-4 text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
        style={{ backgroundColor: BRAND }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Santa Colomba" className="h-12 w-auto" />
        <div className="text-right">
          <div className="text-lg font-extrabold tracking-wide">ORDEM DE SERVIÇO</div>
          <div className="text-sm opacity-90">{dataBR}{farmName ? ` · ${farmName}` : ""}</div>
        </div>
      </div>

      {loading ? (
        <Card><p className="text-sm text-graphite-400">Carregando…</p></Card>
      ) : error ? (
        <Card><p className="text-sm text-red-600">{error}</p></Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sem programação para esta data"
          description="Gere a programação do dia na tela de Programação; a OS é montada a partir dela. Depois volte aqui, preencha percentímetro, horímetro e observações, e imprima."
        />
      ) : (
        <>
          {groups.map(([mod, list]) => (
            <Card key={mod} className="overflow-x-auto p-0">
              <div className="px-5 py-2.5 text-sm font-bold text-white [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" style={{ backgroundColor: BRAND }}>
                {mod}
              </div>
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr style={{ backgroundColor: BRAND_SOFT }} className="text-[#1f4d4e]">
                    <th className={`${thCls} text-center`}>Casa</th>
                    <th className={`${thCls} text-left`}>Pivô</th>
                    <th className={`${thCls} text-left`}>Cultura</th>
                    <th className={`${thCls} text-center`}>Percentímetro</th>
                    <th className={`${thCls} text-right`}>Lâmina (mm)</th>
                    <th className={`${thCls} text-right`}>Tempo (h)</th>
                    <th className={`${thCls} text-center`}>Horím. inicial</th>
                    <th className={`${thCls} text-center`}>Horím. final</th>
                    <th className={`${thCls} text-left`}>Observações / Orientações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const f = fields[r.pivotId] ?? emptyFields();
                    const bloqueado = r.slotStatus === "bloqueado";
                    return (
                      <tr key={r.pivotId} className={`border-b border-gray-50 dark:border-white/[0.04] ${bloqueado ? "bg-red-50/60 dark:bg-red-500/5" : ""}`}>
                        <td className="px-3 py-2 text-center">{r.casaName}</td>
                        <td className="px-3 py-2 text-left font-semibold">
                          {r.pivotName}
                          {bloqueado && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">bloqueado</span>}
                        </td>
                        <td className="px-3 py-2 text-left text-graphite-500">{r.cultureName}</td>
                        <td className="px-3 py-2 text-center">
                          <input value={f.percent} onChange={(e) => setField(r.pivotId, { percent: e.target.value })} className={`${tdInput} w-20 text-center`} placeholder="%" />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{brBR(r.grossDepth)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{brBR(r.durationH)}</td>
                        <td className="px-3 py-2 text-center">
                          <input value={f.horimetroInicial} onChange={(e) => setField(r.pivotId, { horimetroInicial: e.target.value })} className={`${tdInput} w-24 text-center`} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input value={f.horimetroFinal} onChange={(e) => setField(r.pivotId, { horimetroFinal: e.target.value })} className={`${tdInput} w-24 text-center`} />
                        </td>
                        <td className="px-3 py-2 text-left">
                          <input value={f.obs} onChange={(e) => setField(r.pivotId, { obs: e.target.value })} className={`${tdInput} min-w-[180px]`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: BRAND_SOFT }} className="font-bold text-[#1f4d4e]">
                    <td colSpan={6} className="px-3 py-2 text-left">Demanda da OS (potência dos pivôs)</td>
                    <td colSpan={3} className="px-3 py-2 text-left">{brBR(demandaModulo(list), 0)} kW</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          ))}

          {/* Assinatura do responsável */}
          <div className="mt-10 max-w-sm print:mt-14">
            <div className="text-center text-sm font-bold text-graphite-900 dark:text-white">{responsavel || "—"}</div>
            <div className="mt-1 border-t border-gray-700 pt-1 text-center text-sm text-graphite-600 dark:text-gray-300">Responsável</div>
          </div>
        </>
      )}
    </div>
  );
}
