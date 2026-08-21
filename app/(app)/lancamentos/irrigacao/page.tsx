"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button, Card, Input, Select, Table, Modal, ConfirmDialog, TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { PrerequisiteNotice } from "@/components/onboarding";
import {
  HOURS_FORMULA,
  VOLUME_FORMULA,
  buildIrrigationEventInsert,
  deriveAppliedVolume,
  deriveOperatingHours,
  validateIrrigationDepth,
  validateOperatingHours,
} from "@/modules/irrigation/services";
import { isActiveParcel, isHistoricParcel, assertParcelAcceptsOperationalLaunch } from "@/modules/assignment/services";
import { pickTariffForDate, priceIrrigationEvent, type TariffRow } from "@/modules/costs/services";

interface EventRow {
  id: string;
  pivot_id: string;
  parcel_id: string | null;
  started_at: string;
  ended_at: string | null;
  depth_mm: number;
  volume_m3: number;
  operating_hours: number | null;
  energy_kwh: number | null;
  cost: number | null;
  notes: string | null;
}

interface PivotLite {
  id: string;
  name: string;
  area: number;
  flow_rate: number;
  pump_power: number | null;
  installed_power_kw: number | null;
  motor_efficiency: number | null;
  specific_consumption: number | null;
  energy_cost: number | null;
}
interface ParcelLite { id: string; name: string | null; pivot_id: string; status: string | null; active: boolean | null }

interface FormState {
  pivot_id: string;
  date: string;
  time: string;
  depth_mm: string;
  hours: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const nowHm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const EMPTY: FormState = { pivot_id: "", date: today(), time: nowHm(), depth_mm: "", hours: "", notes: "" };

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function LancamentoIrrigacaoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [parcels, setParcels] = useState<ParcelLite[]>([]);
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [filterPivot, setFilterPivot] = useState("");

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("pivots")
      .select("id, name, area, flow_rate, pump_power, installed_power_kw, motor_efficiency, specific_consumption, energy_cost")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => { if (data) setPivots(data as PivotLite[]); });
  }, [activeFarmId, supabase]);

  useEffect(() => {
    if (pivots.length === 0) { setParcels([]); return; }
    supabase
      .from("pivot_crop_assignments")
      .select("id, name, pivot_id, status, active")
      .in("pivot_id", pivots.map((p) => p.id))
      .then(({ data }) => { if (data) setParcels(data as ParcelLite[]); });
  }, [pivots, supabase]);

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("energy_tariffs")
      .select("id, valid_from, valid_to, rate_peak, rate_off_peak, peak_start, peak_end")
      .eq("farm_id", activeFarmId)
      .then(({ data }) => { if (data) setTariffs(data as TariffRow[]); });
  }, [activeFarmId, supabase]);

  const fetchEvents = useCallback(async () => {
    if (pivots.length === 0) { setEvents([]); return; }
    setLoading(true);
    let q = supabase
      .from("irrigation_events")
      .select("id, pivot_id, parcel_id, started_at, ended_at, depth_mm, volume_m3, operating_hours, energy_kwh, cost, notes")
      .in("pivot_id", pivots.map((p) => p.id))
      .order("started_at", { ascending: false })
      .limit(200);
    if (filterPivot) q = q.eq("pivot_id", filterPivot);
    const { data } = await q;
    setEvents((data ?? []) as EventRow[]);
    setLoading(false);
  }, [pivots, filterPivot, supabase]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const pivotMap = useMemo(() => new Map(pivots.map((p) => [p.id, p])), [pivots]);
  const parcelMap = useMemo(() => new Map(parcels.map((p) => [p.id, p.name || "Parcela"])), [parcels]);

  const activeParcelFor = useCallback((pivotId: string) => {
    return parcels.find((p) => p.pivot_id === pivotId && isActiveParcel(p.status, p.active)) ?? null;
  }, [parcels]);

  const selectedPivot = form.pivot_id ? pivotMap.get(form.pivot_id) : undefined;
  const depthNum = form.depth_mm ? Number(form.depth_mm) : NaN;
  const previewVolume = selectedPivot && Number.isFinite(depthNum) && depthNum > 0
    ? deriveAppliedVolume(depthNum, selectedPivot.area)
    : null;
  const previewHours = selectedPivot && previewVolume != null
    ? deriveOperatingHours(depthNum, selectedPivot.area, selectedPivot.flow_rate)
    : null;
  const previewHoursUsed = form.hours !== "" && Number.isFinite(Number(form.hours))
    ? Number(form.hours)
    : previewHours;
  const previewPrice = selectedPivot && previewVolume != null && previewHoursUsed != null && previewHoursUsed > 0
    ? priceIrrigationEvent({
      operatingHours: previewHoursUsed,
      volumeM3: previewVolume,
      depthMm: depthNum,
      areaHa: selectedPivot.area,
      pumpPowerCv: selectedPivot.pump_power,
      installedPowerKw: selectedPivot.installed_power_kw,
      motorEfficiency: selectedPivot.motor_efficiency,
      specificConsumptionKwhM3: selectedPivot.specific_consumption,
      startedAt: `${form.date}T${form.time || "06:00"}:00`,
      tariff: pickTariffForDate(tariffs, form.date),
      pivotEnergyCostReaisPerKwh: selectedPivot.energy_cost,
    })
    : null;

  const patch = (changes: Partial<FormState>) => setForm((f) => ({ ...f, ...changes }));

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, date: today(), time: nowHm() });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (r: EventRow) => {
    setEditing(r);
    const d = new Date(r.started_at);
    const date = Number.isNaN(d.getTime()) ? r.started_at.slice(0, 10) : d.toISOString().slice(0, 10);
    const time = Number.isNaN(d.getTime())
      ? "06:00"
      : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    setForm({
      pivot_id: r.pivot_id,
      date,
      time,
      depth_mm: String(r.depth_mm),
      hours: r.operating_hours != null ? String(r.operating_hours) : "",
      notes: r.notes ?? "",
    });
    setFormError("");
    setModalOpen(true);
  };

  const onDepthChange = (v: string) => {
    const pivot = form.pivot_id ? pivotMap.get(form.pivot_id) : undefined;
    const n = Number(v);
    const hours = pivot && Number.isFinite(n) && n > 0
      ? String(deriveOperatingHours(n, pivot.area, pivot.flow_rate))
      : form.hours;
    patch({ depth_mm: v, hours });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.pivot_id) { setFormError("Selecione o pivô."); return; }
    const pivot = pivotMap.get(form.pivot_id);
    if (!pivot) { setFormError("Pivô inválido."); return; }
    const depth = Number(form.depth_mm);
    const depthErr = validateIrrigationDepth(depth);
    if (depthErr) { setFormError(depthErr); return; }
    const hoursOverride = form.hours === "" ? null : Number(form.hours);
    const hoursErr = validateOperatingHours(hoursOverride);
    if (hoursErr) { setFormError(hoursErr); return; }

    const parcel = activeParcelFor(form.pivot_id);
    const launchErr = assertParcelAcceptsOperationalLaunch(
      editing?.parcel_id ? parcels.find((p) => p.id === editing.parcel_id) ?? parcel : parcel,
    );
    if (launchErr) { setFormError(launchErr); return; }
    const payload = buildIrrigationEventInsert({
      pivotId: form.pivot_id,
      parcelId: editing?.parcel_id ?? parcel?.id ?? null,
      dateYmd: form.date,
      timeHm: form.time,
      depthMm: depth,
      areaHa: pivot.area,
      flowRateM3h: pivot.flow_rate,
      hoursOverride,
      notes: form.notes || null,
    });
    const priced = priceIrrigationEvent({
      operatingHours: payload.operating_hours,
      volumeM3: payload.volume_m3,
      depthMm: payload.depth_mm,
      areaHa: pivot.area,
      pumpPowerCv: pivot.pump_power,
      installedPowerKw: pivot.installed_power_kw,
      motorEfficiency: pivot.motor_efficiency,
      specificConsumptionKwhM3: pivot.specific_consumption,
      startedAt: payload.started_at,
      tariff: pickTariffForDate(tariffs, form.date),
      pivotEnergyCostReaisPerKwh: pivot.energy_cost,
    });
    const row = {
      ...payload,
      energy_kwh: priced.energy_kwh,
      cost: priced.cost,
      tariff_rate: priced.tariff_rate,
      energy_source: priced.energy_source,
    };

    setSaving(true);
    setFormError("");
    try {
      const { error } = editing
        ? await supabase.from("irrigation_events").update(row).eq("id", editing.id)
        : await supabase.from("irrigation_events").insert(row);
      if (error) setFormError(error.message);
      else {
        setModalOpen(false);
        setEditing(null);
        fetchEvents();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    await supabase.from("irrigation_events").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    setSaving(false);
    fetchEvents();
  };

  const parcelIsHistoric = (parcelId: string | null) => {
    if (!parcelId) return false;
    const p = parcels.find((x) => x.id === parcelId);
    return p ? isHistoricParcel(p.status, p.active) : false;
  };

  const columns: Column<EventRow>[] = [
    { header: "Data / hora", render: (r) => fmtWhen(r.started_at) },
    { header: "Pivô", render: (r) => <span className="font-medium">{pivotMap.get(r.pivot_id)?.name ?? "—"}</span> },
    { header: "Parcela", render: (r) => r.parcel_id ? (parcelMap.get(r.parcel_id) ?? "ciclo") : "—" },
    { header: "Lâmina", render: (r) => <span className="tabular-nums">{r.depth_mm.toFixed(1)} mm</span> },
    { header: "Volume", render: (r) => <span className="tabular-nums">{r.volume_m3.toLocaleString("pt-BR")} m³</span> },
    { header: "Horas", render: (r) => r.operating_hours != null ? `${r.operating_hours.toFixed(1)} h` : "—" },
    { header: "Energia", render: (r) => r.energy_kwh != null ? `${r.energy_kwh.toFixed(1)} kWh` : "—" },
    { header: "Custo", render: (r) => r.cost != null ? r.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—" },
    { header: "Observação", render: (r) => <span className="text-xs text-graphite-500 dark:text-gray-400">{r.notes ?? "—"}</span> },
    {
      header: "Ações",
      align: "right",
      render: (r) => parcelIsHistoric(r.parcel_id) ? (
        <span className="text-xs text-graphite-400 dark:text-gray-500">Histórico</span>
      ) : (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>Excluir</Button>
        </div>
      ),
    },
  ];

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader titulo="Irrigação aplicada" descricao="Evento real: lâmina bruta, volume e horas — alimenta o balanço" />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Escolha uma fazenda ativa para registrar irrigações."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  const selectedParcel = form.pivot_id ? activeParcelFor(form.pivot_id) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Irrigação aplicada"
        descricao="Registre o evento realizado. A lâmina bruta entra no balanço hídrico (I_ef = I × eficiência). Custo e energia vêm depois."
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[220px]">
          <Select
            id="filter_pivot"
            label="Filtrar por pivô"
            value={filterPivot}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterPivot(e.target.value)}
            options={[
              { value: "", label: "Todos os pivôs" },
              ...pivots.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <Button onClick={openNew}>Novo evento</Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
            <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
          </div>
        ) : events.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
            Nenhum evento registrado. Clique em <b>Novo evento</b> para lançar a irrigação realizada.
          </p>
        ) : (
          <Table columns={columns} data={events} getKey={(r) => r.id} />
        )}
      </Card>

      <p className="text-[11px] text-graphite-400 dark:text-gray-500">{VOLUME_FORMULA} · {HOURS_FORMULA}</p>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "Editar evento de irrigação" : "Novo evento de irrigação"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="pivot_id"
              label="Pivô"
              required
              value={form.pivot_id}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => patch({ pivot_id: e.target.value })}
              options={pivots.map((p) => ({ value: p.id, label: p.name }))}
            />
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">Parcela ativa</p>
              <p className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-graphite-800 dark:border-white/[0.08] dark:text-gray-100">
                {form.pivot_id
                  ? (selectedParcel?.name || (selectedParcel ? "Parcela ativa" : "Nenhuma parcela ativa neste pivô"))
                  : "Selecione o pivô"}
              </p>
            </div>
            <Input id="date" label="Data" type="date" required value={form.date} onChange={(e) => patch({ date: e.target.value })} />
            <Input id="time" label="Hora" type="time" required value={form.time} onChange={(e) => patch({ time: e.target.value })} />
            <Input
              id="depth_mm"
              label="Lâmina bruta aplicada (mm)"
              type="number"
              min={0.1}
              step={0.1}
              required
              value={form.depth_mm}
              onChange={(e) => onDepthChange(e.target.value)}
            />
            <Input
              id="hours"
              label="Horas de operação"
              type="number"
              min={0}
              step={0.1}
              value={form.hours}
              onChange={(e) => patch({ hours: e.target.value })}
            />
          </div>
          {previewVolume != null && (
            <p className="text-xs text-graphite-500 dark:text-gray-400">
              Volume: <strong className="text-graphite-800 dark:text-white">{previewVolume.toLocaleString("pt-BR")} m³</strong>
              {previewHours != null && previewHours > 0 && (
                <> · Tempo estimado: <strong className="text-graphite-800 dark:text-white">{previewHours.toFixed(1)} h</strong></>
              )}
              {previewPrice?.energy_kwh != null && (
                <> · Energia: <strong className="text-graphite-800 dark:text-white">{previewPrice.energy_kwh.toFixed(1)} kWh</strong></>
              )}
              {previewPrice?.cost != null && (
                <> · Custo: <strong className="text-graphite-800 dark:text-white">{previewPrice.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></>
              )}
              {previewPrice?.pendingReason && (
                <> · {previewPrice.pendingReason}</>
              )}
            </p>
          )}
          <TextArea
            id="notes"
            label="Observação (opcional)"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Ex.: volta completa; percentímetro 80%"
          />
          {formError && <p role="alert" className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button type="submit" disabled={saving || !selectedParcel}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir evento"
        message={`Excluir irrigação de ${deleteTarget ? fmtWhen(deleteTarget.started_at) : ""}? O próximo cálculo do balanço deixa de contar esta lâmina.`}
        confirmLabel="Excluir"
        loading={saving}
      />
    </div>
  );
}
