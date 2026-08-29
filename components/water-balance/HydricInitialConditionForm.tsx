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
      setMessage("Informe a data da condição inicial.");
      return;
    }

    const isFieldCapacity = method === "field_capacity_confirmed";
    let measuredValue: number | null = null;
    if (!isFieldCapacity) {
      measuredValue = Number(moistureValue);
      if (!Number.isFinite(measuredValue) || measuredValue < 0 || measuredValue > 100) {
        setMessage("Informe uma umidade medida válida entre 0 e 100.");
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

      setMessage("Condição inicial registrada. O balanço já pode ser calculado a partir desta âncora.");
      onSaved(anchor);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao registrar condição inicial.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-950/20">
      <div className="mb-3">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Definir condição inicial do balanço</p>
        <p className="mt-1 text-[11px] leading-relaxed text-amber-700/80 dark:text-amber-300/70">
          Use capacidade de campo somente quando houver confirmação operacional. Para medição, informe a umidade observada e sua unidade. O sistema não presume ARM inicial.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Select
          label="Método"
          value={method}
          onChange={(e) => setMethod(e.target.value as Method)}
          options={[
            { value: "field_capacity_confirmed", label: "Capacidade de campo confirmada" },
            { value: "measured", label: "Umidade medida" },
          ]}
        />
        <Input label="Data" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
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
            <p className="pb-2 text-[11px] text-graphite-500 dark:text-gray-400">ARM inicial será igual à CAD calculada para a profundidade radicular da data.</p>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <TextArea label="Observação / evidência" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: perfil recarregado após irrigação completa; medição de campo às 07:30..." />
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar condição inicial"}</Button>
      </div>
      {message && <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">{message}</p>}
    </div>
  );
}
