"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  Select,
  Table,
  type Column,
} from "@/components/ui";
import { useAuth } from "@/components/providers";
import { useCrud } from "@/lib/hooks";
import {
  calculateLevelPercent,
  calculateRechargeTime,
} from "@/modules/reservoirs/services";

type ReservoirType = "represa" | "lago" | "poco" | "rio" | "reservatorio";

interface Reservoir {
  id: string;
  farm_id: string;
  name: string;
  type: ReservoirType;
  max_capacity: number;
  current_volume: number;
  min_operational_level: number;
  recharge_rate: number;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
}

const TYPE_OPTIONS = [
  { value: "represa", label: "Represa" },
  { value: "lago", label: "Lago" },
  { value: "poco", label: "Poço" },
  { value: "rio", label: "Rio" },
  { value: "reservatorio", label: "Reservatório" },
];

const number = (value: FormDataEntryValue | null) =>
  Number(String(value ?? "").trim().replace(",", "."));

const formatVolume = (value: number) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m³`;

function LevelBadge({ level }: { level: number }) {
  const className =
    level <= 25
      ? "bg-red-50 text-red-700 ring-red-200/60 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-700/30"
      : level <= 50
        ? "bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-900/20 dark:text-amber-400 dark:ring-amber-700/30"
        : "bg-brand-50 text-brand-700 ring-brand-200/60 dark:bg-brand-900/20 dark:text-brand-400 dark:ring-brand-700/30";

  return (
    <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>
      {level.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

export default function ReservatoriosPage() {
  const { activeFarmId } = useAuth();
  const { data, loading, error, create, update, softDelete } = useCrud<Reservoir>({
    table: "reservoirs",
    filters: { farm_id: activeFarmId },
    orderBy: "name",
    ascending: true,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reservoir | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Reservoir | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const activeReservoirs = data.filter((reservoir) => reservoir.active);
  const totalCapacity = activeReservoirs.reduce((sum, reservoir) => sum + reservoir.max_capacity, 0);
  const totalVolume = activeReservoirs.reduce((sum, reservoir) => sum + reservoir.current_volume, 0);
  const totalAvailable = activeReservoirs.reduce(
    (sum, reservoir) => sum + Math.max(reservoir.current_volume - reservoir.min_operational_level, 0),
    0,
  );

  const columns: Column<Reservoir>[] = [
    {
      header: "Reservatório",
      render: (reservoir) => (
        <div>
          <p className="font-medium text-graphite-800 dark:text-white">{reservoir.name}</p>
          <p className="mt-0.5 text-xs capitalize text-graphite-400">{reservoir.type}</p>
        </div>
      ),
    },
    {
      header: "Nível",
      render: (reservoir) => <LevelBadge level={calculateLevelPercent(reservoir.current_volume, reservoir.max_capacity)} />,
      align: "center",
    },
    {
      header: "Volume atual",
      render: (reservoir) => formatVolume(reservoir.current_volume),
      align: "right",
    },
    {
      header: "Disponível",
      render: (reservoir) => formatVolume(Math.max(reservoir.current_volume - reservoir.min_operational_level, 0)),
      align: "right",
    },
    {
      header: "Recarga",
      render: (reservoir) => `${reservoir.recharge_rate.toLocaleString("pt-BR")} m³/h`,
      align: "right",
    },
    {
      header: "Ações",
      align: "right",
      render: (reservoir) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(reservoir); setModalOpen(true); }}>
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeactivateTarget(reservoir)}>
            Desativar
          </Button>
        </div>
      ),
    },
  ];

  const openCreate = () => {
    setEditing(null);
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    if (!activeFarmId) {
      setFormError("Selecione uma fazenda antes de cadastrar um reservatório.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const maxCapacity = number(form.get("max_capacity"));
    const currentVolume = number(form.get("current_volume"));
    const minOperationalLevel = number(form.get("min_operational_level"));
    const rechargeRate = number(form.get("recharge_rate"));

    if (![maxCapacity, currentVolume, minOperationalLevel, rechargeRate].every(Number.isFinite)) {
      setFormError("Informe valores numéricos válidos para capacidade, volume, nível mínimo e recarga.");
      return;
    }
    if (maxCapacity <= 0 || currentVolume < 0 || minOperationalLevel < 0 || rechargeRate < 0) {
      setFormError("A capacidade deve ser maior que zero e os demais valores não podem ser negativos.");
      return;
    }
    if (currentVolume > maxCapacity) {
      setFormError("O volume atual não pode ultrapassar a capacidade máxima.");
      return;
    }
    if (minOperationalLevel > maxCapacity) {
      setFormError("O nível mínimo operacional não pode ultrapassar a capacidade máxima.");
      return;
    }

    const coordinate = (field: "latitude" | "longitude") => {
      const raw = String(form.get(field) ?? "").trim();
      return raw === "" ? null : number(raw);
    };
    const latitude = coordinate("latitude");
    const longitude = coordinate("longitude");
    if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
      setFormError("Latitude e longitude devem ser números válidos.");
      return;
    }

    const payload = {
      farm_id: activeFarmId,
      name: String(form.get("name") ?? "").trim(),
      type: String(form.get("type") ?? "") as ReservoirType,
      max_capacity: maxCapacity,
      current_volume: currentVolume,
      min_operational_level: minOperationalLevel,
      recharge_rate: rechargeRate,
      latitude,
      longitude,
    };

    setSaving(true);
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload);
      }
      setModalOpen(false);
      setEditing(null);
    } catch (submissionError) {
      setFormError(submissionError instanceof Error ? submissionError.message : "Não foi possível salvar o reservatório.");
    } finally {
      setSaving(false);
    }
  };

  const selected = editing;

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Reservatórios"
        descricao="Níveis, volume disponível e capacidade de recarga para a operação de irrigação"
        acao={<Button onClick={openCreate}>Novo reservatório</Button>}
      />

      {activeReservoirs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Volume armazenado</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-graphite-800 dark:text-white">{formatVolume(totalVolume)}</p>
            <p className="mt-1 text-xs text-graphite-400">de {formatVolume(totalCapacity)} de capacidade</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Volume operacional</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-graphite-800 dark:text-white">{formatVolume(totalAvailable)}</p>
            <p className="mt-1 text-xs text-graphite-400">acima dos níveis mínimos definidos</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Nível consolidado</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-graphite-800 dark:text-white">
              {calculateLevelPercent(totalVolume, totalCapacity).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </p>
            <p className="mt-1 text-xs text-graphite-400">{activeReservoirs.length} reservatório{activeReservoirs.length === 1 ? "" : "s"} ativo{activeReservoirs.length === 1 ? "" : "s"}</p>
          </Card>
        </div>
      )}

      {loading ? (
        <Card><p className="py-12 text-center text-sm text-graphite-400">Carregando reservatórios…</p></Card>
      ) : error ? (
        <Card><p className="py-12 text-center text-sm text-red-600 dark:text-red-400">Não foi possível carregar os reservatórios: {error}</p></Card>
      ) : activeReservoirs.length === 0 ? (
        <EmptyState
          title="Nenhum reservatório cadastrado"
          description="Cadastre fontes de armazenamento para acompanhar o volume disponível à irrigação."
          actionLabel="Cadastrar reservatório"
          onAction={openCreate}
        />
      ) : (
        <Card className="p-2">
          <Table columns={columns} data={activeReservoirs} getKey={(reservoir) => reservoir.id} />
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => { if (!saving) { setModalOpen(false); setEditing(null); } }}
        title={selected ? "Editar reservatório" : "Novo reservatório"}
        size="lg"
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="name" name="name" label="Nome" required defaultValue={selected?.name} placeholder="Reservatório principal" />
            <Select id="type" name="type" label="Tipo" required options={TYPE_OPTIONS} defaultValue={selected?.type ?? ""} />
            <Input id="max_capacity" name="max_capacity" label="Capacidade máxima (m³)" type="number" min="0.1" step="0.1" required defaultValue={selected?.max_capacity} />
            <Input id="current_volume" name="current_volume" label="Volume atual (m³)" type="number" min="0" step="0.1" required defaultValue={selected?.current_volume} />
            <Input id="min_operational_level" name="min_operational_level" label="Nível mínimo operacional (m³)" type="number" min="0" step="0.1" required defaultValue={selected?.min_operational_level} />
            <Input id="recharge_rate" name="recharge_rate" label="Taxa de recarga (m³/h)" type="number" min="0" step="0.1" required defaultValue={selected?.recharge_rate} />
            <Input id="latitude" name="latitude" label="Latitude (opcional)" type="number" step="any" defaultValue={selected?.latitude ?? ""} />
            <Input id="longitude" name="longitude" label="Longitude (opcional)" type="number" step="any" defaultValue={selected?.longitude ?? ""} />
          </div>

          {selected && (
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-graphite-500 dark:bg-white/[0.04] dark:text-gray-400">
              A autonomia passa a ser calculada pela programação de irrigação. Com a vazão de recarga atual, este reservatório leva
              {" "}{calculateRechargeTime(selected.current_volume, selected.max_capacity, selected.recharge_rate) === Infinity
                ? "tempo indeterminado para recarregar"
                : `${calculateRechargeTime(selected.current_volume, selected.max_capacity, selected.recharge_rate).toLocaleString("pt-BR")} h para completar`} .
            </div>
          )}

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-5 dark:border-white/[0.06]">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); setEditing(null); }} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar reservatório"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Desativar reservatório?"
        message={`O reservatório “${deactivateTarget?.name ?? ""}” deixará de aparecer no acompanhamento operacional. O histórico será preservado.`}
        confirmLabel="Desativar"
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (deactivateTarget) await softDelete(deactivateTarget.id);
          setDeactivateTarget(null);
        }}
      />
    </div>
  );
}
