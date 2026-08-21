"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, EmptyState, Input, Select, StatCard, Table, Tabs, type Column } from "@/components/ui";
import { ManejoChart, ManejoSeriesPicker } from "@/components/charts/ManejoChart";
import { PrerequisiteNotice } from "@/components/onboarding";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { formatBRL, formatNumber } from "@/utils/format";
import {
  type ReportType,
  type ExportFormat,
  type AuditAction,
  type AuditLogEntry,
  REPORT_TYPE_CONFIG,
  EXPORT_FORMAT_CONFIG,
  AUDIT_ACTION_CONFIG,
  EMPTY_MANAGEMENT_FILTERS,
  buildManagementRows,
  chartRowsForEntity,
  exportManagementCsv,
  filterManagementRows,
  initialManejoVisibility,
  summarizeOperational,
  groupByPeriod,
  groupByPivot,
  groupByParcel,
  groupByCulture,
  filterEvents,
  type ManagementReportFilters,
  type ManagementReportRow,
  type StoredBalanceForReport,
  type AssignmentForReport,
  type EventForReport,
  type SensoryForReport,
  type ManejoSeriesKey,
  type OperationalGroupRow,
} from "@/modules/reports/services";

const TABS = [
  { id: "relatorios", label: "Relatórios" },
  { id: "indicadores", label: "Indicadores" },
  { id: "auditoria", label: "Auditoria" },
];

interface PivotLite { id: string; name: string }
interface Named { id: string; name: string }

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return formatBRL(n);
}

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function groupCsv(rows: OperationalGroupRow[]): string {
  const headers = "Grupo;Dias;Irrigação (mm);Chuva (mm);ETc (mm);ARM médio (mm);% da CC;Eventos;Volume (m³);Energia (kWh);Custo (R$)";
  const lines = rows.map((r) => [
    r.label, r.days, r.irrigationMm, r.rainMm, r.etcMm, r.avgArmMm, r.avgMoisturePctCc,
    r.eventCount, r.volumeM3, r.energyKwh ?? "", r.cost ?? "",
  ].join(";"));
  return "\uFEFF" + [headers, ...lines].join("\n");
}

export default function RelatoriosPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("relatorios");
  const [selectedReportType, setSelectedReportType] = useState<ReportType>("manejo");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [filters, setFilters] = useState<ManagementReportFilters>(EMPTY_MANAGEMENT_FILTERS);
  const [loading, setLoading] = useState(false);

  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [assignments, setAssignments] = useState<AssignmentForReport[]>([]);
  const [cultures, setCultures] = useState<Named[]>([]);
  const [balances, setBalances] = useState<StoredBalanceForReport[]>([]);
  const [events, setEvents] = useState<EventForReport[]>([]);
  const [sensory, setSensory] = useState<SensoryForReport[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  const load = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    const [pv, cu, audit] = await Promise.all([
      supabase.from("pivots").select("id, name").eq("farm_id", activeFarmId).order("name"),
      supabase.from("cultures").select("id, name").eq("active", true).order("name"),
      supabase.from("audit_log").select("*").eq("farm_id", activeFarmId).order("created_at", { ascending: false }).limit(200),
    ]);
    const pivotRows = (pv.data ?? []) as PivotLite[];
    setPivots(pivotRows);
    setCultures((cu.data ?? []) as Named[]);
    setAuditLog(((audit.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      farmId: String(r.farm_id),
      userId: String(r.user_id ?? ""),
      userName: String(r.user_name ?? ""),
      action: (r.action as AuditAction) ?? "update",
      entityType: String(r.entity_type ?? ""),
      entityId: String(r.entity_id ?? ""),
      entityName: String(r.entity_name ?? ""),
      changes: (r.changes as AuditLogEntry["changes"]) ?? {},
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      ipAddress: String(r.ip_address ?? ""),
      createdAt: String(r.created_at ?? ""),
    })));

    if (pivotRows.length === 0) {
      setAssignments([]);
      setBalances([]);
      setEvents([]);
      setSensory([]);
      setLoading(false);
      return;
    }
    const pivotIds = pivotRows.map((p) => p.id);
    const [asg, ev, sen] = await Promise.all([
      supabase.from("pivot_crop_assignments").select("id, pivot_id, name, culture_id").in("pivot_id", pivotIds),
      supabase.from("irrigation_events").select("pivot_id, parcel_id, started_at, depth_mm, volume_m3, operating_hours, energy_kwh, cost").in("pivot_id", pivotIds).order("started_at", { ascending: false }).limit(2000),
      supabase.from("soil_sensory_readings").select("reading_date, pivot_id, parcel_id, note, layer_1_note, layer_2_note, layer_3_note").eq("farm_id", activeFarmId).order("reading_date", { ascending: false }).limit(2000),
    ]);
    const asgRows = (asg.data ?? []) as AssignmentForReport[];
    setAssignments(asgRows);
    setEvents((ev.data ?? []) as EventForReport[]);
    setSensory((sen.data ?? []) as SensoryForReport[]);

    if (asgRows.length === 0) {
      setBalances([]);
      setLoading(false);
      return;
    }
    const asgIds = asgRows.map((a) => a.id);
    const { data: wb } = await supabase
      .from("water_balances")
      .select("date, pivot_crop_assignment_id, et0, kc, etc, precipitation, effective_precipitation, applied_depth, cad, afd, soil_storage, gross_depth, net_depth, ks, kl, ky, field_capacity, wilting_point, safety_moisture_mm, moisture_pct_cc, safety_pct_cc, phase, dae, root_depth, etc_potential")
      .in("pivot_crop_assignment_id", asgIds)
      .order("date", { ascending: true })
      .limit(8000);
    setBalances((wb ?? []) as StoredBalanceForReport[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => { load(); }, [load]);

  const allRows = useMemo(
    () => buildManagementRows({
      balances,
      assignments,
      pivots,
      cultures,
      events,
      sensory,
    }),
    [balances, assignments, pivots, cultures, events, sensory],
  );

  const filteredRows = useMemo(() => filterManagementRows(allRows, filters), [allRows, filters]);
  const filteredEvents = useMemo(() => {
    return filterEvents(events, {
      periodFrom: filters.periodFrom || undefined,
      periodTo: filters.periodTo || undefined,
      pivotIds: filters.pivotId ? new Set([filters.pivotId]) : undefined,
      parcelIds: filters.parcelId ? new Set([filters.parcelId]) : undefined,
    });
  }, [events, filters]);

  const totals = useMemo(() => summarizeOperational(filteredRows, filteredEvents), [filteredRows, filteredEvents]);
  const chartRows = useMemo(() => chartRowsForEntity(filteredRows), [filteredRows]);

  const hasData = allRows.length > 0 || events.length > 0;

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader titulo="Relatórios" descricao="Manejo de irrigação a partir do balanço, dos eventos e da nota sensorial." />
        <PrerequisiteNotice title="Selecione uma fazenda" description="Os relatórios usam os dados operacionais da fazenda ativa." actionLabel="Ir para Fazendas" actionHref="/fazendas" />
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader titulo="Relatórios" descricao="Manejo de irrigação a partir do balanço, dos eventos e da nota sensorial." />
        <div className="mt-8 flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Relatórios"
        descricao="Relatório de manejo com ETo, ETc, coeficientes, solo, irrigação e nota sensorial. Sem relatório executivo."
      />
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "relatorios" && (
          <TabRelatorios
            selectedType={selectedReportType}
            onSelectType={setSelectedReportType}
            selectedFormat={selectedFormat}
            onSelectFormat={setSelectedFormat}
            filters={filters}
            onFilters={setFilters}
            pivots={pivots}
            parcels={assignments}
            cultures={cultures}
            rows={filteredRows}
            chartRows={chartRows}
            events={filteredEvents}
            totals={totals}
            hasData={hasData}
          />
        )}
        {activeTab === "indicadores" && (
          <TabIndicadores rows={filteredRows} totals={totals} />
        )}
        {activeTab === "auditoria" && <TabAuditoria auditLog={auditLog} />}
      </div>
    </div>
  );
}

function TabRelatorios({
  selectedType, onSelectType, selectedFormat, onSelectFormat,
  filters, onFilters, pivots, parcels, cultures, rows, chartRows, events, totals, hasData,
}: {
  selectedType: ReportType;
  onSelectType: (t: ReportType) => void;
  selectedFormat: ExportFormat;
  onSelectFormat: (f: ExportFormat) => void;
  filters: ManagementReportFilters;
  onFilters: (f: ManagementReportFilters) => void;
  pivots: PivotLite[];
  parcels: AssignmentForReport[];
  cultures: Named[];
  rows: ManagementReportRow[];
  chartRows: ManagementReportRow[];
  events: EventForReport[];
  totals: ReturnType<typeof summarizeOperational>;
  hasData: boolean;
}) {
  const [visible, setVisible] = useState(() => initialManejoVisibility());
  const reportTypes = Object.entries(REPORT_TYPE_CONFIG) as Array<[ReportType, typeof REPORT_TYPE_CONFIG[ReportType]]>;
  const formats = Object.entries(EXPORT_FORMAT_CONFIG) as Array<[ExportFormat, typeof EXPORT_FORMAT_CONFIG[ExportFormat]]>;
  const config = REPORT_TYPE_CONFIG[selectedType];
  const patch = (p: Partial<ManagementReportFilters>) => onFilters({ ...filters, ...p });

  const byPeriod = useMemo(() => {
    const grain = selectedType === "mensal" ? "month" : selectedType === "diario" ? "day" : "week";
    return groupByPeriod(rows, events, grain);
  }, [rows, events, selectedType]);
  const byPivot = useMemo(() => groupByPivot(rows, events), [rows, events]);
  const byParcel = useMemo(() => groupByParcel(rows, events), [rows, events]);
  const byCulture = useMemo(() => groupByCulture(rows, events), [rows, events]);

  const handleExport = () => {
    const stamp = `${filters.periodFrom || "inicio"}_${filters.periodTo || "fim"}`;
    if (selectedType === "manejo") {
      downloadCsv(`relatorio_manejo_${stamp}.csv`, exportManagementCsv(rows));
      return;
    }
    const groups =
      selectedType === "por_pivo" ? byPivot
        : selectedType === "por_parcela" ? byParcel
          : selectedType === "por_cultura" ? byCulture
            : selectedType === "energetico" || selectedType === "financeiro" ? byPivot
              : byPeriod;
    downloadCsv(`relatorio_${selectedType}_${stamp}.csv`, groupCsv(groups));
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {reportTypes.map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => onSelectType(key)}
            className={`rounded-xl border p-4 text-left transition-all ${
              selectedType === key
                ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                : "border-gray-100 hover:border-gray-300 dark:border-white/[0.06] dark:hover:border-white/[0.12]"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                selectedType === key
                  ? "bg-brand-500 text-white"
                  : "bg-gray-50/80 text-gray-600 dark:bg-white/[0.03] dark:text-gray-500"
              }`}>
                {cfg.icon}
              </span>
              <span className="text-sm font-semibold text-graphite-900 dark:text-white">{cfg.label}</span>
            </div>
            <p className="text-xs text-graphite-400 dark:text-gray-500">{cfg.description}</p>
          </button>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input id="filtro_de" label="De" type="date" value={filters.periodFrom} onChange={(e) => patch({ periodFrom: e.target.value })} />
          <Input id="filtro_ate" label="Até" type="date" value={filters.periodTo} onChange={(e) => patch({ periodTo: e.target.value })} />
          <Select id="filtro_pivo" label="Pivô" value={filters.pivotId} onChange={(e) => patch({ pivotId: e.target.value })} options={pivots.map((p) => ({ value: p.id, label: p.name }))} />
          <Select id="filtro_parcela" label="Parcela" value={filters.parcelId} onChange={(e) => patch({ parcelId: e.target.value })} options={parcels.map((p) => ({ value: p.id, label: p.name || p.id.slice(0, 8) }))} />
          <Select id="filtro_cultura" label="Cultura" value={filters.cultureId} onChange={(e) => patch({ cultureId: e.target.value })} options={cultures.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-graphite-900 dark:text-white">{config.label}</h3>
            <p className="text-sm text-graphite-400 dark:text-gray-500">{config.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl border border-gray-100 dark:border-white/[0.06]">
              {formats.map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onSelectFormat(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
                    selectedFormat === key
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 hover:bg-gray-50/80 dark:text-gray-500 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <Button disabled={!hasData || (selectedFormat !== "csv")} onClick={handleExport}>
              Exportar CSV
            </Button>
          </div>
        </div>
        {selectedFormat !== "csv" && (
          <p className="mt-3 text-xs text-graphite-400 dark:text-gray-500">PDF e Excel ficam para uma etapa posterior — a exportação operacional é CSV.</p>
        )}
      </Card>

      {!hasData ? (
        <EmptyState
          title="Nenhum dado operacional para relatórios"
          description="Calcule o balanço hídrico, registre irrigação e notas sensoriais. O relatório de manejo nasce desses registros — não de um painel executivo."
        />
      ) : selectedType === "manejo" ? (
        <ManejoPreview rows={rows} chartRows={chartRows} visible={visible} onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))} totals={totals} />
      ) : (
        <GroupPreview
          type={selectedType}
          totals={totals}
          byPeriod={byPeriod}
          byPivot={byPivot}
          byParcel={byParcel}
          byCulture={byCulture}
        />
      )}
    </div>
  );
}

function ManejoPreview({
  rows, chartRows, visible, onToggle, totals,
}: {
  rows: ManagementReportRow[];
  chartRows: ManagementReportRow[];
  visible: Record<ManejoSeriesKey, boolean>;
  onToggle: (k: ManejoSeriesKey) => void;
  totals: ReturnType<typeof summarizeOperational>;
}) {
  const columns: Column<ManagementReportRow>[] = [
    { header: "Data", render: (r) => r.date },
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivotName}</span> },
    { header: "Parcela", render: (r) => r.parcelName ?? "—" },
    { header: "Fase", render: (r) => r.phase },
    { header: "ETo", render: (r) => <span className="tabular-nums">{r.etoMm.toFixed(1)}</span>, align: "right" },
    { header: "ETP", render: (r) => <span className="tabular-nums">{r.etpMm != null ? r.etpMm.toFixed(1) : "—"}</span>, align: "right" },
    { header: "ETc", render: (r) => <span className="tabular-nums">{r.etcMm.toFixed(1)}</span>, align: "right" },
    { header: "Kc", render: (r) => r.kc.toFixed(2), align: "right" },
    { header: "Ks", render: (r) => r.ks != null ? r.ks.toFixed(2) : "—", align: "right" },
    { header: "KL", render: (r) => r.kl != null ? r.kl.toFixed(2) : "—", align: "right" },
    { header: "Chuva", render: (r) => <span className="tabular-nums">{r.rainMm.toFixed(1)}</span>, align: "right" },
    { header: "Pe", render: (r) => <span className="tabular-nums">{r.effectiveRainMm.toFixed(1)}</span>, align: "right" },
    { header: "Irrig. mm", render: (r) => <span className="tabular-nums">{r.irrigationGrossMm.toFixed(1)}</span>, align: "right" },
    { header: "Lâm. rec.", render: (r) => <span className="tabular-nums">{r.recommendedGrossMm.toFixed(1)}</span>, align: "right" },
    { header: "CC", render: (r) => r.fieldCapacity != null ? r.fieldCapacity.toFixed(2) : "—", align: "right" },
    { header: "PMP", render: (r) => r.wiltingPoint != null ? r.wiltingPoint.toFixed(2) : "—", align: "right" },
    { header: "CAD mm", render: (r) => <span className="tabular-nums">{r.cadMm.toFixed(1)}</span>, align: "right" },
    { header: "AFD mm", render: (r) => <span className="tabular-nums">{r.afdMm.toFixed(1)}</span>, align: "right" },
    { header: "ARM mm", render: (r) => <span className="tabular-nums">{r.armMm.toFixed(1)}</span>, align: "right" },
    { header: "Seg. mm", render: (r) => <span className="tabular-nums">{r.safetyMoistureMm.toFixed(1)}</span>, align: "right" },
    { header: "% CC", render: (r) => `${r.moisturePctCc.toFixed(0)}%`, align: "right" },
    { header: "Sensorial", render: (r) => r.sensoryNote != null ? <span className="font-semibold text-violet-600 dark:text-violet-400">{r.sensoryNote}</span> : "—", align: "right" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <MiniKPI label="ETo" value={`${formatNumber(totals.etoMm, 1)} mm`} />
        <MiniKPI label="ETc" value={`${formatNumber(totals.etcMm, 1)} mm`} />
        <MiniKPI label="Chuva / Pe" value={`${formatNumber(totals.rainMm, 1)} / ${formatNumber(totals.effectiveRainMm, 1)} mm`} />
        <MiniKPI label="Irrigação" value={`${formatNumber(totals.irrigationMm, 1)} mm`} />
        <MiniKPI label="ARM médio" value={`${formatNumber(totals.avgArmMm, 1)} mm`} />
        <MiniKPI label="% da CC" value={`${formatNumber(totals.avgMoisturePctCc, 0)}%`} />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <div>
            <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Gráfico de manejo</p>
            <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">
              Séries em Irrigação, Solo, Cultura e Clima. Padrão: umidade, ARM, irrigação, chuva, ETc e nota sensorial.
            </p>
          </div>
        </div>
        {chartRows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">Selecione um pivô ou parcela para o gráfico temporal.</p>
        ) : (
          <div className="flex flex-col lg:flex-row">
            <ManejoSeriesPicker rows={chartRows} visible={visible} onToggle={onToggle} />
            <div className="min-w-0 flex-1 p-4">
              <ManejoChart rows={chartRows} visible={visible} />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">
          Linhas diárias — unidades explícitas (ARM mm · % da CC volumétrico · nota 1–10)
        </h3>
        <div className="overflow-x-auto">
          <Table columns={columns} data={rows.slice(-120)} getKey={(r) => `${r.date}-${r.pivotId}-${r.parcelId ?? ""}`} />
        </div>
      </Card>
    </div>
  );
}

function GroupPreview({
  type, totals, byPeriod, byPivot, byParcel, byCulture,
}: {
  type: ReportType;
  totals: ReturnType<typeof summarizeOperational>;
  byPeriod: OperationalGroupRow[];
  byPivot: OperationalGroupRow[];
  byParcel: OperationalGroupRow[];
  byCulture: OperationalGroupRow[];
}) {
  const groups =
    type === "por_pivo" ? byPivot
      : type === "por_parcela" ? byParcel
        : type === "por_cultura" ? byCulture
          : type === "energetico" || type === "financeiro" ? byPivot
            : byPeriod;

  const energyPending = totals.energyKwh == null;
  const costPending = totals.cost == null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <MiniKPI label="Dias" value={`${totals.days}`} />
        <MiniKPI label="Irrigação" value={`${formatNumber(totals.irrigationMm, 1)} mm`} />
        <MiniKPI label="ETc" value={`${formatNumber(totals.etcMm, 1)} mm`} />
        <MiniKPI label="ARM médio" value={`${formatNumber(totals.avgArmMm, 1)} mm`} />
        <MiniKPI label="Energia" value={totals.energyKwh != null ? `${formatNumber(totals.energyKwh, 0)} kWh` : "—"} />
        <MiniKPI label="Custo" value={money(totals.cost)} />
      </div>
      {(energyPending || costPending) && (type === "energetico" || type === "financeiro") && (
        <p className="text-sm text-graphite-400 dark:text-gray-500">
          {energyPending ? "Sem energia nos eventos — cadastre potência na ficha do pivô. " : ""}
          {costPending ? "Sem custo nos eventos — cadastre tarifa ou R$/kWh na ficha." : ""}
        </p>
      )}
      <Card>
        <GroupTable rows={groups} showCost={type !== "energetico"} showEnergy={type !== "financeiro"} />
      </Card>
    </div>
  );
}

function GroupTable({ rows, showCost, showEnergy }: { rows: OperationalGroupRow[]; showCost: boolean; showEnergy: boolean }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Sem dados para este recorte.</p>;
  }
  const columns: Column<OperationalGroupRow>[] = [
    { header: "Grupo", render: (r) => (
      <div>
        <span className="font-medium">{r.label}</span>
        {r.extra && <p className="text-xs text-graphite-400">{r.extra}</p>}
      </div>
    ) },
    { header: "Dias", render: (r) => String(r.days), align: "right" },
    { header: "Irrig. mm", render: (r) => r.irrigationMm.toFixed(1), align: "right" },
    { header: "Chuva mm", render: (r) => r.rainMm.toFixed(1), align: "right" },
    { header: "ETc mm", render: (r) => r.etcMm.toFixed(1), align: "right" },
    { header: "ARM mm", render: (r) => r.avgArmMm.toFixed(1), align: "right" },
    { header: "% CC", render: (r) => `${r.avgMoisturePctCc.toFixed(0)}%`, align: "right" },
  ];
  if (showEnergy) columns.push({ header: "kWh", render: (r) => r.energyKwh != null ? formatNumber(r.energyKwh, 0) : "—", align: "right" });
  if (showCost) columns.push({ header: "Custo", render: (r) => money(r.cost), align: "right" });
  return <Table columns={columns} data={rows} getKey={(r) => r.key} />;
}

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 dark:border-white/[0.06]">
      <p className="text-xs text-graphite-400 dark:text-gray-500">{label}</p>
      <p className="text-lg font-bold tracking-tight text-graphite-900 dark:text-white">{value}</p>
    </div>
  );
}

function TabIndicadores({
  rows, totals,
}: {
  rows: ManagementReportRow[];
  totals: ReturnType<typeof summarizeOperational>;
}) {
  if (rows.length === 0 && totals.eventCount === 0) {
    return <EmptyState title="Sem indicadores disponíveis" description="Calcule o balanço e registre eventos de irrigação para ver ARM (mm), % da CC e custo real." />;
  }
  const byPivot = groupByPivot(rows, []);
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard metric={{ id: "water", title: "Água aplicada", value: `${formatNumber(totals.irrigationMm, 1)} mm`, description: "Lâmina bruta dos dias/eventos" }} />
        <StatCard metric={{ id: "etc", title: "ETc total", value: `${formatNumber(totals.etcMm, 1)} mm`, description: "Evapotranspiração da cultura" }} />
        <StatCard metric={{ id: "arm", title: "ARM médio", value: `${formatNumber(totals.avgArmMm, 1)} mm`, description: "Água armazenada — não é % da CAD" }} />
        <StatCard metric={{ id: "cc", title: "Umidade média", value: `${formatNumber(totals.avgMoisturePctCc, 0)}% da CC`, description: "Volumétrico (θ / θCC)" }} />
        <StatCard metric={{ id: "rain", title: "Chuva / Pe", value: `${formatNumber(totals.rainMm, 1)} / ${formatNumber(totals.effectiveRainMm, 1)} mm`, description: "Pe USDA-SCS limitada pela CAD" }} />
        <StatCard metric={{ id: "energy", title: "Energia", value: totals.energyKwh != null ? `${formatNumber(totals.energyKwh, 0)} kWh` : "—", description: "Soma dos eventos reais" }} />
        <StatCard metric={{ id: "cost", title: "Custo", value: money(totals.cost), description: "Sem tarifa, permanece vazio" }} />
        <StatCard metric={{ id: "events", title: "Eventos", value: `${totals.eventCount}`, description: "Irrigações registradas no recorte" }} />
      </div>
      {byPivot.length > 0 && (
        <Card>
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-tight text-graphite-400 dark:text-gray-500">Por pivô</h4>
          <GroupTable rows={byPivot} showCost={false} showEnergy={false} />
        </Card>
      )}
    </div>
  );
}

function TabAuditoria({ auditLog }: { auditLog: AuditLogEntry[] }) {
  const [filterAction, setFilterAction] = useState<AuditAction | "all">("all");
  const filtered = useMemo(() => {
    if (filterAction === "all") return auditLog;
    return auditLog.filter((e) => e.action === filterAction);
  }, [auditLog, filterAction]);
  const actionStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const entry of auditLog) stats[entry.action] = (stats[entry.action] ?? 0) + 1;
    return stats;
  }, [auditLog]);
  const actions = Object.entries(AUDIT_ACTION_CONFIG) as Array<[AuditAction, typeof AUDIT_ACTION_CONFIG[AuditAction]]>;

  if (auditLog.length === 0) {
    return <EmptyState title="Sem registros de auditoria" description="Os registros de auditoria aparecerão aqui conforme as ações forem realizadas na plataforma." />;
  }

  const columns: Column<AuditLogEntry>[] = [
    { header: "Data/Hora", render: (r) => (
      <span className="text-xs text-gray-600 dark:text-gray-500">{r.createdAt ? new Date(r.createdAt).toLocaleString("pt-BR") : "—"}</span>
    ) },
    { header: "Usuário", render: (r) => <span className="font-medium text-graphite-900 dark:text-white">{r.userName}</span> },
    { header: "Ação", render: (r) => (
      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${AUDIT_ACTION_CONFIG[r.action]?.bgClass ?? ""}`}>
        {AUDIT_ACTION_CONFIG[r.action]?.label ?? r.action}
      </span>
    ) },
    { header: "Entidade", render: (r) => (
      <div>
        <span className="text-xs uppercase text-graphite-400 dark:text-gray-500">{r.entityType}</span>
        <p className="text-sm text-graphite-900 dark:text-white">{r.entityName}</p>
      </div>
    ) },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {actions.slice(0, 6).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilterAction(filterAction === key ? "all" : key)}
            className={`rounded-xl border p-3 text-center transition-all ${
              filterAction === key
                ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                : "border-gray-100 hover:border-gray-300 dark:border-white/[0.06] dark:hover:border-white/[0.12]"
            }`}
          >
            <p className="text-lg font-bold tracking-tight text-graphite-900 dark:text-white">{actionStats[key] ?? 0}</p>
            <p className="text-xs text-graphite-400 dark:text-gray-500">{cfg.label}</p>
          </button>
        ))}
      </div>
      <Card>
        <Table columns={columns} data={filtered} getKey={(r) => r.id} />
      </Card>
    </div>
  );
}
