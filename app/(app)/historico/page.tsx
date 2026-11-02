"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Input, Select, StatCard, Table, type Column } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { PrerequisiteNotice } from "@/components/onboarding";
import { createClient } from "@/lib/supabase/client";
import {
  PARCEL_CLOSE_REASON_LABELS,
  type ParcelCloseReason,
} from "@/modules/assignment/services";
import {
  EMPTY_HISTORY_FILTERS,
  HISTORY_COST_PENDING_NOTE,
  filterParcelRecords,
  hasHistorySearchFilters,
  parcelRecordState,
  summarizeClosedCycle,
  type HistoricParcelRow,
  type HistoryFilters,
} from "@/modules/history/services";

interface AssignmentRow {
  id: string;
  name: string | null;
  pivot_id: string;
  season_id: string;
  culture_id: string;
  planting_date: string | null;
  closed_at: string | null;
  close_reason: string | null;
  close_note: string | null;
  yield_kg_ha: number | null;
  total_water_applied_mm: number | null;
  total_energy_kwh: number | null;
  total_cost: number | null;
  status: string | null;
  active: boolean | null;
}

interface PivotLite { id: string; name: string; module_id: string | null }
interface Named { id: string; name: string }
interface EventLite {
  id: string;
  parcel_id: string | null;
  started_at: string;
  depth_mm: number;
  percentimeter_pct: number | null;
  volume_m3: number;
  operating_hours: number | null;
  energy_kwh: number | null;
  cost: number | null;
  notes: string | null;
}
interface SensoryLite {
  id: string;
  parcel_id: string | null;
  reading_date: string;
  note: number | null;
  depth_cm: number | null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length <= 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("pt-BR");
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function HistoricoOperacionalPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [modules, setModules] = useState<Named[]>([]);
  const [seasons, setSeasons] = useState<Named[]>([]);
  const [cultures, setCultures] = useState<Named[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [sensory, setSensory] = useState<SensoryLite[]>([]);
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_HISTORY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    const [pv, mo, ss, cu] = await Promise.all([
      supabase.from("pivots").select("id, name, module_id").eq("farm_id", activeFarmId).order("name"),
      supabase.from("production_modules").select("id, name").eq("farm_id", activeFarmId).order("name"),
      supabase.from("seasons").select("id, name").eq("farm_id", activeFarmId).order("start_date", { ascending: false }),
      supabase.from("cultures").select("id, name").eq("active", true).order("name"),
    ]);
    const pivotRows = (pv.data ?? []) as PivotLite[];
    setPivots(pivotRows);
    setModules((mo.data ?? []) as Named[]);
    setSeasons((ss.data ?? []) as Named[]);
    setCultures((cu.data ?? []) as Named[]);

    if (pivotRows.length === 0) {
      setAssignments([]);
      setEvents([]);
      setSensory([]);
      setLoading(false);
      return;
    }
    const pivotIds = pivotRows.map((p) => p.id);
    const { data: asg } = await supabase
      .from("pivot_crop_assignments")
      .select("id, name, pivot_id, season_id, culture_id, planting_date, closed_at, close_reason, close_note, yield_kg_ha, total_water_applied_mm, total_energy_kwh, total_cost, status, active")
      .in("pivot_id", pivotIds)
      .order("closed_at", { ascending: false });
    const assignmentRows = (asg ?? []) as AssignmentRow[];
    setAssignments(assignmentRows);

    const historicIds = assignmentRows
      .filter((a) => a.status === "encerrada" || a.status === "cancelada" || a.active === false)
      .map((a) => a.id);

    if (historicIds.length === 0) {
      setEvents([]);
      setSensory([]);
      setLoading(false);
      return;
    }

    const [ev, se] = await Promise.all([
      supabase
        .from("irrigation_events")
        .select("id, parcel_id, started_at, depth_mm, percentimeter_pct, volume_m3, operating_hours, energy_kwh, cost, notes")
        .in("parcel_id", historicIds)
        .order("started_at", { ascending: false }),
      supabase
        .from("soil_sensory_readings")
        .select("id, parcel_id, reading_date, note, depth_cm")
        .in("parcel_id", historicIds)
        .order("reading_date", { ascending: false }),
    ]);
    setEvents((ev.data ?? []) as EventLite[]);
    setSensory((se.data ?? []) as SensoryLite[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => { load(); }, [load]);

  const pivotMap = useMemo(() => new Map(pivots.map((p) => [p.id, p])), [pivots]);
  const moduleMap = useMemo(() => new Map(modules.map((m) => [m.id, m.name])), [modules]);
  const seasonMap = useMemo(() => new Map(seasons.map((s) => [s.id, s.name])), [seasons]);
  const cultureMap = useMemo(() => new Map(cultures.map((c) => [c.id, c.name])), [cultures]);

  const historicRows: HistoricParcelRow[] = useMemo(
    () =>
      assignments.map((a) => ({
        id: a.id,
        name: a.name,
        pivot_id: a.pivot_id,
        module_id: pivotMap.get(a.pivot_id)?.module_id ?? null,
        season_id: a.season_id,
        culture_id: a.culture_id,
        planting_date: a.planting_date,
        closed_at: a.closed_at,
        status: a.status,
        active: a.active,
      })),
    [assignments, pivotMap],
  );

  const hasSearch = useMemo(() => hasHistorySearchFilters(filters), [filters]);
  const filtered = useMemo(
    () => hasSearch ? filterParcelRecords(historicRows, filters) : [],
    [historicRows, filters, hasSearch],
  );
  const parcelOptions = useMemo(
    () => filterParcelRecords(historicRows, { ...filters, parcelId: "" }),
    [historicRows, filters],
  );

  const selectedCandidate = assignments.find((a) => a.id === selectedId) ?? null;
  const selected = selectedCandidate && parcelRecordState(selectedCandidate) === "historico"
    ? selectedCandidate
    : null;
  const selectedEvents = useMemo(
    () => events.filter((e) => e.parcel_id === selectedId),
    [events, selectedId],
  );
  const selectedSensory = useMemo(
    () => sensory.filter((s) => s.parcel_id === selectedId),
    [sensory, selectedId],
  );
  const summary = selected
    ? summarizeClosedCycle({
      events: selectedEvents,
      sensoryCount: selectedSensory.length,
      yieldKgHa: selected.yield_kg_ha,
      storedEnergyKwh: selected.total_energy_kwh,
      storedCost: selected.total_cost,
    })
    : null;

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value.trim() !== "").length,
    [filters],
  );
  const resultStats = useMemo(() => {
    let active = 0;
    let historic = 0;
    for (const row of filtered) {
      if (parcelRecordState(row) === "ativa") active += 1;
      else historic += 1;
    }
    return { total: filtered.length, active, historic };
  }, [filtered]);

  const patchFilter = (changes: Partial<HistoryFilters>) => {
    setSelectedId(null);
    setFilters((f) => ({ ...f, ...changes }));
  };

  const parcelColumns: Column<HistoricParcelRow>[] = [
    {
      header: "Parcela",
      render: (r) => {
        const state = parcelRecordState(r);
        const content = (
          <>
            <span className="block font-semibold text-graphite-900 dark:text-white">
              {r.name || pivotMap.get(r.pivot_id)?.name || "—"}
            </span>
            <span className="mt-0.5 block text-[11px] text-graphite-400 dark:text-gray-500">
              {pivotMap.get(r.pivot_id)?.name ?? "—"}
            </span>
          </>
        );
        return state === "historico" ? (
          <button
            type="button"
            className="group text-left transition-opacity hover:opacity-75"
            onClick={() => setSelectedId(r.id)}
          >
            {content}
          </button>
        ) : (
          <div className="text-left">{content}</div>
        );
      },
    },
    {
      header: "Status",
      render: (r) => {
        const state = parcelRecordState(r);
        return state === "ativa" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Ativa
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Histórico
          </span>
        );
      },
    },
    { header: "Safra", render: (r) => <span className="font-medium">{seasonMap.get(r.season_id) ?? "—"}</span> },
    { header: "Cultura", render: (r) => cultureMap.get(r.culture_id) ?? "—" },
    { header: "Módulo", render: (r) => (r.module_id ? moduleMap.get(r.module_id) ?? "—" : "—") },
    {
      header: "Período",
      render: (r) => (
        <div className="min-w-[150px]">
          <span className="block text-xs text-graphite-700 dark:text-gray-300">{fmtDate(r.planting_date)}</span>
          <span className="mt-0.5 block text-[11px] text-graphite-400 dark:text-gray-500">
            {parcelRecordState(r) === "ativa" ? "Em andamento" : `até ${fmtDate(r.closed_at)}`}
          </span>
        </div>
      ),
    },
    {
      header: "Ações",
      align: "right",
      render: (r) => parcelRecordState(r) === "historico" ? (
        <Button variant="ghost" size="sm" onClick={() => setSelectedId(r.id)}>
          Ver ciclo
        </Button>
      ) : (
        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Ciclo atual</span>
      ),
    },
  ];

  const eventColumns: Column<EventLite>[] = [
    { header: "Data", render: (r) => fmtWhen(r.started_at) },
    { header: "Percentímetro", render: (r) => r.percentimeter_pct != null ? `${r.percentimeter_pct.toFixed(0)}%` : "—" },
    { header: "Lâmina", render: (r) => <span className="tabular-nums">{r.depth_mm.toFixed(1)} mm</span> },
    { header: "Volume", render: (r) => <span className="tabular-nums">{r.volume_m3.toLocaleString("pt-BR")} m³</span> },
    { header: "Horas", render: (r) => r.operating_hours != null ? `${r.operating_hours.toFixed(1)} h` : "—" },
    { header: "Energia", render: (r) => r.energy_kwh != null ? `${r.energy_kwh.toFixed(1)} kWh` : "—" },
    { header: "Custo", render: (r) => r.cost != null ? r.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—" },
    { header: "Observação", render: (r) => <span className="text-xs text-graphite-500 dark:text-gray-400">{r.notes ?? "—"}</span> },
  ];

  const sensoryColumns: Column<SensoryLite>[] = [
    { header: "Data", render: (r) => fmtDate(r.reading_date) },
    { header: "Nota 1–10", render: (r) => r.note != null ? String(r.note) : "—" },
    { header: "Profundidade", render: (r) => r.depth_cm != null ? `${r.depth_cm} cm` : "—" },
  ];

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader titulo="Histórico operacional" descricao="Ciclos encerrados, irrigações e notas de campo — sem apagar o passado." />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="O histórico pertence à fazenda ativa."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Histórico operacional"
        descricao="Consulte parcelas por safra, módulo, pivô, cultura ou período e identifique rapidamente o que está ativo e o que já foi encerrado."
      />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/70 px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-graphite-900 dark:text-white">Consultar parcelas</h2>
                <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">
                  Preencha um ou mais campos. Os resultados aparecem somente após informar algum filtro.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ATIVA
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> HISTÓRICO
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Select
              id="filtro_safra"
              label="Safra"
              value={filters.seasonId}
              onChange={(e) => patchFilter({ seasonId: e.target.value })}
              options={seasons.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Select
              id="filtro_modulo"
              label="Módulo"
              value={filters.moduleId}
              onChange={(e) => patchFilter({ moduleId: e.target.value })}
              options={modules.map((m) => ({ value: m.id, label: m.name }))}
            />
            <Select
              id="filtro_pivo"
              label="Pivô"
              value={filters.pivotId}
              onChange={(e) => patchFilter({ pivotId: e.target.value, parcelId: "" })}
              options={pivots.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Select
              id="filtro_parcela"
              label="Parcela"
              value={filters.parcelId}
              onChange={(e) => patchFilter({ parcelId: e.target.value })}
              options={parcelOptions.map((p) => ({
                value: p.id,
                label: p.name || pivotMap.get(p.pivot_id)?.name || p.id,
              }))}
            />
            <Select
              id="filtro_cultura"
              label="Cultura"
              value={filters.cultureId}
              onChange={(e) => patchFilter({ cultureId: e.target.value })}
              options={cultures.map((cu) => ({ value: cu.id, label: cu.name }))}
            />
          </div>

          <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 dark:border-white/[0.06] lg:flex-row lg:items-end lg:justify-between">
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-[430px]">
              <Input
                id="periodo_de"
                label="Período de"
                type="date"
                value={filters.periodFrom}
                onChange={(e) => patchFilter({ periodFrom: e.target.value })}
              />
              <Input
                id="periodo_ate"
                label="Período até"
                type="date"
                value={filters.periodTo}
                onChange={(e) => patchFilter({ periodTo: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between gap-3 lg:justify-end">
              {hasSearch && (
                <span className="text-[11px] font-medium text-graphite-400 dark:text-gray-500">
                  {activeFilterCount} filtro{activeFilterCount === 1 ? "" : "s"} aplicado{activeFilterCount === 1 ? "" : "s"}
                </span>
              )}
              <Button
                variant="secondary"
                type="button"
                disabled={!hasSearch}
                onClick={() => { setFilters(EMPTY_HISTORY_FILTERS); setSelectedId(null); }}
              >
                Limpar filtros
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {!hasSearch ? (
        <Card className="border-dashed py-12 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a7 7 0 105.6 11.2L21 19.6M11 8v6m-3-3h6" />
            </svg>
          </div>
          <h3 className="mt-3 text-sm font-bold text-graphite-800 dark:text-white">Escolha os dados para consultar</h3>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-graphite-400 dark:text-gray-500">
            Selecione pelo menos uma safra, módulo, pivô, parcela, cultura ou período. Nenhum histórico é exibido antes da consulta.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-graphite-900 dark:text-white">Resultados da consulta</h2>
              <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">
                {loading ? "Atualizando registros..." : `${resultStats.total} registro${resultStats.total === 1 ? "" : "s"} encontrado${resultStats.total === 1 ? "" : "s"}`}
              </p>
            </div>

            {!loading && resultStats.total > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-graphite-600 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-300">
                  Total <strong className="ml-1 text-graphite-900 dark:text-white">{resultStats.total}</strong>
                </span>
                <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Ativas <strong className="ml-1">{resultStats.active}</strong>
                </span>
                <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  Histórico <strong className="ml-1">{resultStats.historic}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
                <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando registros...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-graphite-700 dark:text-gray-300">Nenhuma parcela encontrada</p>
                <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">Revise os filtros informados e tente uma combinação diferente.</p>
              </div>
            ) : (
              <Table columns={parcelColumns} data={filtered} getKey={(r) => r.id} />
            )}
          </div>
        </Card>
      )}

      {selected && summary && (
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="flex flex-col gap-4 border-l-4 border-brand-600 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-700 dark:text-brand-300">
                    Detalhes do ciclo
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Histórico
                  </span>
                </div>
                <h2 className="truncate text-base font-bold text-graphite-900 dark:text-white">
                  {selected.name || pivotMap.get(selected.pivot_id)?.name || "Ciclo encerrado"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-graphite-400 dark:text-gray-500">
                  {cultureMap.get(selected.culture_id) ?? "—"} · {seasonMap.get(selected.season_id) ?? "—"} · {fmtDate(selected.planting_date)} → {fmtDate(selected.closed_at)}
                  {selected.close_reason
                    ? ` · ${PARCEL_CLOSE_REASON_LABELS[selected.close_reason as ParcelCloseReason] ?? selected.close_reason}`
                    : ""}
                </p>
              </div>
              <Button variant="secondary" onClick={() => { window.location.href = "/vinculacao"; }}>
                Nova parcela neste pivô
              </Button>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard metric={{ id: "agua", title: "Água aplicada", value: `${summary.total_water_applied_mm.toFixed(0)} mm`, description: `${summary.irrigation_count} evento(s)` }} />
            <StatCard metric={{ id: "vol", title: "Volume", value: `${summary.total_volume_m3.toLocaleString("pt-BR")} m³`, description: "Soma dos eventos reais" }} />
            <StatCard metric={{ id: "sens", title: "Notas sensoriais", value: String(summary.sensory_count), description: "Escala 1–10, sem conversão para %CC" }} />
            <StatCard
              metric={{
                id: "custo",
                title: "Energia e custo",
                value: summary.cost_pending ? "—" : `R$ ${(summary.cost ?? 0).toLocaleString("pt-BR")}`,
                description: summary.cost_pending ? HISTORY_COST_PENDING_NOTE : `${summary.energy_kwh ?? "—"} kWh`,
              }}
            />
          </div>

          {selected.close_note && (
            <p className="text-sm text-graphite-500 dark:text-gray-400">Observação do encerramento: {selected.close_note}</p>
          )}

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-graphite-800 dark:text-white">Irrigações do ciclo</h3>
            {selectedEvents.length === 0 ? (
              <p className="py-4 text-sm text-graphite-400 dark:text-gray-500">Nenhum evento de irrigação neste ciclo.</p>
            ) : (
              <Table columns={eventColumns} data={selectedEvents} getKey={(r) => r.id} />
            )}
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold text-graphite-800 dark:text-white">Notas sensoriais do ciclo</h3>
            {selectedSensory.length === 0 ? (
              <p className="py-4 text-sm text-graphite-400 dark:text-gray-500">Nenhuma avaliação sensorial neste ciclo.</p>
            ) : (
              <Table columns={sensoryColumns} data={selectedSensory} getKey={(r) => r.id} />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
