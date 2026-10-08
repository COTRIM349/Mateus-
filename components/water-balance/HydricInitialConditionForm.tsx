"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select, TextArea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { InitialMoistureUnit } from "@/modules/water-balance/services";

export interface SavedHydricAnchor {
  effectiveDate: string;
  source: "measured" | "field_capacity_confirmed";
  moistureValue: number | null;
  moistureUnit: InitialMoistureUnit;
  isFieldCapacity: boolean;
}

interface Props {
  farmId: string;
  assignmentId: string;
  defaultDate: string;
  onSaved: (anchor: SavedHydricAnchor) => void;
}

type Method = "field_capacity_confirmed" | "measured";

export function HydricInitialConditionForm({ farmId, assignmentId, defaultDate, onSaved }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<Method>("field_capacity_confirmed");
  const [effectiveDate, setEffectiveDate] = useState(defaultDate);
  const [moistureUnit, setMoistureUnit] = useState<InitialMoistureUnit>("volume_pct");
  const [moistureValue, setMoistureValue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const save = async () => {
    setMessage("");
    if (!effectiveDate) {
      setMessage("Informe a data inicial do manejo.");
      return;
    }

    const isFieldCapacity = method === "field_capacity_confirmed";
    let measuredValue: number | null = null;
    if (!isFieldCapacity) {
      measuredValue = Number(moistureValue);
      if (!Number.isFinite(measuredValue) || measuredValue < 0 || measuredValue > 100) {
        setMessage("Informe uma umidade válida entre 0 e 100.");
        return;
      }
    }

    setSaving(true);
    try {
      const anchor: SavedHydricAnchor = {
        effectiveDate,
        source: method,
        moistureValue: isFieldCapacity ? null : measuredValue,
        moistureUnit: isFieldCapacity ? "field_capacity_fraction" : moistureUnit,
        isFieldCapacity,
      };

      const { error } = await supabase.from("hydric_initial_conditions").insert({
        farm_id: farmId,
        pivot_crop_assignment_id: assignmentId,
        effective_date: effectiveDate,
        measured_at: new Date().toISOString(),
        source: method,
        moisture_value: anchor.moistureValue,
        moisture_unit: anchor.moistureUnit,
        is_field_capacity: anchor.isFieldCapacity,
        notes: notes.trim() || null,
      });
      if (error) throw new Error(error.message);

      onSaved(anchor);
      setMessage("Manejo iniciado.");
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao iniciar o manejo.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-graphite-700 dark:text-gray-200">Manejo ainda não iniciado</p>
          <p className="mt-0.5 text-[11px] text-graphite-400 dark:text-gray-500">Defina somente a condição inicial para começar o acompanhamento.</p>
        </div>
        <Button onClick={() => setOpen(true)}>Iniciar manejo</Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-graphite-800 dark:text-gray-100">Início do manejo</p>
          <p className="mt-1 text-[11px] text-graphite-400 dark:text-gray-500">Escolha como está a umidade do solo na data inicial.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMessage("");
          }}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-graphite-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"
        >
          Fechar
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMethod("field_capacity_confirmed")}
          className={`rounded-xl border px-3 py-3 text-left transition-colors ${method === "field_capacity_confirmed" ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-900/20" : "border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"}`}
        >
          <span className="block text-xs font-semibold text-graphite-800 dark:text-gray-100">Solo cheio</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-graphite-400 dark:text-gray-500">Usar quando a capacidade de campo foi confirmada.</span>
        </button>
        <button
          type="button"
          onClick={() => setMethod("measured")}
          className={`rounded-xl border px-3 py-3 text-left transition-colors ${method === "measured" ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-900/20" : "border-gray-200 bg-white hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"}`}
        >
          <span className="block text-xs font-semibold text-graphite-800 dark:text-gray-100">Umidade medida</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-graphite-400 dark:text-gray-500">Informar uma medição real de campo.</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input label="Data inicial" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        {method === "measured" ? (
          <>
            <Select
              label="Unidade"
              value={moistureUnit}
              onChange={(e) => setMoistureUnit(e.target.value as InitialMoistureUnit)}
              options={[
                { value: "volume_pct", label: "% volumétrica" },
                { value: "weight_pct", label: "% gravimétrica" },
                { value: "field_capacity_fraction", label: "% da capacidade de campo" },
              ]}
            />
            <Input
              label="Umidade"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={moistureValue}
              onChange={(e) => setMoistureValue(e.target.value)}
            />
          </>
        ) : (
          <div className="md:col-span-2 flex items-end">
            <div className="w-full rounded-xl bg-gray-50 px-3 py-2.5 text-[11px] text-graphite-500 dark:bg-white/[0.04] dark:text-gray-400">
              O ARM inicial será igual à CAD calculada para a profundidade radicular da data.
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <TextArea
          label="Observação"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Opcional"
        />
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Confirmar início"}</Button>
      </div>

      {message && <p className="mt-2 text-[11px] text-graphite-600 dark:text-gray-300">{message}</p>}
    </div>
  );
}
