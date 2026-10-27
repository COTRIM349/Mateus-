"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Table,
  TextArea,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { PrerequisiteNotice } from "@/components/onboarding";
import {
  buildIrrigationEventInsert,
  deriveDepthFromPercentimeter,
  deriveHoursFromHorimeter,
  irrigationDuplicateCounts,
  isPossibleDuplicate,
  validateHorimeter,
  validateIrrigationDepth,
  validateOperatingHours,
  validatePercentimeterPct,
} from "@/modules/irrigation/services";
import {
  pickTariffForDate,
  priceIrrigationEvent,
  type TariffRow,
} from "@/modules/costs/services";

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
  depth_100_pct: number | null;
  full_turn_time: number | null;
}

interface ParcelLite {
  id: string;
  name: string | null;
}

interface EventRow {
  id: string;
  pivot_id: string;
  parcel_id: string | null;
  started_at: string;
  depth_mm: number;
  percentimeter_pct: number | null;
  horimeter_initial: number | null;
  horimeter_final: number | null;
  volume_m3: number;
  operating_hours: number | null;
  energy_kwh: number | null;
  cost: number | null;
  notes: string | null;
}

interface EditForm {
  date: string;
  percentimeter_pct: string;
  horimeter_initial: string;
  horimeter_final: string;
  notes: string;
}

function fmtDate(iso: string): string {
  const ymd = iso.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

function numberText(value: number | null | undefined, digits = 2): string {
  return value == null ? "—" : value.toFixed(digits);
}

export default function CorrecaoIrrigacaoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [parcels, setParcels] = useState<ParcelLite[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [pivotFilter, setPivotFilter] = useState("");
  const [onlyDuplicates, setOnlyDuplicates] = useState(true);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [form, setForm] = useState<EditForm>({
    date: "",
    percentimeter_pct: "",
    horimeter_initial: "",
    horimeter_final: "",
    notes: "",
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!activeFarmId) return;
    setLoading(true);

    const { data: pv } = await supabase
      .from("pivots")
      .select("id, name, area, flow_rate, pump_power, installed_power_kw, motor_efficiency, specific_consumption, energy_cost, depth_100_pct, full_turn_time")
      .eq("farm_id", activeFarmId)
      .order("name");

    const pivotRows = (pv ?? []) as PivotLite[];
    setPivots(pivotRows);

    if (pivotRows.length === 0) {
      setParcels([]);
      setEvents([]);
      setTariffs([]);
      setLoading(false);
      return;
    }

    const pivotIds = pivotRows.map((p) => p.id);
    const [parcelResult, eventResult, tariffResult] = await Promise.all([
      supabase
        .from("pivot_crop_assignments")
        .select("id, name")
        .in("pivot_id", pivotIds),
      supabase
        .from("irrigation_events")
        .select("id, pivot_id, parcel_id, started_at, depth_mm, percentimeter_pct, horimeter_initial, horimeter_final, volume_m3, operating_hours, energy_kwh, cost, notes")
        .in("pivot_id", pivotIds)
        .order("started_at", { ascending: false })
        .limit(1000),
      supabase
        .from("energy_tariffs")
        .select("id, valid_from, valid_to, rate_peak, rate_off_peak, peak_start, peak_end")
        .eq("farm_id", activeFarmId),
    ]);

    setParcels((parcelResult.data ?? []) as ParcelLite[]);
    setEvents((eventResult.data ?? []) as EventRow[]);
    setTariffs((tariffResult.data ?? []) as TariffRow[]);
    setLoading(false);
  }, [activeFarmId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const pivotMap = useMemo(
    () => new Map(pivots.map((p) => [p.id, p])),
    [pivots],
  );
  const parcelMap = useMemo(
    () => new Map(parcels.map((p) => [p.id, p.name ?? "Parcela"])),
    [parcels],
  );

  const duplicateCounts = useMemo(
    () => irrigationDuplicateCounts(events),
    [events],
  );

  const duplicateTotal = useMemo(
    () => events.filter((e) => isPossibleDuplicate(e, duplicateCounts)).length,
    [events, duplicateCounts],
  );

  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        if (pivotFilter && event.pivot_id !== pivotFilter) return false;
        if (onlyDuplicates && !isPossibleDuplicate(event, duplicateCounts)) return false;
        return true;
      }),
    [events, pivotFilter, onlyDuplicates, duplicateCounts],
  );

  const openEdit = (event: EventRow) => {
    setEditing(event);
    setForm({
      date: event.started_at.slice(0, 10),
      percentimeter_pct: event.percentimeter_pct?.toString() ?? "",
      horimeter_initial: event.horimeter_initial?.toString() ?? "",
      horimeter_final: event.horimeter_final?.toString() ?? "",
      notes: event.notes ?? "",
    });
    setFormError("");
    setMessage("");
  };

  const patch = (changes: Partial<EditForm>) => {
    setForm((current) => ({ ...current, ...changes }));
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;

    const pivot = pivotMap.get(editing.pivot_id);
    if (!pivot) {
      setFormError("Pivô não encontrado.");
      return;
    }
    if (!pivot.depth_100_pct || !pivot.full_turn_time) {
      setFormError("A ficha técnica deste pivô está sem lâmina/tempo a 100%.");
      return;
    }

    const percentimeterPct = Number(form.percentimeter_pct);
    const percentimeterErr = validatePercentimeterPct(percentimeterPct);
    if (percentimeterErr) {
      setFormError(percentimeterErr);
      return;
    }

    const depth = deriveDepthFromPercentimeter(percentimeterPct, pivot.depth_100_pct);
    const depthErr = validateIrrigationDepth(depth);
    if (depthErr) {
      setFormError(depthErr);
      return;
    }

    const horimeterInitial = Number(form.horimeter_initial);
    const horimeterFinal = Number(form.horimeter_final);
    const horimeterErr = validateHorimeter(horimeterInitial, horimeterFinal);
    if (horimeterErr) {
      setFormError(horimeterErr);
      return;
    }

    const hours = deriveHoursFromHorimeter(horimeterInitial, horimeterFinal);
    const hoursErr = validateOperatingHours(hours);
    if (hoursErr) {
      setFormError(hoursErr);
      return;
    }

    const payload = buildIrrigationEventInsert({
      pivotId: editing.pivot_id,
      parcelId: editing.parcel_id,
      dateYmd: form.date,
      timeHm: "06:00",
      depthMm: depth,
      percentimeterPct,
      areaHa: pivot.area,
      flowRateM3h: pivot.flow_rate,
      fullTurnTime100H: pivot.full_turn_time,
      horimeterInitial,
      horimeterFinal,
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

    setSaving(true);
    setFormError("");

    const { error } = await supabase
      .from("irrigation_events")
      .update({
        ...payload,
        energy_kwh: priced.energy_kwh,
        cost: priced.cost,
        tariff_rate: priced.tariff_rate,
        energy_source: priced.energy_source,
      })
      .eq("id", editing.id);

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setEditing(null);
    setMessage("Lançamento corrigido com sucesso. O balanço hídrico será recalculado com o evento corrigido.");
    await load();
  };

  const handleDelete = async (event: EventRow) => {
    const pivotName = pivotMap.get(event.pivot_id)?.name ?? "pivô";
    const confirmed = window.confirm(
      `Excluir o lançamento de ${pivotName} em ${fmtDate(event.started_at)}?\n\nA irrigação será removida do balanço hídrico. Use esta ação somente para lançamento duplicado ou indevido.`,
    );
    if (!confirmed) return;

    setMessage("");
    const { error } = await supabase
      .from("irrigation_events")
      .delete()
      .eq("id", event.id);

    if (error) {
      setMessage(`Não foi possível excluir: ${error.message}`);
      return;
    }

    setMessage("Lançamento excluído. A duplicidade foi removida do histórico operacional.");
    await load();
  };

  const columns: Column<EventRow>[] = [
    { header: "Data", render: (r) => fmtDate(r.started_at) },
    {
      header: "Pivô / parcela",
      render: (r) => (
        <div>
          <span className="font-semibold text-graphite-800 dark:text-white">
            {pivotMap.get(r.pivot_id)?.name ?? "—"}
          </span>
          <span className="block text-xs text-graphite-400 dark:text-gray-500">
            {r.parcel_id ? parcelMap.get(r.parcel_id) ?? "Parcela" : "Sem parcela"}
          </span>
        </div>
      ),
    },
    {
      header: "Situação",
      render: (r) =>
        isPossibleDuplicate(r, duplicateCounts) ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Possível duplicado
          </span>
        ) : (
          <span className="text-xs text-graphite-400 dark:text-gray-500">Normal</span>
        ),
    },
    {
      header: "Percentímetro",
      render: (r) => (r.percentimeter_pct != null ? `${r.percentimeter_pct.toFixed(0)}%` : "—"),
    },
    {
      header: "Horímetros",
      render: (r) => (
        <span className="text-xs">
          {numberText(r.horimeter_initial)} → {numberText(r.horimeter_final)}
        </span>
      ),
    },
    {
      header: "Lâmina",
      render: (r) => `${r.depth_mm.toFixed(2)} mm`,
    },
    {
      header: "Horas",
      render: (r) => (r.operating_hours != null ? `${r.operating_hours.toFixed(2)} h` : "—"),
    },
    {
      header: "Ações",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(r)}>
            Corrigir
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => handleDelete(r)}>
            Excluir
          </Button>
        </div>
      ),
    },
  ];

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader
          titulo="Correção de irrigação"
          descricao="Corrija ou remova lançamentos duplicados e indevidos."
        />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Escolha uma fazenda ativa para revisar os lançamentos."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  const editingPivot = editing ? pivotMap.get(editing.pivot_id) : undefined;
  const editPercentimeter = Number(form.percentimeter_pct);
  const correctedDepth =
    editingPivot?.depth_100_pct != null &&
    Number.isFinite(editPercentimeter) &&
    editPercentimeter > 0
      ? deriveDepthFromPercentimeter(editPercentimeter, editingPivot.depth_100_pct)
      : null;
  const editInitial = Number(form.horimeter_initial);
  const editFinal = Number(form.horimeter_final);
  const correctedHours =
    form.horimeter_initial !== "" &&
    form.horimeter_final !== "" &&
    Number.isFinite(editInitial) &&
    Number.isFinite(editFinal) &&
    editFinal > editInitial
      ? deriveHoursFromHorimeter(editInitial, editFinal)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Correção de irrigação"
        descricao="Área exclusiva para corrigir ou excluir lançamentos errados. A tela normal de lançamento continua sem histórico."
      />

      <Card>
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,420px)_auto_1fr] lg:items-end">
          <Select
            id="correction_pivot"
            label="Filtrar por pivô"
            value={pivotFilter}
            onChange={(e) => setPivotFilter(e.target.value)}
            options={pivots.map((p) => ({ value: p.id, label: p.name }))}
          />

          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm text-graphite-700 dark:border-white/[0.08] dark:text-gray-300">
            <input
              type="checkbox"
              checked={onlyDuplicates}
              onChange={(e) => setOnlyDuplicates(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            Somente possíveis duplicados
          </label>

          <div className="text-sm text-graphite-500 dark:text-gray-400 lg:text-right">
            <strong className="text-graphite-900 dark:text-white">{duplicateTotal}</strong> registro(s) em grupos com possível duplicidade
          </div>
        </div>
      </Card>

      {message && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          {message}
        </p>
      )}

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
            Carregando lançamentos...
          </p>
        ) : visibleEvents.length === 0 ? (
          <p className="py-8 text-center text-sm text-graphite-400 dark:text-gray-500">
            Nenhum lançamento encontrado neste filtro.
          </p>
        ) : (
          <Table columns={columns} data={visibleEvents} getKey={(r) => r.id} />
        )}
      </Card>

      <p className="text-[11px] text-graphite-400 dark:text-gray-500">
        “Possível duplicado” é um alerta, não uma exclusão automática. A plataforma compara pivô, data, lâmina, percentímetro e horímetros; a decisão de corrigir ou excluir permanece com o usuário.
      </p>

      <Modal
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editingPivot ? `Corrigir irrigação · ${editingPivot.name}` : "Corrigir irrigação"}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="correction_date"
              label="Data"
              type="date"
              required
              value={form.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
            <Input
              id="correction_percentimeter"
              label="Percentímetro (%)"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              value={form.percentimeter_pct}
              onChange={(e) => patch({ percentimeter_pct: e.target.value })}
            />
            <Input
              id="correction_horimeter_initial"
              label="Horímetro inicial"
              type="number"
              min={0}
              step={0.01}
              required
              value={form.horimeter_initial}
              onChange={(e) => patch({ horimeter_initial: e.target.value })}
            />
            <Input
              id="correction_horimeter_final"
              label="Horímetro final"
              type="number"
              min={0}
              step={0.01}
              required
              value={form.horimeter_final}
              onChange={(e) => patch({ horimeter_final: e.target.value })}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            Lâmina corrigida: <strong>{correctedDepth != null ? `${correctedDepth.toFixed(2)} mm` : "—"}</strong>
            {" · "}
            Horas reais: <strong>{correctedHours != null ? `${correctedHours.toFixed(2)} h` : "—"}</strong>
          </div>

          <TextArea
            id="correction_notes"
            label="Observação"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />

          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar correção"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
