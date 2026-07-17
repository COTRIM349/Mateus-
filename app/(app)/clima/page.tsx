"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Input,
  Select,
  Table,
  Modal,
  ConfirmDialog,
  Tabs,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import { STATION_TYPES, DATA_SOURCES } from "@/constants/brazil";
import { createClient } from "@/lib/supabase/client";
import {
  validateWeatherReading,
  periodSummary,
  type WeatherReadingRow,
  type WeatherValidation,
} from "@/modules/weather/services/weather.service";
import {
  getVirtualStationSnapshot,
  type VirtualStationSnapshot,
} from "@/modules/weather/services/virtual-station.service";

// ── Types ─────────────────────────────────────────────────────────────────

interface WeatherStation {
  id: string;
  farm_id: string;
  name: string;
  model: string | null;
  latitude: number;
  longitude: number;
  altitude: number;
  station_type: string;
  data_source: string;
  source_priority: number;
  active: boolean;
  installed_at: string | null;
}

const climaTabs = [
  { id: "virtual", label: "Estação Virtual" },
  { id: "estacoes", label: "Estações" },
  { id: "lancamento", label: "Lançamento Manual" },
  { id: "historico", label: "Histórico Climático" },
  { id: "previsao", label: "Previsão" },
  { id: "fonte", label: "Fonte Diária" },
  { id: "sync", label: "Sincronizações" },
];

// ── Visual Dashboard Components ─────────────────────────────────────────

function ClimateGauge({ value, max, color, size = 72 }: {
  value: number;
  max: number;
  color: string;
  size?: number;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / max, 0), 1);
  const offset = c * (1 - pct);
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="5"
        className="stroke-gray-100 dark:stroke-white/[0.06]" />
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="5"
        stroke={color} strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
    </svg>
  );
}

function MetricCard({ icon, label, value, unit, gauge, accentColor, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  gauge?: { value: number; max: number; color: string };
  accentColor: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 transition-shadow hover:shadow-card dark:border-white/[0.06] dark:bg-graphite-800 dark:hover:shadow-none">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1.5">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-widest text-graphite-400 dark:text-gray-500">{label}</span>
          </div>
          <p className="text-[22px] font-extrabold leading-none tracking-tight text-graphite-900 dark:text-white">
            {value}
            <span className="ml-1 text-xs font-normal text-graphite-400 dark:text-gray-500">{unit}</span>
          </p>
          {sub && <div className="mt-2">{sub}</div>}
        </div>
        {gauge && <ClimateGauge value={gauge.value} max={gauge.max} color={gauge.color} />}
      </div>
    </div>
  );
}

// ── Instrumentos (linha visual iCrop) ──────────────────────────────────────

/** Termômetro vertical com faixa mín/máx e bulbo. */
function Thermometer({ min, max, scaleMin = 6, scaleMax = 34 }: {
  min: number | null;
  max: number | null;
  scaleMin?: number;
  scaleMax?: number;
}) {
  const gid = useId();
  const w = 44, H = 72, tx = w / 2, top = 6, bot = 52, by = 60, br = 7.5, tw = 6.5;
  const clamp = (v: number) => Math.min(scaleMax, Math.max(scaleMin, v));
  const map = (v: number) => bot - ((clamp(v) - scaleMin) / (scaleMax - scaleMin)) * (bot - top);
  const has = min != null && max != null;
  const yTop = has ? map(Math.max(min!, max!)) : bot;
  const yBot = has ? map(Math.min(min!, max!)) : bot;
  return (
    <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} className="mx-auto">
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#3b9fd6" />
          <stop offset="0.5" stopColor="#f5b301" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <rect x={tx - tw / 2} y={top} width={tw} height={bot - top} rx={tw / 2} className="fill-gray-100 dark:fill-white/[0.08]" />
      {has && <rect x={tx - tw / 2} y={yTop} width={tw} height={Math.max(yBot - yTop, 2)} fill={`url(#${gid})`} />}
      <circle cx={tx} cy={by} r={br} fill="#ef4444" />
      <rect x={tx - 2.5} y={by - 13} width="5" height="14" fill="#ef4444" />
    </svg>
  );
}

/** Gauge em arco (semicircular) com gradiente verde→amarelo→vermelho. */
function ArcGauge({ value, max, size = 74 }: { value: number | null; max: number; size?: number }) {
  const gid = useId();
  const r = 40, len = Math.PI * r;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <svg viewBox="0 0 100 64" width={size} height={size * 0.62} className="mx-auto">
      <defs>
        <linearGradient id={gid} x1="0" x2="1">
          <stop offset="0" stopColor="#57c98a" />
          <stop offset="0.5" stopColor="#f5b301" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <path d="M10 52 A40 40 0 0 1 90 52" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-gray-100 dark:stroke-white/[0.08]" />
      <path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke={`url(#${gid})`} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(frac * len).toFixed(1)} ${len.toFixed(1)}`} />
    </svg>
  );
}

const fmt1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1).replace(".", ","));
const fmt0 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(0));

function FcMetric({ colorClass, icon, value, unit }: {
  colorClass: string;
  icon: React.ReactNode;
  value: string;
  unit: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-1.5 text-[12.5px] font-bold ${colorClass}`}>
      {icon}
      <span>{value} <span className="text-[10px] font-medium text-graphite-400 dark:text-gray-500">{unit}</span></span>
    </div>
  );
}

const IcDrop = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></svg>;
const IcRain = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 15" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>;
const IcEto = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 8s3.5 3.8 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 11.8 12 8 12 8z" /><path d="M12 6V3M9 5l3-2 3 2" /></svg>;
const IcWind = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" /><path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5" /><path d="M3 16h7a2 2 0 1 1-2 2" /></svg>;

export default function ClimaPage() {
  const [activeTab, setActiveTab] = useState("virtual");

  return (
    <div className="space-y-8">
      <PageHeader titulo="Clima" descricao="Estações meteorológicas, dados climáticos e histórico" />
      <Tabs tabs={climaTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-8">
        {activeTab === "virtual" && <div className="animate-in"><VirtualStationTab /></div>}
        {activeTab === "estacoes" && <div className="animate-in"><StationsTab /></div>}
        {activeTab === "lancamento" && <div className="animate-in"><ManualEntryTab /></div>}
        {activeTab === "historico" && <div className="animate-in"><HistoryTab /></div>}
        {activeTab === "previsao" && <div className="animate-in"><ForecastTab /></div>}
        {activeTab === "fonte" && <div className="animate-in"><DailySelectionTab /></div>}
        {activeTab === "sync" && <div className="animate-in"><IngestionRunsTab /></div>}
      </div>
      <p className="mt-6 text-xs text-graphite-400 dark:text-gray-500">
        Dados climáticos automáticos: Open-Meteo.com (CC-BY 4.0).
      </p>
    </div>
  );
}

// ── Estações ──────────────────────────────────────────────────────────────

function StationsTab() {
  const { activeFarmId } = useAuth();
  const { data, loading, create, update, softDelete } = useCrud<WeatherStation>({
    table: "weather_stations",
    filters: { farm_id: activeFarmId },
    orderBy: "source_priority",
    ascending: true,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WeatherStation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WeatherStation | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeStations = data.filter((s) => s.active);

  const typeLabels: Record<string, string> = Object.fromEntries(
    STATION_TYPES.map((t) => [t.value, t.label])
  );
  const sourceLabels: Record<string, string> = Object.fromEntries(
    DATA_SOURCES.map((s) => [s.value, s.label])
  );

  const columns: Column<WeatherStation>[] = [
    { header: "Nome", render: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Tipo", render: (r) => typeLabels[r.station_type] ?? r.station_type },
    { header: "Fonte", render: (r) => sourceLabels[r.data_source] ?? r.data_source },
    { header: "Prioridade", render: (r) => r.source_priority, align: "center" },
    { header: "Modelo", render: (r) => r.model ?? "—" },
    {
      header: "Status",
      render: (r) => (
        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${
          r.active
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-gray-100 text-graphite-400 dark:bg-gray-700/30 dark:text-gray-500"
        }`}>
          {r.active ? "Ativa" : "Inativa"}
        </span>
      ),
    },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setModalOpen(true); }}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
        </div>
      ),
    },
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const fd = new FormData(e.currentTarget);
    const priority = Number(fd.get("source_priority"));
    if (priority < 1 || priority > 10) {
      setFormError("Prioridade deve ser entre 1 e 10");
      setSaving(false);
      return;
    }
    const payload = {
      farm_id: activeFarmId!,
      name: fd.get("name") as string,
      model: (fd.get("model") as string) || null,
      latitude: Number(fd.get("latitude")),
      longitude: Number(fd.get("longitude")),
      altitude: Number(fd.get("altitude") || 0),
      station_type: fd.get("station_type") as string,
      data_source: fd.get("data_source") as string,
      source_priority: priority,
      installed_at: (fd.get("installed_at") as string) || null,
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload as Omit<WeatherStation, "id" | "created_at" | "updated_at">);
      }
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  if (!activeFarmId) {
    return <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma fazenda ativa para gerenciar estações.</p></Card>;
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova estação</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
        ) : activeStations.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhuma estação cadastrada para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activeStations} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar estação" : "Nova estação"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" required defaultValue={editing?.name} placeholder="Estação Central" />
            <Input id="model" name="model" label="Modelo/Fabricante" defaultValue={editing?.model ?? ""} placeholder="Davis Vantage Pro2" />
            <Select id="station_type" name="station_type" label="Tipo de estação" options={[...STATION_TYPES]} required defaultValue={editing?.station_type ?? "automatica"} />
            <Select id="data_source" name="data_source" label="Fonte dos dados" options={[...DATA_SOURCES]} required defaultValue={editing?.data_source ?? "manual"} />
            <Input id="source_priority" name="source_priority" label="Prioridade (1 = maior)" type="number" min="1" max="10" required defaultValue={editing?.source_priority ?? 1} />
            <Input id="installed_at" name="installed_at" label="Data de instalação" type="date" defaultValue={editing?.installed_at ?? ""} />
            <Input id="latitude" name="latitude" label="Latitude" type="number" step="any" required defaultValue={editing?.latitude} placeholder="-15.8022" />
            <Input id="longitude" name="longitude" label="Longitude" type="number" step="any" required defaultValue={editing?.longitude} placeholder="-43.3089" />
            <Input id="altitude" name="altitude" label="Altitude (m)" type="number" step="any" defaultValue={editing?.altitude ?? 0} />
          </div>
          {formError && <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setSaving(true);
          try { await softDelete(deleteTarget.id); setDeleteTarget(null); } catch { setFormError("Erro ao excluir"); }
          setSaving(false);
        }}
        title="Excluir estação"
        message={`Deseja excluir a estação "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </>
  );
}

// ── Lançamento Manual ─────────────────────────────────────────────────────

interface StationOption {
  id: string;
  name: string;
  source_priority: number;
}

function ManualEntryTab() {
  const { activeFarmId } = useAuth();
  const [stations, setStations] = useState<StationOption[]>([]);
  const [selectedStation, setSelectedStation] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [validationIssues, setValidationIssues] = useState<WeatherValidation[]>([]);

  useEffect(() => {
    if (!activeFarmId) return;
    const supabase = createClient();
    supabase
      .from("weather_stations")
      .select("id, name, source_priority")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("source_priority")
      .then(({ data }) => {
        if (data) {
          setStations(data);
          if (data.length > 0 && !selectedStation) {
            setSelectedStation(data[0].id);
          }
        }
      });
  }, [activeFarmId, selectedStation]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    setSuccessMsg("");
    setValidationIssues([]);

    const fd = new FormData(e.currentTarget);
    const reading = {
      station_id: selectedStation,
      date: fd.get("date") as string,
      temp_max: Number(fd.get("temp_max")),
      temp_min: Number(fd.get("temp_min")),
      temp_mean: Number(fd.get("temp_mean")),
      humidity: Number(fd.get("humidity")),
      wind_speed: Number(fd.get("wind_speed")),
      solar_radiation: Number(fd.get("solar_radiation")),
      precipitation: Number(fd.get("precipitation") || 0),
      et0_calculated: fd.get("et0_calculated") ? Number(fd.get("et0_calculated")) : null,
    };

    const issues = validateWeatherReading(reading);
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length > 0) {
      setValidationIssues(issues);
      setFormError(errors.map((e) => e.message).join("; "));
      setSaving(false);
      return;
    }

    const warnings = issues.filter((i) => i.level === "warning");
    if (warnings.length > 0) {
      setValidationIssues(issues);
    }

    const supabase = createClient();
    const { error } = await supabase.from("weather_readings").insert(reading);
    if (error) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        setFormError("Já existe um registro para esta estação e data.");
      } else {
        setFormError(error.message);
      }
    } else {
      setSuccessMsg("Dados climáticos salvos com sucesso.");
      e.currentTarget.reset();
      setTimeout(() => setSuccessMsg(""), 3000);
    }
    setSaving(false);
  };

  if (!activeFarmId) {
    return <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma fazenda ativa para lançar dados climáticos.</p></Card>;
  }

  if (stations.length === 0) {
    return <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Cadastre uma estação meteorológica primeiro na aba &quot;Estações&quot;.</p></Card>;
  }

  const fieldWarning = (fieldName: string) => {
    const issue = validationIssues.find((i) => i.field === fieldName && i.level === "warning");
    return issue ? (
      <span className="mt-1 block text-xs text-yellow-600 dark:text-yellow-400">{issue.message}</span>
    ) : null;
  };

  return (
    <Card>
      <h3 className="mb-5 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Lançamento de dados climáticos</h3>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            id="station_select"
            name="station_select"
            label="Estação"
            options={stations.map((s) => ({ value: s.id, label: `${s.name} (P${s.source_priority})` }))}
            value={selectedStation}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedStation(e.target.value)}
            required
          />
          <Input id="date" name="date" label="Data" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
          <Input id="et0_calculated" name="et0_calculated" label="ET₀ (mm/dia)" type="number" step="0.01" min="0" placeholder="Ex: 5.20" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Input id="precipitation" name="precipitation" label="Chuva (mm)" type="number" step="0.1" min="0" defaultValue={0} required />
            {fieldWarning("precipitation")}
          </div>
          <div>
            <Input id="temp_min" name="temp_min" label="Temp. mínima (°C)" type="number" step="0.1" required />
            {fieldWarning("temp_min")}
          </div>
          <div>
            <Input id="temp_mean" name="temp_mean" label="Temp. média (°C)" type="number" step="0.1" required />
            {fieldWarning("temp_mean")}
          </div>
          <div>
            <Input id="temp_max" name="temp_max" label="Temp. máxima (°C)" type="number" step="0.1" required />
            {fieldWarning("temp_max")}
          </div>
          <div>
            <Input id="humidity" name="humidity" label="Umidade relativa (%)" type="number" step="0.1" min="0" max="100" required />
            {fieldWarning("humidity")}
          </div>
          <div>
            <Input id="wind_speed" name="wind_speed" label="Vento (m/s)" type="number" step="0.1" min="0" required />
            {fieldWarning("wind_speed")}
          </div>
          <div>
            <Input id="solar_radiation" name="solar_radiation" label="Radiação solar (MJ/m²/dia)" type="number" step="0.01" min="0" required />
            {fieldWarning("solar_radiation")}
          </div>
        </div>

        {formError && <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
        {successMsg && <p role="alert" className="rounded-xl bg-green-50 p-3.5 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">{successMsg}</p>}

        <div className="flex justify-end gap-3 pt-4">
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar dados"}</Button>
        </div>
      </form>
    </Card>
  );
}

// ── Histórico Climático ───────────────────────────────────────────────────

function HistoryTab() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [stations, setStations] = useState<StationOption[]>([]);
  const [selectedStation, setSelectedStation] = useState("all");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [readings, setReadings] = useState<(WeatherReadingRow & { station_name?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WeatherReadingRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("weather_stations")
      .select("id, name, source_priority")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("source_priority")
      .then(({ data }) => {
        if (data) setStations(data);
      });
  }, [activeFarmId, supabase]);

  const fetchReadings = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);

    const stationIds =
      selectedStation === "all"
        ? stations.map((s) => s.id)
        : [selectedStation];

    if (stationIds.length === 0) {
      setReadings([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("weather_readings")
      .select("*, weather_stations!inner(name, farm_id)")
      .in("station_id", stationIds)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    if (data) {
      const stationMap = new Map(stations.map((s) => [s.id, s.name]));
      setReadings(
        data.map((r) => ({
          ...r,
          station_name: stationMap.get(r.station_id) ?? "—",
        }))
      );
    }
    setLoading(false);
  }, [activeFarmId, selectedStation, startDate, endDate, stations, supabase]);

  useEffect(() => {
    if (stations.length > 0) fetchReadings();
  }, [fetchReadings, stations.length]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from("weather_readings").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    setDeleting(false);
    fetchReadings();
  };

  const summary = readings.length > 0 ? periodSummary(readings) : null;

  const tempWarning = (val: number, min: number, max: number) =>
    val < min || val > max
      ? "text-yellow-600 dark:text-yellow-400 font-semibold"
      : "";

  const columns: Column<WeatherReadingRow & { station_name?: string }>[] = [
    {
      header: "Data",
      render: (r) => new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR"),
    },
    { header: "Estação", render: (r) => r.station_name ?? "—" },
    {
      header: "ET₀",
      render: (r) =>
        r.et0_calculated != null ? (
          <span className={r.et0_calculated > 15 ? "text-yellow-600 dark:text-yellow-400 font-semibold" : ""}>
            {r.et0_calculated.toFixed(2)}
          </span>
        ) : (
          <span className="text-orange-500 dark:text-orange-400 text-xs">pendente</span>
        ),
      align: "right",
    },
    {
      header: "Chuva",
      render: (r) => (
        <span className={r.precipitation > 200 ? "text-yellow-600 dark:text-yellow-400 font-semibold" : ""}>
          {r.precipitation.toFixed(1)}
        </span>
      ),
      align: "right",
    },
    {
      header: "T.min",
      render: (r) => (
        <span className={tempWarning(r.temp_min, -15, 45)}>{r.temp_min.toFixed(1)}</span>
      ),
      align: "right",
    },
    {
      header: "T.méd",
      render: (r) => r.temp_mean.toFixed(1),
      align: "right",
    },
    {
      header: "T.máx",
      render: (r) => (
        <span className={tempWarning(r.temp_max, -10, 55)}>{r.temp_max.toFixed(1)}</span>
      ),
      align: "right",
    },
    { header: "UR%", render: (r) => r.humidity.toFixed(1), align: "right" },
    { header: "Vento", render: (r) => r.wind_speed.toFixed(1), align: "right" },
    { header: "Rad.", render: (r) => r.solar_radiation != null ? r.solar_radiation.toFixed(1) : "—", align: "right" },
    {
      header: "",
      align: "right",
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
      ),
    },
  ];

  if (!activeFarmId) {
    return <Card><p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Selecione uma fazenda ativa para ver o histórico.</p></Card>;
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[180px]">
            <Select
              id="history_station"
              name="history_station"
              label="Estação"
              options={[{ value: "all", label: "Todas as estações" }, ...stations.map((s) => ({ value: s.id, label: s.name }))]}
              value={selectedStation}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedStation(e.target.value)}
            />
          </div>
          <div>
            <Input id="start_date" name="start_date" label="De" type="date" value={startDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Input id="end_date" name="end_date" label="Até" type="date" value={endDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={fetchReadings}>Filtrar</Button>
        </div>

        {summary && (
          <div className="mb-4 grid gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-5 dark:border-white/[0.06] dark:bg-white/[0.03] sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">Período</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.days} dias</p>
            </div>
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">Temp. média</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgTemp}°C</p>
            </div>
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">Chuva total</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.totalPrecip} mm</p>
            </div>
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">ET₀ média</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgET0} mm/dia</p>
            </div>
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">ET₀ acumulada</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.totalET0} mm</p>
            </div>
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">Chuva efetiva</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.totalEffPrecip} mm</p>
            </div>
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">UR média</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgHumidity}%</p>
            </div>
            <div>
              <p className="text-xs text-graphite-400 dark:text-gray-500">Vento médio</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgWind} m/s</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
        ) : readings.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Nenhum dado climático encontrado para o período selecionado.</p>
        ) : (
          <Table columns={columns} data={readings} getKey={(r) => r.id} />
        )}
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir registro"
        message={`Deseja excluir o registro de ${deleteTarget ? new Date(deleteTarget.date + "T12:00:00").toLocaleDateString("pt-BR") : ""}?`}
        confirmLabel="Excluir"
        loading={deleting}
      />
    </>
  );
}

// ── Previsão ──────────────────────────────────────────────────────────────

interface ForecastRow {
  id: string;
  station_id: string | null;
  issued_at: string;
  target_date: string;
  horizon_days: number;
  provider: string;
  temp_max: number | null;
  temp_min: number | null;
  humidity: number | null;
  wind_speed: number | null;
  solar_radiation: number | null;
  precipitation: number | null;
  precipitation_probability: number | null;
  et0_source: number | null;
  et0_calculated: number | null;
}

// Ícone de clima do dia (a partir de chuva / probabilidade) — apresentação.
function DayGlyph({ precip, prob, size = 40 }: { precip: number | null; prob: number | null; size?: number }) {
  const p = precip ?? 0;
  const pr = prob ?? 0;
  if (p >= 5 || pr >= 60) {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <path d="M10 21a6.5 6.5 0 01-.5-13 8.5 8.5 0 0116 2.5A5 5 0 0125 21z" className="fill-slate-300 dark:fill-slate-500" />
        <path d="M13 24l-1.5 4M18 24l-1.5 4M23 24l-1.5 4" className="stroke-blue-500" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (p > 0 || pr >= 30) {
    return (
      <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
        <circle cx="14" cy="12" r="5.5" className="fill-amber-400" />
        <path d="M8.8 8l-1.3-1.3M14 4.5V2.6M19.2 8l1.3-1.3" className="stroke-amber-400" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 26a6 6 0 01-.5-12 7.5 7.5 0 0114 2A4.5 4.5 0 0126 26z" className="fill-slate-300 dark:fill-slate-500" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="7.5" className="fill-amber-400" />
      <path d="M18 4.5v3M18 28.5v3M4.5 18h3M28.5 18h3M9 9l2.1 2.1M24.9 24.9l2.1 2.1M9 27l2.1-2.1M24.9 11.1L27 9" className="stroke-amber-400" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Chip de ação orientativo do dia — heurística visual sobre chuva vs ETo.
// Não altera o motor do balanço; é apenas um indicador de leitura rápida.
function classifyDay(saldo: number, precip: number): { label: string; cls: string } {
  if (precip >= 8) return { label: "Suspender", cls: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" };
  if (saldo <= -3) return { label: "Irrigar", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" };
  if (saldo < 0) return { label: "Monitorar", cls: "bg-amber-50/70 text-amber-600 dark:bg-amber-900/10 dark:text-amber-400/90" };
  return { label: "Reavaliar", cls: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" };
}

function InfoRow({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-[11.5px]">
      <span className="flex items-center gap-1.5 text-graphite-500 dark:text-gray-400">
        <span className="text-graphite-300 dark:text-gray-600">{icon}</span>
        {label}
      </span>
      <span className={`font-semibold tabular-nums ${valueClass ?? "text-graphite-700 dark:text-gray-200"}`}>{value}</span>
    </div>
  );
}

function ForecastTab() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFarmId) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from("weather_forecasts")
      .select(
        "id, station_id, issued_at, target_date, horizon_days, provider, temp_max, temp_min, humidity, wind_speed, solar_radiation, precipitation, precipitation_probability, et0_source, et0_calculated",
      )
      .eq("farm_id", activeFarmId)
      .gte("target_date", today)
      .order("issued_at", { ascending: false })
      .order("target_date", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        setRows((data ?? []) as ForecastRow[]);
        setLoading(false);
      });
  }, [activeFarmId, supabase]);

  if (!activeFarmId) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
          Selecione uma fazenda ativa para ver a previsão.
        </p>
      </Card>
    );
  }

  const grouped = new Map<string, ForecastRow>();
  for (const r of rows) {
    const existing = grouped.get(r.target_date);
    if (!existing || r.issued_at > existing.issued_at) {
      grouped.set(r.target_date, r);
    }
  }
  const dailyForecasts = Array.from(grouped.values())
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, 7);

  const dayNames: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };

  const hoje = dailyForecasts[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
        <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
      </div>
    );
  }
  if (dailyForecasts.length === 0) {
    return (
      <Card>
        <p className="py-10 text-center text-sm text-graphite-400 dark:text-gray-500">
          Nenhuma previsão disponível. Cadastre uma estação com fonte Open-Meteo e execute a ingestão.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Próximas 24 horas */}
      {hoje && (
        <Card className="p-0">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
            <p className="text-[15px] font-bold text-graphite-900 dark:text-white">Próximas 24 horas</p>
          </div>
          <div className="grid grid-cols-2 gap-y-5 p-6 sm:grid-cols-3 lg:grid-cols-5">
            <div className="flex items-center gap-3">
              <DayGlyph precip={hoje.precipitation} prob={hoje.precipitation_probability} size={46} />
              <div>
                <p className="text-[22px] font-extrabold leading-none tabular-nums text-graphite-900 dark:text-white">{fmt1(hoje.temp_max)}<span className="text-sm">°</span></p>
                <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">máx · mín {fmt1(hoje.temp_min)}°</p>
              </div>
            </div>
            {[
              { label: "Umidade", value: `${fmt0(hoje.humidity)}%`, note: "relativa" },
              { label: "Vento", value: `${fmt1(hoje.wind_speed)} km/h`, note: "médio" },
              { label: "Chuva prevista", value: `${fmt1(hoje.precipitation)} mm`, note: `${fmt0(hoje.precipitation_probability)}% prob.` },
              { label: "ETo", value: `${fmt1(hoje.et0_calculated ?? hoje.et0_source)} mm`, note: "demanda" },
            ].map((m) => (
              <div key={m.label}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{m.label}</p>
                <p className="mt-1 text-[18px] font-bold tabular-nums text-graphite-900 dark:text-white">{m.value}</p>
                <p className="text-[10px] text-graphite-400 dark:text-gray-500">{m.note}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Previsão 7 dias */}
      <div>
        <p className="mb-3 text-[15px] font-bold text-graphite-900 dark:text-white">Previsão para os próximos 7 dias</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {dailyForecasts.map((f) => {
            const date = new Date(f.target_date + "T12:00:00");
            const isToday = f.target_date === new Date().toISOString().slice(0, 10);
            const eto = f.et0_calculated ?? f.et0_source ?? 0;
            const precip = f.precipitation ?? 0;
            const saldo = precip - eto;
            const chip = classifyDay(saldo, precip);
            return (
              <div
                key={f.id}
                className={`flex flex-col rounded-2xl border p-4 transition-shadow hover:shadow-card ${
                  isToday
                    ? "border-brand-200 bg-brand-50/30 dark:border-brand-700/30 dark:bg-brand-900/10"
                    : "border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800"
                } dark:hover:shadow-none`}
              >
                <div className="text-center">
                  <p className={`text-[14px] font-extrabold ${isToday ? "text-brand-600 dark:text-brand-400" : "text-graphite-800 dark:text-white"}`}>
                    {isToday ? "Hoje" : dayNames[date.getDay()]}
                  </p>
                  <p className="text-[11px] text-graphite-400 dark:text-gray-500">
                    {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </p>
                </div>
                <div className="my-2.5 flex items-center justify-center gap-2">
                  <DayGlyph precip={f.precipitation} prob={f.precipitation_probability} />
                  <span className="text-[15px] font-extrabold tabular-nums">
                    <span className="text-red-500 dark:text-red-400">{fmt1(f.temp_max)}°</span>
                    <span className="mx-0.5 text-graphite-300 dark:text-gray-600">/</span>
                    <span className="text-blue-500 dark:text-blue-400">{fmt1(f.temp_min)}°</span>
                  </span>
                </div>
                <div className="mt-1 space-y-1.5 border-t border-gray-100 pt-2.5 dark:border-white/[0.06]">
                  <InfoRow icon={IcRain} label="Chuva" value={`${fmt1(f.precipitation)} mm`} valueClass="text-blue-500 dark:text-blue-400" />
                  <InfoRow icon={IcDrop} label="Prob." value={`${fmt0(f.precipitation_probability)}%`} />
                  <InfoRow icon={IcEto} label="ETo" value={`${fmt1(eto)} mm`} valueClass="text-brand-600 dark:text-brand-400" />
                  <InfoRow icon={IcWind} label="Vento" value={`${fmt1(f.wind_speed)} km/h`} />
                  <InfoRow icon={IcDrop} label="Saldo" value={`${saldo >= 0 ? "+" : ""}${fmt1(saldo)} mm`} valueClass={saldo < 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-400"} />
                </div>
                <div className={`mt-3 rounded-lg py-2 text-center text-[12px] font-bold ${chip.cls}`}>
                  {chip.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Fonte Diária (auditoria) ─────────────────────────────────────────────

interface SelectionRow {
  id: string;
  date: string;
  selected_station_id: string | null;
  priority_used: number | null;
  quality_used: string | null;
  reason: string;
  fallback_used: boolean;
  selected_at: string;
}

function DailySelectionTab() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [rows, setRows] = useState<SelectionRow[]>([]);
  const [stationNames, setStationNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFarmId) return;
    setLoading(true);
    (async () => {
      const [selRes, stRes] = await Promise.all([
        supabase
          .from("weather_daily_selection")
          .select("id, date, selected_station_id, priority_used, quality_used, reason, fallback_used, selected_at")
          .eq("farm_id", activeFarmId)
          .order("date", { ascending: false })
          .limit(60),
        supabase
          .from("weather_stations")
          .select("id, name")
          .eq("farm_id", activeFarmId),
      ]);
      setRows((selRes.data ?? []) as SelectionRow[]);
      const map: Record<string, string> = {};
      for (const s of stRes.data ?? []) map[s.id as string] = s.name as string;
      setStationNames(map);
      setLoading(false);
    })();
  }, [activeFarmId, supabase]);

  if (!activeFarmId) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
          Selecione uma fazenda ativa para ver a seleção diária.
        </p>
      </Card>
    );
  }

  const columns: Column<SelectionRow>[] = [
    { header: "Data", render: (r) => new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR") },
    { header: "Estação escolhida", render: (r) => r.selected_station_id ? stationNames[r.selected_station_id] ?? "—" : "—" },
    { header: "Prioridade", render: (r) => r.priority_used ?? "—", align: "center" },
    { header: "Qualidade", render: (r) => r.quality_used ?? "—" },
    { header: "Fallback", render: (r) => (r.fallback_used ? "Sim" : "Não") },
    { header: "Motivo", render: (r) => <span className="text-xs">{r.reason}</span> },
  ];

  return (
    <Card>
      <div className="mb-3 text-xs text-graphite-400 dark:text-gray-500">
        A fonte utilizada pelo balanço hídrico em cada dia é registrada aqui para auditoria.
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
          Nenhuma seleção registrada ainda. As seleções são criadas quando a ingestão climática executa.
        </p>
      ) : (
        <Table columns={columns} data={rows} getKey={(r) => r.id} />
      )}
    </Card>
  );
}

// ── Sincronizações (ingestion runs) ──────────────────────────────────────

interface IngestionRunRow {
  id: string;
  run_at: string;
  station_id: string | null;
  provider: string;
  status: string;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  error_message: string | null;
  duration_ms: number | null;
}

function IngestionRunsTab() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [rows, setRows] = useState<IngestionRunRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFarmId) return;
    setLoading(true);
    supabase
      .from("climate_ingestion_runs")
      .select("id, run_at, station_id, provider, status, rows_inserted, rows_updated, rows_skipped, error_message, duration_ms")
      .eq("farm_id", activeFarmId)
      .order("run_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRows((data ?? []) as IngestionRunRow[]);
        setLoading(false);
      });
  }, [activeFarmId, supabase]);

  if (!activeFarmId) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
          Selecione uma fazenda ativa para ver as sincronizações.
        </p>
      </Card>
    );
  }

  const statusBadge = (s: string) => {
    const cls =
      s === "success"
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
        : s === "partial"
          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>;
  };

  const columns: Column<IngestionRunRow>[] = [
    { header: "Quando", render: (r) => new Date(r.run_at).toLocaleString("pt-BR") },
    { header: "Provedor", render: (r) => r.provider },
    { header: "Status", render: (r) => statusBadge(r.status) },
    { header: "Inseridas", render: (r) => r.rows_inserted, align: "right" },
    { header: "Atualizadas", render: (r) => r.rows_updated, align: "right" },
    { header: "Ignoradas", render: (r) => r.rows_skipped, align: "right" },
    { header: "Duração", render: (r) => (r.duration_ms != null ? `${r.duration_ms} ms` : "—"), align: "right" },
    { header: "Erro", render: (r) => (r.error_message ? <span className="text-xs text-red-600 dark:text-red-400">{r.error_message}</span> : "—") },
  ];

  return (
    <Card>
      <div className="mb-3 text-xs text-graphite-400 dark:text-gray-500">
        Log das execuções de ingestão climática automática.
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
          Nenhuma execução registrada ainda.
        </p>
      ) : (
        <Table columns={columns} data={rows} getKey={(r) => r.id} />
      )}
    </Card>
  );
}

// ── Estação Virtual ───────────────────────────────────────────────────────
// Sprint 5.2: snapshot da estação virtual da fazenda ativa.

function StatBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-graphite-900 dark:text-white">
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-graphite-400 dark:text-gray-500">{unit}</span> : null}
      </p>
    </div>
  );
}

function fmt(v: number | null | undefined, digits = 1): string {
  return v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);
}

function VirtualStationTab() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();
  const [snapshot, setSnapshot] = useState<VirtualStationSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    try {
      const snap = await getVirtualStationSnapshot(supabase, activeFarmId);
      setSnapshot(snap);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Erro ao carregar" });
    }
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const callSync = async (ensureVirtual: boolean) => {
    if (!activeFarmId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/climate/sync-farm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ farmId: activeFarmId, ensureVirtual, pastDays: 7, forecastDays: 7 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const runs = (json.runs ?? []) as Array<{ status: string; rowsInserted: number; rowsUpdated: number }>;
      const inserted = runs.reduce((s, r) => s + r.rowsInserted, 0);
      const updated = runs.reduce((s, r) => s + r.rowsUpdated, 0);
      const created = json.virtualStationCreated ? "Estação virtual criada. " : "";
      setMessage({
        type: "success",
        text: `${created}Sincronização concluída: ${inserted} inseridas, ${updated} atualizadas, ${json.selections} seleções.`,
      });
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    }
    setBusy(false);
  };

  if (!activeFarmId) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
          Selecione uma fazenda ativa para visualizar a estação virtual.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center gap-3 py-8"><div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span></div>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">
              Nenhuma estação virtual cadastrada
            </h3>
            <p className="mt-1 text-sm text-graphite-400 dark:text-gray-500">
              A estação virtual usa as coordenadas da fazenda para buscar dados climáticos automaticamente
              via Open-Meteo, servindo de fallback quando não há estação física com dados para o dia.
            </p>
          </div>
          {message && (
            <p role="alert" className={message.type === "success" ? "rounded-xl bg-green-50 p-3.5 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400" : "rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"}>
              {message.text}
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={busy} onClick={() => callSync(true)}>
              {busy ? "Ativando..." : "Ativar estação virtual e sincronizar"}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const st = snapshot.station;
  const r = snapshot.latestReading;
  const run = snapshot.lastRun;

  const statusColor =
    st.sync_status === "ok"
      ? "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30"
      : st.sync_status === "degraded"
        ? "text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30"
        : st.sync_status === "failed"
          ? "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30"
          : "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-white/[0.08]";

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-graphite-900 dark:text-white">{st.name}</h3>
            <p className="mt-0.5 text-xs text-graphite-400 dark:text-gray-500">
              Fonte: <span className="font-medium">{st.data_source}</span> · Prioridade: {st.source_priority}
              {" · "}Fuso: {st.timezone}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-lg px-3 py-1 text-xs font-medium ${statusColor}`}>
              {st.sync_status === "idle" ? "Não sincronizada" : `Status: ${st.sync_status}`}
            </span>
            <Button variant="secondary" disabled={busy} onClick={() => callSync(false)}>
              {busy ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </div>
        </div>

        {message && (
          <p className={`mb-3 rounded-xl p-3.5 text-sm ${message.type === "success" ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"}`}>
            {message.text}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBox label="Latitude" value={fmt(st.latitude, 4)} unit="°" />
          <StatBox label="Longitude" value={fmt(st.longitude, 4)} unit="°" />
          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">Altitude</p>
            <p className="mt-1 text-lg font-semibold text-graphite-900 dark:text-white">
              {fmt(st.altitude, 0)}
              <span className="ml-1 text-xs font-normal text-graphite-400 dark:text-gray-500">m</span>
            </p>
            <p className="mt-1 text-[10px] text-graphite-400 dark:text-gray-500">
              origem: <span className={st.altitude_origin === "unknown" ? "font-semibold text-yellow-700 dark:text-yellow-400" : "font-medium"}>{st.altitude_origin}</span>
            </p>
          </div>
          <StatBox
            label="Última sincronização"
            value={st.last_sync_at ? new Date(st.last_sync_at).toLocaleString("pt-BR") : "—"}
          />
        </div>

        {st.altitude_origin === "unknown" && (
          <p className="mt-3 rounded-xl border border-yellow-300 bg-yellow-50 p-3.5 text-xs text-yellow-800 dark:border-yellow-900/30 dark:bg-yellow-900/20 dark:text-yellow-300">
            Altitude não determinada. O cálculo local de ET₀ está usando 0 m e a qualidade dos dados foi marcada como degradada. Informe a altitude da fazenda ou execute uma nova sincronização — a Open-Meteo retornará a elevação real da grade.
          </p>
        )}

        {st.sync_error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300">
            Último erro: {st.sync_error}
          </p>
        )}
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Condições Atuais</h4>
          {r && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-graphite-400 dark:text-gray-500">
              <span>{new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
              <span className="h-1 w-1 rounded-full bg-graphite-200 dark:bg-gray-600" />
              <span>Qualidade: <span className={r.data_quality === "ok" ? "font-medium text-green-600 dark:text-green-400" : "font-medium text-yellow-600 dark:text-yellow-400"}>{r.data_quality}</span></span>
              <span className="h-1 w-1 rounded-full bg-graphite-200 dark:bg-gray-600" />
              <span>Origem: <span className="font-medium">{r.origin}</span></span>
            </div>
          )}
        </div>

        {r ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-graphite-800">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-400 via-amber-400 to-red-500" />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="5.5" y="1" width="3" height="9" rx="1.5" className="fill-red-400" />
                        <circle cx="7" cy="11.5" r="2" className="fill-red-500" />
                      </svg>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-graphite-400 dark:text-gray-500">Temperatura</span>
                    </div>
                    <p className="text-[22px] font-extrabold leading-none tracking-tight text-graphite-900 dark:text-white">
                      {fmt(r.temp_mean, 1)}<span className="ml-1 text-xs font-normal text-graphite-400 dark:text-gray-500">°C</span>
                    </p>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <span className="text-[11px] font-bold text-blue-500 dark:text-blue-400">{fmt(r.temp_min, 1)}° mín</span>
                      <span className="text-[11px] font-bold text-red-500 dark:text-red-400">{fmt(r.temp_max, 1)}° máx</span>
                    </div>
                  </div>
                  <Thermometer min={r.temp_min} max={r.temp_max} scaleMin={0} scaleMax={45} />
                </div>
              </div>

              <MetricCard
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1S3 5.5 3 8a4 4 0 008 0c0-2.5-4-7-4-7z" className="fill-blue-400 dark:fill-blue-300" /></svg>}
                label="Umidade"
                value={fmt(r.humidity, 1)}
                unit="%"
                accentColor="#3b82f6"
                gauge={r.humidity != null ? { value: r.humidity, max: 100, color: "#3b82f6" } : undefined}
              />

              <MetricCard
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h7a2 2 0 000-4M2 7h5.5a1.5 1.5 0 010 3M2 10h3.5a1.5 1.5 0 010 3" className="stroke-cyan-500 dark:stroke-cyan-400" strokeWidth="1.2" strokeLinecap="round" fill="none" /></svg>}
                label="Vento"
                value={fmt(r.wind_speed, 1)}
                unit="m/s"
                accentColor="#06b6d4"
                gauge={r.wind_speed != null ? { value: r.wind_speed, max: 15, color: "#06b6d4" } : undefined}
              />

              <MetricCard
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3" className="fill-amber-400 dark:fill-amber-300" /><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.4 1.4M9.6 9.6L11 11M3 11l1.4-1.4M9.6 4.4L11 3" className="stroke-amber-400 dark:stroke-amber-300" strokeWidth="1.2" strokeLinecap="round" /></svg>}
                label="Radiação Solar"
                value={fmt(r.solar_radiation, 1)}
                unit="MJ/m²"
                accentColor="#f59e0b"
                gauge={r.solar_radiation != null ? { value: r.solar_radiation, max: 35, color: "#f59e0b" } : undefined}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 10a3.5 3.5 0 017 0" className="stroke-brand-500 dark:stroke-brand-400" strokeWidth="1.5" strokeLinecap="round" fill="none" /><circle cx="7" cy="11.5" r="1.5" className="fill-brand-500 dark:fill-brand-400" /><path d="M7 2v2M3 4l1 1M11 4l-1 1" className="stroke-brand-500 dark:stroke-brand-400" strokeWidth="1.2" strokeLinecap="round" /></svg>}
                label="ET₀ Cotrim"
                value={fmt(r.et0_calculated, 2)}
                unit="mm/dia"
                accentColor="#1ea85b"
                gauge={r.et0_calculated != null ? { value: r.et0_calculated, max: 12, color: "#1ea85b" } : undefined}
              />

              <MetricCard
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="1.2" fill="none" /><path d="M7 4v3l2 1.5" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="1.2" strokeLinecap="round" fill="none" /></svg>}
                label="ET₀ Open-Meteo"
                value={fmt(r.et0_source, 2)}
                unit="mm/dia"
                accentColor="#64748b"
              />

              <div className={`relative overflow-hidden rounded-2xl border p-4 ${
                r.et0_delta_pct != null && Math.abs(r.et0_delta_pct) > 10
                  ? "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10"
                  : "border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800"
              }`}>
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: r.et0_delta_pct != null && Math.abs(r.et0_delta_pct) > 10 ? "linear-gradient(90deg, #ef4444, transparent)" : "linear-gradient(90deg, #94a3b8, transparent)" }} />
                <div className="mb-2 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" className="stroke-graphite-400 dark:stroke-gray-500" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-graphite-400 dark:text-gray-500">Diferença ET₀</span>
                </div>
                <p className="text-[22px] font-extrabold leading-none tracking-tight text-graphite-900 dark:text-white">
                  {r.et0_delta_pct != null ? `${r.et0_delta_pct >= 0 ? "+" : ""}${r.et0_delta_pct.toFixed(1)}` : "—"}
                  <span className="ml-1 text-xs font-normal text-graphite-400 dark:text-gray-500">%</span>
                </p>
                <p className="mt-1.5 text-[10px] text-graphite-400 dark:text-gray-500">
                  Δ absoluto: {fmt(r.et0_delta, 2)} mm/dia
                </p>
              </div>

              <MetricCard
                icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1S3.5 5 3.5 7.5a3.5 3.5 0 007 0C10.5 5 7 1 7 1z" className="fill-indigo-400 dark:fill-indigo-300" /></svg>}
                label="Chuva"
                value={fmt(r.precipitation, 1)}
                unit="mm"
                accentColor="#818cf8"
                sub={<span className="text-[10px] text-graphite-400 dark:text-gray-500">Efetiva: {fmt(r.effective_precip, 1)} mm</span>}
              />
            </div>

            {r.et0_delta_pct != null && Math.abs(r.et0_delta_pct) > 10 && (
              <p className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300">
                Divergência acima de 10% entre ET₀ Cotrim e ET₀ Open-Meteo. Possíveis causas: altitude imprecisa, dados de radiação/umidade instáveis ou coordenada com contraste micrometeorológico local. Verifique a altitude e as leituras de radiação.
              </p>
            )}
          </>
        ) : (
          <Card>
            <p className="py-6 text-center text-sm text-graphite-400 dark:text-gray-500">
              Nenhuma leitura observada ainda. Clique em &quot;Sincronizar agora&quot; para trazer os últimos 7 dias.
            </p>
          </Card>
        )}
      </div>

      <MeteoblueCompareCard farmId={activeFarmId} />

      {run && (
        <Card>
          <h4 className="mb-2 text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Última execução de ingestão (Open-Meteo)</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <div><span className="text-xs text-graphite-400 dark:text-gray-500">Quando</span><br />{new Date(run.run_at).toLocaleString("pt-BR")}</div>
            <div><span className="text-xs text-graphite-400 dark:text-gray-500">Status</span><br />{run.status}</div>
            <div><span className="text-xs text-graphite-400 dark:text-gray-500">Inseridas / Atualizadas / Ignoradas</span><br />{run.rows_inserted} / {run.rows_updated} / {run.rows_skipped}</div>
            <div><span className="text-xs text-graphite-400 dark:text-gray-500">Duração</span><br />{run.duration_ms != null ? `${run.duration_ms} ms` : "—"}</div>
            <div><span className="text-xs text-graphite-400 dark:text-gray-500">Erro</span><br />{run.error_message ?? "—"}</div>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/[0.06]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">Contexto da requisição</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div><span className="text-xs text-graphite-400 dark:text-gray-500">Latitude enviada</span><br />{fmt(run.request_latitude, 4)}°</div>
              <div><span className="text-xs text-graphite-400 dark:text-gray-500">Longitude enviada</span><br />{fmt(run.request_longitude, 4)}°</div>
              <div><span className="text-xs text-graphite-400 dark:text-gray-500">Timezone</span><br />{run.request_timezone ?? "—"}</div>
              <div><span className="text-xs text-graphite-400 dark:text-gray-500">Altitude usada</span><br />{fmt(run.altitude_used, 0)} m <span className="text-xs text-graphite-400 dark:text-gray-500">({run.altitude_origin ?? "—"})</span></div>
              <div><span className="text-xs text-graphite-400 dark:text-gray-500">Elevation Open-Meteo</span><br />{fmt(run.response_elevation, 0)} m</div>
              <div><span className="text-xs text-graphite-400 dark:text-gray-500">Δ ET₀ médio (7d)</span><br />{run.et0_delta_pct_avg != null ? `${run.et0_delta_pct_avg.toFixed(1)}%` : "—"}</div>
            </div>
            {run.request_url && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-graphite-400 dark:text-gray-500 hover:text-graphite-900 dark:hover:text-white">URL requisitada</summary>
                <p className="mt-1 break-all rounded-xl border border-gray-100 bg-gray-50/80 p-2 font-mono text-[11px] dark:border-white/[0.06] dark:bg-white/[0.03]">
                  {run.request_url}
                </p>
              </details>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Comparação meteoblue ────────────────────────────────────────────────────

interface MbComparisonRow {
  date: string;
  om: {
    temp_max: number | null;
    temp_min: number | null;
    humidity: number | null;
    wind_speed: number | null;
    precipitation: number | null;
  } | null;
  mb: {
    temp_max: number | null;
    temp_min: number | null;
    humidity: number | null;
    wind_speed: number | null;
    precipitation: number | null;
    pressure_hpa: number | null;
  } | null;
}

interface MbDiagnostic {
  keyPresent: boolean;
  status: string;
  httpStatus: number | null;
  latencyMs: number;
  error: string | null;
  envDebug?: {
    envVarExists: boolean;
    rawLength: number;
    trimmedLength: number;
    hasWhitespace: boolean;
    prefix: string;
  };
}

interface MbCacheEntry {
  data: MbComparisonRow[];
  mbExists: boolean;
  ts: number;
}
const MB_CACHE = new Map<string, MbCacheEntry>();
const MB_TTL_MS = 5 * 60 * 1000;
const MB_TIMEOUT_MS = 8000;

function MeteoblueCompareCard({ farmId }: { farmId: string | null }) {
  const supabase = createClient();
  const [testing, setTesting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [diagnostic, setDiagnostic] = useState<MbDiagnostic | null>(null);
  const [comparison, setComparison] = useState<MbComparisonRow[]>([]);
  const [mbStationExists, setMbStationExists] = useState<boolean | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);
  const diagAbortRef = useRef<AbortController | null>(null);

  const loadComparison = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!farmId) return;
      if (!options.force) {
        const cached = MB_CACHE.get(farmId);
        if (cached && Date.now() - cached.ts < MB_TTL_MS) {
          setComparison(cached.data);
          setMbStationExists(cached.mbExists);
          return;
        }
      }
      setLoadingComparison(true);
      try {
        const { data: stations, error: stErr } = await supabase
          .from("weather_stations")
          .select("id, data_source")
          .eq("farm_id", farmId)
          .in("data_source", ["open_meteo", "meteoblue"])
          .eq("station_type", "virtual");
        if (stErr) {
          setComparison([]);
          setMbStationExists(false);
          setLoadingComparison(false);
          return;
        }
        const om = stations?.find((s) => s.data_source === "open_meteo");
        const mb = stations?.find((s) => s.data_source === "meteoblue");
        const mbExists = Boolean(mb);
        setMbStationExists(mbExists);
        if (!om && !mb) {
          setComparison([]);
          MB_CACHE.set(farmId, { data: [], mbExists: false, ts: Date.now() });
          setLoadingComparison(false);
          return;
        }
        const ids = [om?.id, mb?.id].filter(Boolean) as string[];
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 7);

        const { data: rows, error: rErr } = await supabase
          .from("weather_readings")
          .select("date, station_id, origin, temp_max, temp_min, humidity, wind_speed, precipitation")
          .in("station_id", ids)
          .gte("date", since.toISOString().slice(0, 10))
          .order("date", { ascending: false })
          .limit(20);

        if (rErr || !rows) {
          setComparison([]);
          MB_CACHE.set(farmId, { data: [], mbExists, ts: Date.now() });
          setLoadingComparison(false);
          return;
        }

        const byDate = new Map<string, MbComparisonRow>();
        for (const r of rows) {
          const d = r.date as string;
          if (!byDate.has(d)) byDate.set(d, { date: d, om: null, mb: null });
          const entry = byDate.get(d)!;
          const base = {
            temp_max: (r.temp_max as number | null) ?? null,
            temp_min: (r.temp_min as number | null) ?? null,
            humidity: (r.humidity as number | null) ?? null,
            wind_speed: (r.wind_speed as number | null) ?? null,
            precipitation: (r.precipitation as number | null) ?? null,
          };
          if (r.origin === "open_meteo") entry.om = base;
          if (r.origin === "meteoblue") entry.mb = { ...base, pressure_hpa: null };
        }
        const built = Array.from(byDate.values());
        setComparison(built);
        MB_CACHE.set(farmId, { data: built, mbExists, ts: Date.now() });
      } catch {
        setComparison([]);
      }
      setLoadingComparison(false);
    },
    [farmId, supabase],
  );

  useEffect(() => {
    if (!farmId) return;
    const id = setTimeout(() => loadComparison(), 0);
    return () => clearTimeout(id);
  }, [farmId, loadComparison]);

  const runDiagnostic = async () => {
    if (diagnosing) return;
    diagAbortRef.current?.abort();
    const ac = new AbortController();
    diagAbortRef.current = ac;
    const timeoutId = setTimeout(() => ac.abort(), MB_TIMEOUT_MS);
    setDiagnosing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/climate/meteoblue-diagnostic", { signal: ac.signal });
      const json = (await res.json()) as MbDiagnostic;
      setDiagnostic(json);
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message));
      setMessage({ type: "error", text: isAbort ? "Verificação cancelada (timeout)." : err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timeoutId);
      setDiagnosing(false);
    }
  };

  const runTest = async () => {
    if (!farmId || testing) return;
    testAbortRef.current?.abort();
    const ac = new AbortController();
    testAbortRef.current = ac;
    const timeoutId = setTimeout(() => ac.abort(), MB_TIMEOUT_MS);
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/climate/test-meteoblue", {
        method: "POST",
        signal: ac.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ farmId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const runs = (json.runs ?? []) as Array<{ status: string; rowsInserted: number; rowsUpdated: number; rowsSkipped: number; errorMessage: string | null }>;
      const inserted = runs.reduce((s: number, r: { rowsInserted: number }) => s + r.rowsInserted, 0);
      const updated = runs.reduce((s: number, r: { rowsUpdated: number }) => s + r.rowsUpdated, 0);
      const runStatus = runs[0]?.status ?? "unknown";
      const errMsg = runs[0]?.errorMessage;
      const created = json.virtualStationCreated ? "Estação virtual meteoblue criada. " : "";
      setMessage({ type: runStatus === "success" ? "success" : "error", text: `${created}${inserted} inseridas · ${updated} atualizadas · status ${runStatus}${errMsg ? ` · erro: ${errMsg}` : ""}` });
      MB_CACHE.delete(farmId);
      await loadComparison({ force: true });
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message));
      setMessage({ type: "error", text: isAbort ? "Teste cancelado (timeout)." : err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timeoutId);
      setTesting(false);
    }
  };

  const diffColor = (v: number | null) => {
    if (v == null) return "";
    const abs = Math.abs(v);
    if (abs >= 3) return "text-red-600 dark:text-red-400 font-semibold";
    if (abs >= 1.5) return "text-yellow-700 dark:text-yellow-400";
    return "text-graphite-400 dark:text-gray-500";
  };

  const fmtN = (v: number | null, digits = 1) => (v == null ? "—" : v.toFixed(digits));
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? b - a : null);
  const fmtD = (v: number | null, digits = 1) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(digits));

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold tracking-tight text-graphite-900 dark:text-white">Comparação meteoblue</h4>
          <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">
            Fonte secundária de comparação. Open-Meteo (P5) continua como principal do balanço hídrico. meteoblue entra como P6 apenas para comparação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={diagnosing} onClick={runDiagnostic}>
            {diagnosing ? "Verificando..." : "Verificar chave"}
          </Button>
          <Button disabled={testing || !farmId} onClick={runTest}>
            {testing ? "Testando..." : "Testar meteoblue"}
          </Button>
        </div>
      </div>

      {message && (
        <p className={`mb-3 rounded-xl p-3.5 text-sm ${message.type === "success" ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"}`}>
          {message.text}
        </p>
      )}

      {diagnostic && (
        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-xs dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="grid gap-2 sm:grid-cols-3">
            <div><span className="text-graphite-400 dark:text-gray-500">Chave configurada:</span> {diagnostic.keyPresent ? "sim" : "não"}</div>
            <div><span className="text-graphite-400 dark:text-gray-500">Status:</span> {diagnostic.status}</div>
            <div><span className="text-graphite-400 dark:text-gray-500">Latência:</span> {diagnostic.latencyMs} ms</div>
            {diagnostic.httpStatus != null && (
              <div><span className="text-graphite-400 dark:text-gray-500">HTTP:</span> {diagnostic.httpStatus}</div>
            )}
            {diagnostic.error && (
              <div className="sm:col-span-3 text-red-600 dark:text-red-400"><span className="text-graphite-400 dark:text-gray-500">Erro:</span> {diagnostic.error}</div>
            )}
            {diagnostic.envDebug && (
              <>
                <div><span className="text-graphite-400 dark:text-gray-500">Env var existe:</span> {diagnostic.envDebug.envVarExists ? "sim" : "não"}</div>
                <div><span className="text-graphite-400 dark:text-gray-500">Tamanho:</span> {diagnostic.envDebug.trimmedLength} chars</div>
                <div><span className="text-graphite-400 dark:text-gray-500">Prefixo:</span> {diagnostic.envDebug.prefix}</div>
                {diagnostic.envDebug.hasWhitespace && (
                  <div className="sm:col-span-3 text-yellow-600 dark:text-yellow-400">⚠ A chave contém espaços extras (foram removidos automaticamente)</div>
                )}
              </>
            )}
            {diagnostic.envDebug && (
              <>
                <div><span className="text-gray-500 dark:text-gray-400">Env var existe:</span> {diagnostic.envDebug.envVarExists ? "sim" : "não"}</div>
                <div><span className="text-gray-500 dark:text-gray-400">Tamanho:</span> {diagnostic.envDebug.trimmedLength} chars</div>
                <div><span className="text-gray-500 dark:text-gray-400">Prefixo:</span> {diagnostic.envDebug.prefix}</div>
                {diagnostic.envDebug.hasWhitespace && (
                  <div className="sm:col-span-3 text-yellow-600 dark:text-yellow-400">⚠ A chave contém espaços extras (foram removidos automaticamente)</div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {loadingComparison && comparison.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-4"><div className="h-4 w-4 animate-spin rounded-full border-[2px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" /><span className="text-xs text-graphite-400 dark:text-gray-500">Carregando comparação (últimos 7 dias)...</span></div>
      )}

      {!loadingComparison && mbStationExists === false && !message && (
        <p className="py-4 text-center text-sm text-graphite-400 dark:text-gray-500">
          Clique em &quot;Testar meteoblue&quot; para criar a estação virtual e importar os primeiros 7 dias.
        </p>
      )}

      {comparison.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50/80 dark:bg-white/[0.03]">
              <tr>
                <th className="px-2 py-2 text-left">Data</th>
                <th className="px-2 py-2 text-right">T_max OM</th>
                <th className="px-2 py-2 text-right">T_max MB</th>
                <th className="px-2 py-2 text-right">Δ</th>
                <th className="px-2 py-2 text-right">T_min OM</th>
                <th className="px-2 py-2 text-right">T_min MB</th>
                <th className="px-2 py-2 text-right">Δ</th>
                <th className="px-2 py-2 text-right">Chuva OM</th>
                <th className="px-2 py-2 text-right">Chuva MB</th>
                <th className="px-2 py-2 text-right">Δ</th>
                <th className="px-2 py-2 text-right">Vento OM</th>
                <th className="px-2 py-2 text-right">Vento MB</th>
                <th className="px-2 py-2 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((r) => {
                const dTmax = diff(r.om?.temp_max ?? null, r.mb?.temp_max ?? null);
                const dTmin = diff(r.om?.temp_min ?? null, r.mb?.temp_min ?? null);
                const dRain = diff(r.om?.precipitation ?? null, r.mb?.precipitation ?? null);
                const dWind = diff(r.om?.wind_speed ?? null, r.mb?.wind_speed ?? null);
                return (
                  <tr key={r.date} className="border-t border-gray-100 dark:border-white/[0.06]">
                    <td className="px-2 py-1.5">{new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.om?.temp_max ?? null)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.mb?.temp_max ?? null)}</td>
                    <td className={`px-2 py-1.5 text-right ${diffColor(dTmax)}`}>{fmtD(dTmax)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.om?.temp_min ?? null)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.mb?.temp_min ?? null)}</td>
                    <td className={`px-2 py-1.5 text-right ${diffColor(dTmin)}`}>{fmtD(dTmin)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.om?.precipitation ?? null)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.mb?.precipitation ?? null)}</td>
                    <td className={`px-2 py-1.5 text-right ${diffColor(dRain)}`}>{fmtD(dRain)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.om?.wind_speed ?? null, 2)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtN(r.mb?.wind_speed ?? null, 2)}</td>
                    <td className={`px-2 py-1.5 text-right ${diffColor(dWind)}`}>{fmtD(dWind, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
        meteoblue.com · Chave lida apenas no backend · Nunca exibida nesta interface.
      </p>
    </Card>
  );
}
