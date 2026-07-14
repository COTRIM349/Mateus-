"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

export default function ClimaPage() {
  const [activeTab, setActiveTab] = useState("virtual");

  return (
    <div className="space-y-8">
      <PageHeader titulo="Clima" descricao="Estações meteorológicas, dados climáticos e histórico" />
      <Tabs tabs={climaTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-8">
        {activeTab === "virtual" && <VirtualStationTab />}
        {activeTab === "estacoes" && <StationsTab />}
        {activeTab === "lancamento" && <ManualEntryTab />}
        {activeTab === "historico" && <HistoryTab />}
        {activeTab === "previsao" && <ForecastTab />}
        {activeTab === "fonte" && <DailySelectionTab />}
        {activeTab === "sync" && <IngestionRunsTab />}
      </div>
      <p className="mt-6 text-xs text-graphite-300 dark:text-graphite-600">
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
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
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
          {formError && <p className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
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

        {formError && <p className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
        {successMsg && <p className="rounded-xl bg-green-50 p-3.5 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">{successMsg}</p>}

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
          <div className="mb-4 grid gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-5 dark:border-graphite-700/50 dark:bg-graphite-800/60 sm:grid-cols-2 lg:grid-cols-4">
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
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
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

  const columns: Column<ForecastRow>[] = [
    { header: "Alvo", render: (r) => new Date(r.target_date + "T12:00:00").toLocaleDateString("pt-BR") },
    { header: "Horiz.", render: (r) => `D+${r.horizon_days}`, align: "center" },
    { header: "Emitida em", render: (r) => new Date(r.issued_at).toLocaleString("pt-BR") },
    { header: "Provedor", render: (r) => r.provider },
    { header: "T.máx", render: (r) => r.temp_max?.toFixed(1) ?? "—", align: "right" },
    { header: "T.mín", render: (r) => r.temp_min?.toFixed(1) ?? "—", align: "right" },
    { header: "Chuva (mm)", render: (r) => r.precipitation?.toFixed(1) ?? "—", align: "right" },
    { header: "Prob. chuva", render: (r) => (r.precipitation_probability != null ? `${r.precipitation_probability.toFixed(0)}%` : "—"), align: "right" },
    { header: "ET₀ fonte", render: (r) => r.et0_source?.toFixed(2) ?? "—", align: "right" },
    { header: "ET₀ Cotrim", render: (r) => r.et0_calculated?.toFixed(2) ?? "—", align: "right" },
  ];

  return (
    <Card>
      <div className="mb-3 text-xs text-graphite-400 dark:text-gray-500">
        Previsão meteorológica é armazenada separadamente das observações e nunca as sobrescreve.
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
          Nenhuma previsão disponível. Cadastre uma estação com fonte Open-Meteo e execute a ingestão.
        </p>
      ) : (
        <Table columns={columns} data={rows} getKey={(r) => r.id} />
      )}
    </Card>
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
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
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
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
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
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-graphite-700/50 dark:bg-graphite-800/60">
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
        <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">Carregando...</p>
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
            <p className={message.type === "success" ? "rounded-xl bg-green-50 p-3.5 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400" : "rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"}>
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
          : "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-graphite-700";

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
          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-graphite-700/50 dark:bg-graphite-800/60">
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
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300">
            Último erro: {st.sync_error}
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-graphite-900 dark:text-white">Última leitura observada</h4>
          {r && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(r.date + "T12:00:00").toLocaleDateString("pt-BR")}
              {" · qualidade: "}
              <span className={r.data_quality === "ok" ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"}>
                {r.data_quality}
              </span>
              {" · origem: "}
              <span className="font-medium">{r.origin}</span>
            </span>
          )}
        </div>
        {r ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatBox label="ET₀ (Cotrim)" value={fmt(r.et0_calculated, 2)} unit="mm/dia" />
              <StatBox label="ET₀ (Open-Meteo)" value={fmt(r.et0_source, 2)} unit="mm/dia" />
              <div className={`rounded-md border p-3 ${
                r.et0_delta_pct != null && Math.abs(r.et0_delta_pct) > 10
                  ? "border-red-300 bg-red-50 dark:border-red-900/30 dark:bg-red-900/20"
                  : "border-gray-200 bg-gray-50 dark:border-graphite-700 dark:bg-graphite-800"
              }`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Diferença ET₀</p>
                <p className="mt-1 text-lg font-semibold text-graphite-900 dark:text-white">
                  {r.et0_delta_pct != null ? `${r.et0_delta_pct >= 0 ? "+" : ""}${r.et0_delta_pct.toFixed(1)}` : "—"}
                  {r.et0_delta_pct != null && <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">%</span>}
                </p>
                <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                  Δ absoluto: {fmt(r.et0_delta, 2)} mm/dia
                </p>
              </div>
              <StatBox label="Chuva" value={fmt(r.precipitation, 1)} unit="mm" />
              <StatBox label="Chuva efetiva" value={fmt(r.effective_precip, 1)} unit="mm" />
              <StatBox label="Temp. média" value={fmt(r.temp_mean, 1)} unit="°C" />
              <StatBox label="Temp. mín" value={fmt(r.temp_min, 1)} unit="°C" />
              <StatBox label="Temp. máx" value={fmt(r.temp_max, 1)} unit="°C" />
              <StatBox label="Umidade" value={fmt(r.humidity, 1)} unit="%" />
              <StatBox label="Vento" value={fmt(r.wind_speed, 1)} unit="m/s" />
              <StatBox label="Radiação" value={fmt(r.solar_radiation, 1)} unit="MJ/m²" />
            </div>
            {r.et0_delta_pct != null && Math.abs(r.et0_delta_pct) > 10 && (
              <p className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-300">
                Divergência acima de 10% entre ET₀ Cotrim e ET₀ Open-Meteo. Possíveis causas: altitude imprecisa, dados de radiação/umidade instáveis ou coordenada com contraste micrometeorológico local. Verifique a altitude e as leituras de radiação.
              </p>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma leitura observada ainda. Clique em &quot;Sincronizar agora&quot; para trazer os últimos 7 dias.
          </p>
        )}
      </Card>

      <MeteoblueCompareCard farmId={activeFarmId} />

      {run && (
        <Card>
          <h4 className="mb-2 text-sm font-semibold text-graphite-900 dark:text-white">Última execução de ingestão (Open-Meteo)</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <div><span className="text-xs text-gray-500 dark:text-gray-400">Quando</span><br />{new Date(run.run_at).toLocaleString("pt-BR")}</div>
            <div><span className="text-xs text-gray-500 dark:text-gray-400">Status</span><br />{run.status}</div>
            <div><span className="text-xs text-gray-500 dark:text-gray-400">Inseridas / Atualizadas / Ignoradas</span><br />{run.rows_inserted} / {run.rows_updated} / {run.rows_skipped}</div>
            <div><span className="text-xs text-gray-500 dark:text-gray-400">Duração</span><br />{run.duration_ms != null ? `${run.duration_ms} ms` : "—"}</div>
            <div><span className="text-xs text-gray-500 dark:text-gray-400">Erro</span><br />{run.error_message ?? "—"}</div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-graphite-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Contexto da requisição</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Latitude enviada</span><br />{fmt(run.request_latitude, 4)}°</div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Longitude enviada</span><br />{fmt(run.request_longitude, 4)}°</div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Timezone</span><br />{run.request_timezone ?? "—"}</div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Altitude usada</span><br />{fmt(run.altitude_used, 0)} m <span className="text-xs text-gray-500 dark:text-gray-400">({run.altitude_origin ?? "—"})</span></div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Elevation Open-Meteo</span><br />{fmt(run.response_elevation, 0)} m</div>
              <div><span className="text-xs text-gray-500 dark:text-gray-400">Δ ET₀ médio (7d)</span><br />{run.et0_delta_pct_avg != null ? `${run.et0_delta_pct_avg.toFixed(1)}%` : "—"}</div>
            </div>
            {run.request_url && (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-graphite-900 dark:hover:text-white">URL requisitada</summary>
                <p className="mt-1 break-all rounded-md border border-gray-200 bg-gray-50 p-2 font-mono text-[11px] dark:border-graphite-700 dark:bg-graphite-800">
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
    return "text-gray-500 dark:text-gray-400";
  };

  const fmtN = (v: number | null, digits = 1) => (v == null ? "—" : v.toFixed(digits));
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? b - a : null);
  const fmtD = (v: number | null, digits = 1) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(digits));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-graphite-900 dark:text-white">Comparação meteoblue</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
        <p className={`mb-3 text-sm ${message.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {message.text}
        </p>
      )}

      {diagnostic && (
        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-graphite-700 dark:bg-graphite-800">
          <div className="grid gap-2 sm:grid-cols-3">
            <div><span className="text-gray-500 dark:text-gray-400">Chave configurada:</span> {diagnostic.keyPresent ? "sim" : "não"}</div>
            <div><span className="text-gray-500 dark:text-gray-400">Status:</span> {diagnostic.status}</div>
            <div><span className="text-gray-500 dark:text-gray-400">Latência:</span> {diagnostic.latencyMs} ms</div>
            {diagnostic.httpStatus != null && (
              <div><span className="text-gray-500 dark:text-gray-400">HTTP:</span> {diagnostic.httpStatus}</div>
            )}
            {diagnostic.error && (
              <div className="sm:col-span-3 text-red-600 dark:text-red-400"><span className="text-gray-500 dark:text-gray-400">Erro:</span> {diagnostic.error}</div>
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
        <p className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">Carregando comparação (últimos 7 dias)...</p>
      )}

      {!loadingComparison && mbStationExists === false && !message && (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Clique em &quot;Testar meteoblue&quot; para criar a estação virtual e importar os primeiros 7 dias.
        </p>
      )}

      {comparison.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-graphite-800">
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
                  <tr key={r.date} className="border-t border-gray-100 dark:border-graphite-700">
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
