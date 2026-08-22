"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Table, type Column } from "@/components/ui";
import { PrerequisiteNotice } from "@/components/onboarding";
import { useAuth } from "@/components/providers";
import { createClient } from "@/lib/supabase/client";
import {
  assessOperationalModel,
  type OperationalModelAssessment,
  type OperationalParcel,
  type OperationalPivot,
  type OperationalSeason,
} from "@/modules/assignment/services";

interface SeasonRow {
  id: string;
  name: string;
  start_date: string;
  active: boolean;
}

interface PivotRow {
  id: string;
  name: string;
  area: number;
  active: boolean;
}

interface ParcelRow {
  id: string;
  name: string | null;
  pivot_id: string;
  season_id: string;
  culture_id: string | null;
  soil_id: string | null;
  planting_date: string | null;
  planted_area: number | null;
  start_angle_deg: number | null;
  end_angle_deg: number | null;
  status: string | null;
  active: boolean | null;
}

interface NamedRow {
  id: string;
  name: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatArea(value: number | null): string {
  return value == null
    ? "—"
    : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`;
}

export default function OperationalModelPage() {
  const { activeFarmId, farms } = useAuth();
  const [supabase] = useState(() => createClient());
  const [assessment, setAssessment] = useState<OperationalModelAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);

  const load = useCallback(async () => {
    if (!activeFarmId) {
      setAssessment(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [seasonResult, pivotResult, cultureResult] = await Promise.all([
        supabase
          .from("seasons")
          .select("id, name, start_date, active")
          .eq("farm_id", activeFarmId)
          .order("start_date", { ascending: false }),
        supabase
          .from("pivots")
          .select("id, name, area, active")
          .eq("farm_id", activeFarmId)
          .eq("active", true)
          .order("name"),
        supabase
          .from("cultures")
          .select("id, name")
          .eq("active", true)
          .order("name"),
      ]);

      const queryError = seasonResult.error ?? pivotResult.error ?? cultureResult.error;
      if (queryError) throw queryError;

      const seasonRows = (seasonResult.data ?? []) as SeasonRow[];
      const pivotRows = (pivotResult.data ?? []) as PivotRow[];
      const cultureRows = (cultureResult.data ?? []) as NamedRow[];
      const pivotIds = pivotRows.map((pivot) => pivot.id);

      let parcelRows: ParcelRow[] = [];
      if (pivotIds.length > 0) {
        const parcelResult = await supabase
          .from("pivot_crop_assignments")
          .select("id, name, pivot_id, season_id, culture_id, soil_id, planting_date, planted_area, start_angle_deg, end_angle_deg, status, active")
          .in("pivot_id", pivotIds);
        if (parcelResult.error) throw parcelResult.error;
        parcelRows = (parcelResult.data ?? []) as ParcelRow[];
      }

      const cultureNames = new Map(cultureRows.map((culture) => [culture.id, culture.name]));
      const seasons: OperationalSeason[] = seasonRows.map((season) => ({
        id: season.id,
        name: season.name,
        startDate: season.start_date,
        active: season.active,
      }));
      const pivots: OperationalPivot[] = pivotRows.map((pivot) => ({
        id: pivot.id,
        name: pivot.name,
        areaHa: Number(pivot.area),
        active: pivot.active,
      }));
      const parcels: OperationalParcel[] = parcelRows.map((parcel) => ({
        id: parcel.id,
        name: parcel.name,
        pivotId: parcel.pivot_id,
        seasonId: parcel.season_id,
        cultureId: parcel.culture_id,
        cultureName: parcel.culture_id ? cultureNames.get(parcel.culture_id) ?? null : null,
        soilId: parcel.soil_id,
        plantingDate: parcel.planting_date,
        plantedAreaHa: parcel.planted_area,
        startAngleDeg: parcel.start_angle_deg,
        endAngleDeg: parcel.end_angle_deg,
        status: parcel.status,
        active: parcel.active,
      }));

      setAssessment(assessOperationalModel({ seasons, pivots, parcels }));
    } catch (loadError) {
      setAssessment(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar o modelo operacional.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeFarmId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeFarmId) {
    return (
      <PrerequisiteNotice
        title="Selecione uma fazenda"
        description="O modelo operacional é organizado por fazenda e safra ativa."
        actionLabel="Ir para Fazendas"
        actionHref="/fazendas"
      />
    );
  }

  const columns: Column<OperationalModelAssessment["rows"][number]>[] = [
    {
      header: "Pivô / parcela",
      render: (row) => (
        <div>
          <p className="font-medium text-graphite-800 dark:text-white">{row.pivotName}</p>
          <p className="text-xs text-graphite-400">{row.parcelName ?? "Sem parcela ativa"}</p>
        </div>
      ),
    },
    { header: "Cultura", render: (row) => row.cultureName ?? "—" },
    { header: "Plantio", render: (row) => formatDate(row.plantingDate) },
    {
      header: "Área manejada",
      render: (row) => formatArea(row.managedAreaHa),
      align: "right",
    },
    {
      header: "Situação",
      render: (row) => (
        <span
          className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
            row.complete
              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
              : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
          }`}
        >
          {row.complete ? "Completo" : "Pendente"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Modelo Operacional"
        descricao={`${activeFarm?.name ?? "Fazenda ativa"} · Consolidação da safra em operação`}
        acao={
          <Link
            href="/vinculacao"
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-700"
          >
            Gerenciar parcelas
          </Link>
        }
      />

      {loading ? (
        <Card className="flex items-center justify-center gap-3 py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" />
          <span className="text-sm text-graphite-400">Carregando modelo...</span>
        </Card>
      ) : error ? (
        <Card className="border-red-100 bg-red-50/60 dark:border-red-900/30 dark:bg-red-900/10">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button type="button" onClick={load} className="mt-3 text-sm font-semibold text-red-700 underline">
            Tentar novamente
          </button>
        </Card>
      ) : assessment ? (
        <>
          <Card
            className={
              assessment.isComplete
                ? "border-brand-200/70 bg-brand-50/60 dark:border-brand-700/30 dark:bg-brand-900/10"
                : "border-amber-200/70 bg-amber-50/60 dark:border-amber-800/30 dark:bg-amber-900/10"
            }
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className={`text-sm font-semibold ${assessment.isComplete ? "text-brand-700 dark:text-brand-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {assessment.isComplete ? "Modelo operacional completo" : "Modelo operacional com pendências"}
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-graphite-900 dark:text-white">
                  {assessment.season?.name ?? "Nenhuma safra ativa"}
                </h2>
                <p className="mt-1 text-sm text-graphite-500 dark:text-gray-400">
                  {assessment.coveredPivots} de {assessment.totalPivots} pivôs vinculados à safra operacional
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
                <SummaryValue label="Cobertura" value={`${assessment.coveragePct}%`} />
                <SummaryValue label="Área manejada" value={formatArea(assessment.totalManagedAreaHa)} />
                <SummaryValue label="Pendências" value={String(assessment.gaps.length)} />
              </div>
            </div>
          </Card>

          {assessment.gaps.length > 0 && (
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-graphite-900 dark:text-white">O que falta completar</h2>
                  <p className="mt-1 text-sm text-graphite-400">Resolva os itens para liberar o modelo da safra.</p>
                </div>
                <Link href="/fazendas" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400">
                  Gerenciar safras
                </Link>
              </div>
              <ul className="mt-5 grid gap-3 md:grid-cols-2">
                {assessment.gaps.map((gap, index) => (
                  <li key={`${gap.code}-${gap.pivotId ?? "farm"}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-300">
                    {gap.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <div className="mb-5">
              <h2 className="text-base font-semibold text-graphite-900 dark:text-white">Pivôs da safra</h2>
              <p className="mt-1 text-sm text-graphite-400">A área manejada prioriza a área plantada da parcela.</p>
            </div>
            {assessment.rows.length > 0 ? (
              <Table columns={columns} data={assessment.rows} getKey={(row) => row.pivotId} />
            ) : (
              <p className="py-10 text-center text-sm text-graphite-400">Nenhum pivô ativo cadastrado.</p>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[105px] rounded-xl bg-white/80 px-4 py-3 dark:bg-white/[0.04]">
      <p className="text-lg font-extrabold text-graphite-900 dark:text-white">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-graphite-400">{label}</p>
    </div>
  );
}
