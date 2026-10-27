"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button, Card, Input, Select, Modal, TextArea,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import { PrerequisiteNotice } from "@/components/onboarding";
import {
  HOURS_FORMULA,
  PERCENTIMETER_FORMULA,
  VOLUME_FORMULA,
  buildIrrigationEventInsert,
  deriveAppliedVolume,
  deriveDepthFromPercentimeter,
  deriveHoursFromHorimeter,
  deriveOperatingHoursFromPercentimeter,
  resolveHorimeterReference,
  validateHorimeter,
  validateIrrigationDepth,
  validateOperatingHours,
  validatePercentimeterPct,
} from "@/modules/irrigation/services";
import { isActiveParcel, assertParcelAcceptsOperationalLaunch } from "@/modules/assignment/services";
import { pickTariffForDate, priceIrrigationEvent, type TariffRow } from "@/modules/costs/services";

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
  horimeter_base_value: number | null;
  horimeter_base_date: string | null;
  horimeter_base_source: string | null;
}

interface ParcelLite {
  id: string;
  name: string | null;
  pivot_id: string;
  status: string | null;
  active: boolean | null;
}

interface FormState {
  pivot_id: string;
  date: string;
  percentimeter_pct: string;
  horimeter_initial: string;
  horimeter_final: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: FormState = {
  pivot_id: "",
  date: today(),
  percentimeter_pct: "",
  horimeter_initial: "",
  horimeter_final: "",
  notes: "",
};

export default function LancamentoIrrigacaoPage() {
  const { activeFarmId } = useAuth();
  const supabase = createClient();

  const [pivots, setPivots] = useState<PivotLite[]>([]);
  const [parcels, setParcels] = useState<ParcelLite[]>([]);
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [selectedPivotId, setSelectedPivotId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingLastHorimeter, setLoadingLastHorimeter] = useState(false);
  const [lastHorimeterSourceDate, setLastHorimeterSourceDate] = useState<string | null>(null);
  const [lastHorimeterSource, setLastHorimeterSource] = useState<"event" | "historical_base" | null>(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("pivots")
      .select("id, name, area, flow_rate, pump_power, installed_power_kw, motor_efficiency, specific_consumption, energy_cost, depth_100_pct, full_turn_time, horimeter_base_value, horimeter_base_date, horimeter_base_source")
      .eq("farm_id", activeFarmId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setPivots(data as PivotLite[]);
      });
  }, [activeFarmId, supabase]);

  useEffect(() => {
    if (pivots.length === 0) {
      setParcels([]);
      return;
    }
    supabase
      .from("pivot_crop_assignments")
      .select("id, name, pivot_id, status, active")
      .in("pivot_id", pivots.map((p) => p.id))
      .then(({ data }) => {
        if (data) setParcels(data as ParcelLite[]);
      });
  }, [pivots, supabase]);

  useEffect(() => {
    if (!activeFarmId) return;
    supabase
      .from("energy_tariffs")
      .select("id, valid_from, valid_to, rate_peak, rate_off_peak, peak_start, peak_end")
      .eq("farm_id", activeFarmId)
      .then(({ data }) => {
        if (data) setTariffs(data as TariffRow[]);
      });
  }, [activeFarmId, supabase]);

  const pivotMap = useMemo(
    () => new Map(pivots.map((p) => [p.id, p])),
    [pivots],
  );

  const activeParcelFor = useCallback((pivotId: string) => {
    return parcels.find((p) => p.pivot_id === pivotId && isActiveParcel(p.status, p.active)) ?? null;
  }, [parcels]);

  const selectedLaunchPivot = selectedPivotId ? pivotMap.get(selectedPivotId) : undefined;
  const selectedLaunchParcel = selectedPivotId ? activeParcelFor(selectedPivotId) : null;

  const selectedPivot = form.pivot_id ? pivotMap.get(form.pivot_id) : undefined;
  const selectedParcel = form.pivot_id ? activeParcelFor(form.pivot_id) : null;
  const percentimeterNum = form.percentimeter_pct ? Number(form.percentimeter_pct) : NaN;
  const depthNum =
    selectedPivot?.depth_100_pct != null && Number.isFinite(percentimeterNum) && percentimeterNum > 0
      ? deriveDepthFromPercentimeter(percentimeterNum, selectedPivot.depth_100_pct)
      : NaN;

  const previewVolume = selectedPivot && Number.isFinite(depthNum) && depthNum > 0
    ? deriveAppliedVolume(depthNum, selectedPivot.area)
    : null;

  const previewHours =
    selectedPivot?.full_turn_time != null &&
    Number.isFinite(percentimeterNum) &&
    percentimeterNum > 0
      ? deriveOperatingHoursFromPercentimeter(percentimeterNum, selectedPivot.full_turn_time)
      : null;

  const horimeterInitialNum = form.horimeter_initial !== "" ? Number(form.horimeter_initial) : NaN;
  const horimeterFinalNum = form.horimeter_final !== "" ? Number(form.horimeter_final) : NaN;
  const actualHours =
    Number.isFinite(horimeterInitialNum) &&
    Number.isFinite(horimeterFinalNum) &&
    horimeterFinalNum > horimeterInitialNum
      ? deriveHoursFromHorimeter(horimeterInitialNum, horimeterFinalNum)
      : null;
  const hoursForPricing = actualHours ?? previewHours;

  const previewPrice = selectedPivot && previewVolume != null && hoursForPricing != null && hoursForPricing > 0
    ? priceIrrigationEvent({
      operatingHours: hoursForPricing,
      volumeM3: previewVolume,
      depthMm: depthNum,
      areaHa: selectedPivot.area,
      pumpPowerCv: selectedPivot.pump_power,
      installedPowerKw: selectedPivot.installed_power_kw,
      motorEfficiency: selectedPivot.motor_efficiency,
      specificConsumptionKwhM3: selectedPivot.specific_consumption,
      startedAt: `${form.date}T06:00:00`,
      tariff: pickTariffForDate(tariffs, form.date),
      pivotEnergyCostReaisPerKwh: selectedPivot.energy_cost,
    })
    : null;

  const patch = (changes: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...changes }));
  };

  const openLaunch = async () => {
    if (!selectedPivotId) return;

    setLoadingLastHorimeter(true);
    setFormError("");
    setSuccessMessage("");
    setLastHorimeterSourceDate(null);
    setLastHorimeterSource(null);

    const pivot = pivotMap.get(selectedPivotId);
    const baseValue = pivot?.horimeter_base_value ?? null;
    const baseDate = pivot?.horimeter_base_date ?? null;

    const { data, error } = await supabase
      .from("irrigation_events")
      .select("horimeter_final, started_at, created_at")
      .eq("pivot_id", selectedPivotId)
      .not("horimeter_final", "is", null)
      .order("started_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const lastEvent = data?.[0] as {
      horimeter_final: number | null;
      started_at: string;
      created_at: string;
    } | undefined;

    const eventValue = !error && lastEvent?.horimeter_final != null
      ? Number(lastEvent.horimeter_final)
      : null;
    const eventDate = !error && lastEvent?.started_at
      ? lastEvent.started_at.slice(0, 10)
      : null;

    const reference = resolveHorimeterReference({
      baseValue,
      baseDate,
      eventValue,
      eventDate,
    });

    setForm({
      ...EMPTY,
      pivot_id: selectedPivotId,
      date: today(),
      horimeter_initial:
        reference.value != null
          ? String(reference.value)
          : "",
    });

    if (reference.value != null) {
      setLastHorimeterSourceDate(reference.date);
      setLastHorimeterSource(reference.source);
    }

    setLoadingLastHorimeter(false);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.pivot_id) {
      setFormError("Selecione o pivô.");
      return;
    }

    const pivot = pivotMap.get(form.pivot_id);
    if (!pivot) {
      setFormError("Pivô inválido.");
      return;
    }

    if (
      pivot.depth_100_pct == null ||
      pivot.depth_100_pct <= 0 ||
      pivot.full_turn_time == null ||
      pivot.full_turn_time <= 0
    ) {
      setFormError("A ficha técnica deste pivô não possui a base de lâmina/horas a 100%. Complete a ficha do equipamento.");
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

    const actualOperatingHours = deriveHoursFromHorimeter(horimeterInitial, horimeterFinal);
    const actualHoursErr = validateOperatingHours(actualOperatingHours);
    if (actualHoursErr) {
      setFormError(actualHoursErr);
      return;
    }

    const parcel = activeParcelFor(form.pivot_id);
    const launchErr = assertParcelAcceptsOperationalLaunch(parcel);
    if (launchErr) {
      setFormError(launchErr);
      return;
    }

    const payload = buildIrrigationEventInsert({
      pivotId: form.pivot_id,
      parcelId: parcel?.id ?? null,
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
      const { error } = await supabase.from("irrigation_events").insert(row);
      if (error) {
        setFormError(error.message);
      } else {
        setModalOpen(false);
        setSuccessMessage(
          `Irrigação lançada com sucesso em ${pivot.name}: ${percentimeterPct.toFixed(0)}% → ${depth.toFixed(1)} mm · ${actualOperatingHours.toFixed(2)} h reais.`,
        );
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    }

    setSaving(false);
  };

  if (!activeFarmId) {
    return (
      <div className="space-y-8">
        <PageHeader
          titulo="Lançamento de irrigação"
          descricao="Selecione uma fazenda para lançar as irrigações realizadas por pivô."
        />
        <PrerequisiteNotice
          title="Selecione uma fazenda"
          description="Escolha uma fazenda ativa para registrar irrigações."
          actionLabel="Ir para Fazendas"
          actionHref="/fazendas"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Lançamento de irrigação"
        descricao="Selecione o pivô e registre somente a irrigação realizada. O histórico permanece disponível na área de Histórico."
      />

      <Card>
        <div className="grid gap-5 p-1 lg:grid-cols-[minmax(260px,420px)_1fr_auto] lg:items-end">
          <Select
            id="launch_pivot"
            label="Pivô"
            value={selectedPivotId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setSelectedPivotId(e.target.value);
              setSuccessMessage("");
            }}
            options={pivots.map((p) => ({ value: p.id, label: p.name }))}
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
              Parcela ativa
            </p>
            <div className="flex min-h-10 items-center rounded-xl border border-gray-200 px-4 py-2 text-sm text-graphite-800 dark:border-white/[0.08] dark:text-gray-100">
              {!selectedPivotId
                ? "Selecione o pivô"
                : selectedLaunchParcel?.name || (selectedLaunchParcel ? "Parcela ativa" : "Nenhuma parcela ativa neste pivô")}
            </div>
          </div>

          <Button
            onClick={openLaunch}
            disabled={
              loadingLastHorimeter ||
              !selectedLaunchPivot ||
              !selectedLaunchParcel ||
              !selectedLaunchPivot.depth_100_pct ||
              !selectedLaunchPivot.full_turn_time
            }
          >
            {loadingLastHorimeter ? "Buscando horímetro..." : "Lançar irrigação"}
          </Button>
        </div>

        {selectedPivotId && !selectedLaunchParcel && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Este pivô não possui parcela ativa. Abra um ciclo de cultura antes de lançar irrigação.
          </p>
        )}

        {selectedPivotId && selectedLaunchParcel && (
          !selectedLaunchPivot?.depth_100_pct || !selectedLaunchPivot?.full_turn_time
        ) && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            A ficha técnica deste pivô ainda não possui a base completa de lâmina e horas a 100%.
          </p>
        )}

        {successMessage && (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            {successMessage}
          </p>
        )}
      </Card>

      <p className="text-[11px] text-graphite-400 dark:text-gray-500">
        Esta tela não exibe histórico de lançamentos. {PERCENTIMETER_FORMULA} · {VOLUME_FORMULA} · {HOURS_FORMULA}
      </p>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selectedPivot ? `Lançar irrigação · ${selectedPivot.name}` : "Lançar irrigação"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
                Pivô
              </p>
              <div className="flex h-10 items-center rounded-xl border border-gray-200 px-4 text-sm font-medium text-graphite-900 dark:border-white/[0.08] dark:text-white">
                {selectedPivot?.name ?? "—"}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
                Parcela ativa
              </p>
              <div className="flex min-h-10 items-center rounded-xl border border-gray-200 px-4 py-2 text-sm text-graphite-800 dark:border-white/[0.08] dark:text-gray-100">
                {selectedParcel?.name || (selectedParcel ? "Parcela ativa" : "Nenhuma parcela ativa")}
              </div>
            </div>

            <Input
              id="date"
              label="Data"
              type="date"
              required
              value={form.date}
              onChange={(e) => patch({ date: e.target.value })}
            />

            <Input
              id="percentimeter_pct"
              label="Percentímetro (%)"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              value={form.percentimeter_pct}
              onChange={(e) => patch({ percentimeter_pct: e.target.value })}
              placeholder="Ex.: 80"
            />

            <div>
              <Input
                id="horimeter_initial"
                label="Horímetro inicial"
                type="number"
                min={0}
                step={0.01}
                required
                value={form.horimeter_initial}
                onChange={(e) => patch({ horimeter_initial: e.target.value })}
                placeholder="Ex.: 1523,40"
              />
              {lastHorimeterSourceDate && form.horimeter_initial !== "" && (
                <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  {lastHorimeterSource === "event"
                    ? "Preenchido com o horímetro final da última irrigação da plataforma"
                    : "Preenchido com o último horímetro da base histórica"}
                  {" · "}
                  {lastHorimeterSourceDate.split("-").reverse().join("/")}
                </p>
              )}
            </div>

            <Input
              id="horimeter_final"
              label="Horímetro final"
              type="number"
              min={0}
              step={0.01}
              required
              value={form.horimeter_final}
              onChange={(e) => patch({ horimeter_final: e.target.value })}
              placeholder="Ex.: 1541,10"
            />

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-500 dark:text-gray-400">
                Lâmina calculada
              </p>
              <div className="flex h-10 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-graphite-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                {Number.isFinite(depthNum) && depthNum > 0
                  ? `${depthNum.toFixed(2)} mm`
                  : selectedPivot?.depth_100_pct
                    ? "Informe o percentímetro"
                    : "Ficha técnica sem lâmina a 100%"}
              </div>
              {selectedPivot?.depth_100_pct != null && (
                <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">
                  Base do pivô: {selectedPivot.depth_100_pct.toFixed(2)} mm a 100%
                  {selectedPivot.full_turn_time != null ? ` · ${selectedPivot.full_turn_time.toFixed(2)} h a 100%` : ""}
                </p>
              )}
            </div>
          </div>

          {previewVolume != null && (
            <p className="text-xs text-graphite-500 dark:text-gray-400">
              Volume: <strong className="text-graphite-800 dark:text-white">{previewVolume.toLocaleString("pt-BR")} m³</strong>
              {actualHours != null ? (
                <> · Horas reais: <strong className="text-graphite-800 dark:text-white">{actualHours.toFixed(2)} h</strong></>
              ) : previewHours != null && previewHours > 0 ? (
                <> · Tempo teórico: <strong className="text-graphite-800 dark:text-white">{previewHours.toFixed(2)} h</strong></>
              ) : null}
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
            placeholder="Ex.: volta completa; observação operacional"
          />

          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
            >
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !selectedParcel}>
              {saving ? "Salvando..." : "Salvar irrigação"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
