"use client";

import { useState, useEffect, useCallback } from "react";
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
  { id: "estacoes", label: "Estações" },
  { id: "lancamento", label: "Lançamento Manual" },
  { id: "historico", label: "Histórico Climático" },
];

export default function ClimaPage() {
  const [activeTab, setActiveTab] = useState("estacoes");

  return (
    <div className="space-y-6">
      <PageHeader titulo="Clima" descricao="Estações meteorológicas, dados climáticos e histórico" />
      <Tabs tabs={climaTabs} activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "estacoes" && <StationsTab />}
        {activeTab === "lancamento" && <ManualEntryTab />}
        {activeTab === "historico" && <HistoryTab />}
      </div>
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
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          r.active
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-700/30 dark:text-gray-400"
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
    return <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione uma fazenda ativa para gerenciar estações.</p></Card>;
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>Nova estação</Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : activeStations.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma estação cadastrada para esta fazenda.</p>
        ) : (
          <Table columns={columns} data={activeStations} getKey={(r) => r.id} />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? "Editar estação" : "Nova estação"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
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
          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
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
    return <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione uma fazenda ativa para lançar dados climáticos.</p></Card>;
  }

  if (stations.length === 0) {
    return <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Cadastre uma estação meteorológica primeiro na aba &quot;Estações&quot;.</p></Card>;
  }

  const fieldWarning = (fieldName: string) => {
    const issue = validationIssues.find((i) => i.field === fieldName && i.level === "warning");
    return issue ? (
      <span className="mt-1 block text-xs text-yellow-600 dark:text-yellow-400">{issue.message}</span>
    ) : null;
  };

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-graphite-900 dark:text-white">Lançamento de dados climáticos</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
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

        {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        {successMsg && <p className="text-sm text-green-600 dark:text-green-400">{successMsg}</p>}

        <div className="flex justify-end gap-3 pt-2">
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
    { header: "Rad.", render: (r) => r.solar_radiation.toFixed(1), align: "right" },
    {
      header: "",
      align: "right",
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
      ),
    },
  ];

  if (!activeFarmId) {
    return <Card><p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Selecione uma fazenda ativa para ver o histórico.</p></Card>;
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
          <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-graphite-700 dark:bg-graphite-800 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Período</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.days} dias</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Temp. média</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgTemp}°C</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Chuva total</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.totalPrecip} mm</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">ET₀ média</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgET0} mm/dia</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">ET₀ acumulada</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.totalET0} mm</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Chuva efetiva</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.totalEffPrecip} mm</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">UR média</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgHumidity}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Vento médio</p>
              <p className="text-sm font-semibold text-graphite-900 dark:text-white">{summary.avgWind} m/s</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : readings.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum dado climático encontrado para o período selecionado.</p>
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
