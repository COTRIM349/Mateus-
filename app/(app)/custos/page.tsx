"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Input, Select, StatCard, Table, Tabs, type Column } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { PrerequisiteNotice } from "@/components/onboarding";
import { createClient } from "@/lib/supabase/client";
import {
  COST_FORMULA,
  COST_PER_MM_HA_FORMULA,
  ENERGY_FORMULA,
  aggregatePricedEvents,
  pickTariffForDate,
  priceIrrigationEvent,
  type CostGroupBy,
  type PricedEventRow,
  type TariffRow,
} from "@/modules/costs/services";

interface EventRow {
  id: string;
  pivot_id: string;
  parcel_id: string | null;
  started_at: string;
  depth_mm: number;
  volume_m3: number;
  operating_hours: number | null;
  energy_kwh: number | null;
  cost: number | null;
}
interface PivotLite {
  id: string;
  name: string;
  area: number;
  pump_power: number | null;
  installed_power_kw: number | null;
  motor_efficiency: number | null;
  specific_consumption: number | null;
  energy_cost: number | null;
}
interface ParcelLite {
  id: string;
  name: string | null;
  pivot_id: string;
  culture_id: string;
  season_id: string;
}
interface Named { id: string; name: string }

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CustosPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [parcels, setParcels] = useState<ParcelLite[]>([]);
  const [cultures, setCultures] = useState<Named[]>([]);
  const [seasons, setSeasons] = useState<Named[]>([]);
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [groupBy, setGroupBy] = useState<CostGroupBy>("pivot");
  const [filterPivot, setFilterPivot] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");

  const [tariffForm, setTariffForm] = useState({
    id: "",
    tariff_type: "convencional",
    rate_off_peak: "",
    rate_peak: "",
    peak_start: "18",
    peak_end: "21",
    valid_from: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);
    const [pv, cu, ss, tf] = await Promise.all([
      supabase.from("pivots").select("id, name, area, pump_power, installed_power_kw, motor_efficiency, specific_consumption, energy_cost").eq("farm_id", activeFarmId).order("name"),
      supabase.from("cultures").select("id, name").eq("active", true).order("name"),
      supabase.from("seasons").select("id, name").eq("farm_id", activeFarmId).order("start_date", { ascending: false }),
      supabase.from("energy_tariffs").select("id, valid_from, valid_to, rate_peak, rate_off_peak, peak_start, peak_end, tariff_type").eq("farm_id", activeFarmId).order("valid_from", { ascending: false }),
    ]);
    const pivotRows = (pv.data ?? []) as PivotLite[];
    setPivots(pivotRows);
    setCultures((cu.data ?? []) as Named[]);
    setSeasons((ss.data ?? []) as Named[]);
    const tariffRows = (tf.data ?? []) as Array<TariffRow & { tariff_type?: string }>;
    setTariffs(tariffRows);
    const current = tariffRows[0];
    if (current) {
      setTariffForm({
        id: current.id,
        tariff_type: (current as { tariff_type?: string }).tariff_type ?? "convencional",
        rate_off_peak: String(current.rate_off_peak ?? ""),
        rate_peak: String(current.rate_peak ?? ""),
        peak_start: String(current.peak_start ?? 18),
        peak_end: String(current.peak_end ?? 21),
        valid_from: current.valid_from,
      });
    }

    if (pivotRows.length === 0) {
      setEvents([]);
      setParcels([]);
      setLoading(false);
      return;
    }
    const pivotIds = pivotRows.map((p) => p.id);
    const [ev, asg] = await Promise.all([
      supabase.from("irrigation_events").select("id, pivot_id, parcel_id, started_at, depth_mm, volume_m3, operating_hours, energy_kwh, cost").in("pivot_id", pivotIds).order("started_at", { ascending: false }).limit(500),
      supabase.from("pivot_crop_assignments").select("id, name, pivot_id, culture_id, season_id").in("pivot_id", pivotIds),
    ]);
    setEvents((ev.data ?? []) as EventRow[]);
    setParcels((asg.data ?? []) as ParcelLite[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => { load(); }, [load]);

  const pivotMap = useMemo(() => new Map(pivots.map((p) => [p.id, p])), [pivots]);
  const parcelMap = useMemo(() => new Map(parcels.map((p) => [p.id, p])), [parcels]);
  const cultureMap = useMemo(() => new Map(cultures.map((c) => [c.id, c.name])), [cultures]);
  const seasonMap = useMemo(() => new Map(seasons.map((s) => [s.id, s.name])), [seasons]);

  const pricedRows: PricedEventRow[] = useMemo(() => {
    return events
      .filter((e) => !filterPivot || e.pivot_id === filterPivot)
      .filter((e) => !periodFrom || e.started_at.slice(0, 10) >= periodFrom)
      .filter((e) => !periodTo || e.started_at.slice(0, 10) <= periodTo)
      .map((e) => {
        const pivot = pivotMap.get(e.pivot_id);
        const parcel = e.parcel_id ? parcelMap.get(e.parcel_id) : undefined;
        return {
          id: e.id,
          pivotId: e.pivot_id,
          pivotName: pivot?.name ?? "—",
          parcelId: e.parcel_id,
          parcelName: parcel?.name ?? null,
          cultureId: parcel?.culture_id ?? null,
          cultureName: parcel ? cultureMap.get(parcel.culture_id) ?? null : null,
          seasonId: parcel?.season_id ?? null,
          seasonName: parcel ? seasonMap.get(parcel.season_id) ?? null : null,
          startedAt: e.started_at,
          depthMm: e.depth_mm,
          volumeM3: e.volume_m3,
          areaHa: pivot?.area ?? 0,
          energyKwh: e.energy_kwh,
          cost: e.cost,
        };
      });
  }, [events, filterPivot, periodFrom, periodTo, pivotMap, parcelMap, cultureMap, seasonMap]);

  const groups = useMemo(() => aggregatePricedEvents(pricedRows, groupBy), [pricedRows, groupBy]);
  const farm = useMemo(() => {
    const cost = pricedRows.reduce((s, r) => s + (r.cost ?? 0), 0);
    const energy = pricedRows.reduce((s, r) => s + (r.energyKwh ?? 0), 0);
    const volume = pricedRows.reduce((s, r) => s + r.volumeM3, 0);
    const depthArea = pricedRows.reduce((s, r) => s + r.depthMm * r.areaHa, 0);
    const areaByPivot = new Map<string, number>();
    for (const r of pricedRows) areaByPivot.set(r.pivotId, r.areaHa);
    const area = Array.from(areaByPivot.values()).reduce((a, b) => a + b, 0);
    return { cost, energy, volume, events: pricedRows.length, area, depthArea };
  }, [pricedRows]);

  const saveTariff = async () => {
    if (!activeFarmId) return;
    const off = Number(tariffForm.rate_off_peak);
    const peak = Number(tariffForm.rate_peak || tariffForm.rate_off_peak);
    if (!Number.isFinite(off) || off <= 0) {
      setMessage("Informe a tarifa fora de ponta (R$/kWh), maior que zero.");
      return;
    }
    setSaving(true);
    setMessage("");
    const row = {
      farm_id: activeFarmId,
      tariff_type: tariffForm.tariff_type,
      rate_off_peak: off,
      rate_peak: Number.isFinite(peak) && peak > 0 ? peak : off,
      peak_start: Number(tariffForm.peak_start) || 18,
      peak_end: Number(tariffForm.peak_end) || 21,
      demand_rate: 0,
      valid_from: tariffForm.valid_from,
      valid_to: null,
    };
    const { error } = tariffForm.id
      ? await supabase.from("energy_tariffs").update(row).eq("id", tariffForm.id)
      : await supabase.from("energy_tariffs").insert(row);
    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Tarifa salva. Recalcule os eventos para aplicar o custo.");
      load();
    }
  };

  const recalculate = async () => {
    setSaving(true);
    setMessage("");
    let updated = 0;
    let skipped = 0;
    for (const ev of events) {
      const pivot = pivotMap.get(ev.pivot_id);
      if (!pivot) { skipped += 1; continue; }
      const priced = priceIrrigationEvent({
        operatingHours: ev.operating_hours ?? 0,
        volumeM3: ev.volume_m3,
        depthMm: ev.depth_mm,
        areaHa: pivot.area,
        pumpPowerCv: pivot.pump_power,
        installedPowerKw: pivot.installed_power_kw,
        motorEfficiency: pivot.motor_efficiency,
        specificConsumptionKwhM3: pivot.specific_consumption,
        startedAt: ev.started_at,
        tariff: pickTariffForDate(tariffs, ev.started_at.slice(0, 10)),
        pivotEnergyCostReaisPerKwh: pivot.energy_cost,
      });
      if (priced.energy_kwh == null && priced.cost == null) { skipped += 1; continue; }
      const { error } = await supabase.from("irrigation_events").update({
        energy_kwh: priced.energy_kwh,
        cost: priced.cost,
        tariff_rate: priced.tariff_rate,
        energy_source: priced.energy_source,
      }).eq("id", ev.id);
      if (!error) updated += 1;
    }
    setSaving(false);
    setMessage(updated > 0
      ? `${updated} evento(s) precificado(s). ${skipped ? skipped + " sem potência/tarifa." : ""}`
      : "Nenhum evento pôde ser precificado. Cadastre potência na ficha e tarifa (R$/kWh).");
    await load();
  };

  const eventColumns: Column<PricedEventRow>[] = [
    { header: "Data", render: (r) => fmtWhen(r.startedAt) },
    { header: "Pivô", render: (r) => <span className="font-medium">{r.pivotName}</span> },
    { header: "Parcela", render: (r) => r.parcelName ?? "—" },
    { header: "Lâmina", render: (r) => <span className="tabular-nums">{r.depthMm.toFixed(1)} mm</span> },
    { header: "Volume", render: (r) => <span className="tabular-nums">{r.volumeM3.toLocaleString("pt-BR")} m³</span> },
    { header: "Energia", render: (r) => r.energyKwh != null ? `${r.energyKwh.toFixed(1)} kWh` : "—" },
    { header: "R$/evento", render: (r) => money(r.cost) },
  ];

  const groupColumns: Column<ReturnType<typeof aggregatePricedEvents>[number]>[] = [
    { header: "Grupo", render: (r) => <span className="font-medium">{r.label}</span> },
    { header: "Eventos", render: (r) => String(r.eventCount), align: "right" },
    { header: "Energia", render: (r) => `${r.totalEnergyKwh.toFixed(0)} kWh`, align: "right" },
    { header: "Custo", render: (r) => money(r.totalCost), align: "right" },
    { header: "R$/evento", render: (r) => money(r.costPerEvent), align: "right" },
    { header: "R$/m³", render: (r) => r.costPerM3 != null ? r.costPerM3.toFixed(4) : "—", align: "right" },
    { header: "R$/mm/ha", render: (r) => r.costPerMmHa != null ? r.costPerMmHa.toFixed(4) : "—", align: "right" },
    { header: "R$/ha", render: (r) => money(r.costPerHa), align: "right" },
  ];

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader titulo="Custos" descricao="Custo nasce do evento real: volume → horas → energia → tarifa." />
        <PrerequisiteNotice title="Selecione uma fazenda" description="O custo da irrigação pertence à fazenda ativa." actionLabel="Ir para Fazendas" actionHref="/fazendas" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Custos da irrigação"
        descricao="O custo nasce do evento realizado. Sem tarifa ou potência na ficha, o valor permanece vazio."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard metric={{ id: "c", title: "Custo total", value: money(farm.cost), description: `${farm.events} evento(s)` }} />
        <StatCard metric={{ id: "e", title: "Energia", value: `${farm.energy.toFixed(0)} kWh`, description: ENERGY_FORMULA }} />
        <StatCard metric={{ id: "m3", title: "R$/m³", value: farm.volume > 0 ? (farm.cost / farm.volume).toFixed(4) : "—", description: COST_FORMULA }} />
        <StatCard metric={{ id: "mmha", title: "R$/mm/ha", value: farm.depthArea > 0 ? (farm.cost / farm.depthArea).toFixed(4) : "—", description: COST_PER_MM_HA_FORMULA }} />
      </div>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-graphite-800 dark:text-white">Tarifa da fazenda (R$/kWh)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Select
            id="tariff_type" label="Tipo"
            value={tariffForm.tariff_type}
            onChange={(e) => setTariffForm((f) => ({ ...f, tariff_type: e.target.value }))}
            options={[
              { value: "convencional", label: "Convencional" },
              { value: "verde", label: "Verde" },
              { value: "azul", label: "Azul" },
            ]}
          />
          <Input id="rate_off" label="Fora de ponta (R$/kWh)" type="number" min={0} step={0.0001} value={tariffForm.rate_off_peak} onChange={(e) => setTariffForm((f) => ({ ...f, rate_off_peak: e.target.value }))} />
          <Input id="rate_peak" label="Ponta (R$/kWh)" type="number" min={0} step={0.0001} value={tariffForm.rate_peak} onChange={(e) => setTariffForm((f) => ({ ...f, rate_peak: e.target.value }))} />
          <Input id="peak_start" label="Início ponta (h)" type="number" min={0} max={23} value={tariffForm.peak_start} onChange={(e) => setTariffForm((f) => ({ ...f, peak_start: e.target.value }))} />
          <Input id="peak_end" label="Fim ponta (h)" type="number" min={0} max={23} value={tariffForm.peak_end} onChange={(e) => setTariffForm((f) => ({ ...f, peak_end: e.target.value }))} />
          <Input id="valid_from" label="Vigente desde" type="date" value={tariffForm.valid_from} onChange={(e) => setTariffForm((f) => ({ ...f, valid_from: e.target.value }))} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={saveTariff} disabled={saving}>{saving ? "Salvando..." : "Salvar tarifa"}</Button>
          <Button type="button" variant="secondary" onClick={recalculate} disabled={saving || events.length === 0}>
            Recalcular eventos
          </Button>
        </div>
        <p className="text-[11px] text-graphite-400 dark:text-gray-500">
          {ENERGY_FORMULA}. Fallback da ficha: R$/kWh do pivô. Não se inventa tarifa padrão.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Select
          id="filtro_pivo" label="Pivô" value={filterPivot}
          onChange={(e) => setFilterPivot(e.target.value)}
          options={pivots.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Input id="de" label="Período de" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        <Input id="ate" label="Período até" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
      </div>

      <Tabs
        tabs={[
          { id: "pivot", label: "Por pivô" },
          { id: "parcel", label: "Por parcela" },
          { id: "culture", label: "Por cultura" },
          { id: "season", label: "Por safra" },
        ]}
        activeTab={groupBy}
        onChange={(id) => setGroupBy(id as CostGroupBy)}
      />

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-graphite-400">Carregando...</p>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
            Nenhum evento no filtro. Lance irrigação em Lançamentos e, se o custo estiver vazio, salve a tarifa e recálcule.
          </p>
        ) : (
          <Table columns={groupColumns} data={groups} getKey={(r) => r.key} />
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-graphite-800 dark:text-white">Eventos (R$/evento)</h2>
        {pricedRows.length === 0 ? (
          <p className="py-4 text-sm text-graphite-400">Nenhum evento neste período.</p>
        ) : (
          <Table columns={eventColumns} data={pricedRows} getKey={(r) => r.id} />
        )}
      </Card>

      {message && <p role="status" className="text-sm text-graphite-600 dark:text-gray-300">{message}</p>}
    </div>
  );
}
