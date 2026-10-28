"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyBalanceRow } from "@/modules/water-balance/services";
import type { PhenologyChartMarker } from "@/modules/culture/services/phenology-chart-markers";

export interface ClimateObservation {
  tmax: number | null;
  tmin: number | null;
  tmean: number | null;
}

interface ClimateRow {
  date: string;
  tmax: number | null;
  tmin: number | null;
  tmean: number | null;
  eto: number | null;
  etc: number | null;
}

const formatDay = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7);
const decimal = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) ? value.toFixed(1) : "—";

export function buildPivotClimateRows(
  rows: DailyBalanceRow[],
  observations: Record<string, ClimateObservation>,
): ClimateRow[] {
  return rows.map((row) => {
    const station = observations[row.date];
    const finite = (value: number | null | undefined) =>
      value != null && Number.isFinite(value) ? value : null;
    return {
      date: row.date,
      tmax: finite(station?.tmax),
      tmin: finite(station?.tmin),
      tmean: finite(station?.tmean),
      eto: finite(row.et0),
      etc: finite(row.etc),
    };
  });
}

const axisTick = { fill: "#94a3b8", fontSize: 11 };
const tooltipStyle = {
  backgroundColor: "#111e25",
  border: "1px solid #34515b",
  borderRadius: 10,
  color: "#f8fafc",
  fontSize: 12,
};

function NoTemperature() {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-white/15 px-6 text-center text-[13px] text-slate-300">
      Sem temperaturas registradas na estação vinculada para o período. Não foram estimados valores.
    </div>
  );
}

export function PivotClimatePanel({
  rows,
  observations,
  stationName,
  pivotName,
}: {
  rows: DailyBalanceRow[];
  observations: Record<string, ClimateObservation>;
  stationName: string | null;
  pivotName: string | null;
}) {
  const points = useMemo(() => buildPivotClimateRows(rows, observations), [rows, observations]);
  const hasTemperatures = points.some((point) => point.tmin != null || point.tmax != null || point.tmean != null);
  const latest = points[points.length - 1];
  const presentTemps = points.filter((point) => point.tmin != null || point.tmax != null || point.tmean != null);
  const lastTemp = presentTemps[presentTemps.length - 1] ?? null;

  const tile = (label: string, value: string, description: string) => (
    <div className="rounded-xl border border-white/10 bg-[#10252c] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-[25px] font-extrabold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{description}</p>
    </div>
  );

  return (
    <section className="w-full min-w-0 space-y-5 rounded-2xl border border-santa-800 bg-[#07161b] p-4 text-white sm:p-6">
      <div>
        <h2 className="text-[22px] font-extrabold">Clima do Pivô {pivotName ?? ""}</h2>
        <p className="mt-1 text-[12px] text-slate-300">
          Temperaturas observadas da estação {stationName ?? "não vinculada"} e demanda evapotranspirativa diária do balanço.
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          A ETo segue somente a fonte operacional aprovada ou lançamento manual; chuva automática da estação não entra no manejo.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {tile("Temperatura máxima", lastTemp?.tmax == null ? "—" : decimal(lastTemp.tmax) + " °C", "última medição disponível")}
        {tile("Temperatura média", lastTemp?.tmean == null ? "—" : decimal(lastTemp.tmean) + " °C", "última medição disponível")}
        {tile("Temperatura mínima", lastTemp?.tmin == null ? "—" : decimal(lastTemp.tmin) + " °C", "última medição disponível")}
        {tile("ETo", latest?.eto == null ? "—" : decimal(latest.eto) + " mm", "último dia do balanço")}
        {tile("ETc real", latest?.etc == null ? "—" : decimal(latest.etc) + " mm", "último dia do balanço")}
      </div>
      <div className="rounded-xl border border-white/10 bg-[#0c1e25] p-4">
        <h3 className="mb-1 text-[16px] font-bold">Temperaturas por dia</h3>
        <p className="mb-4 text-[11px] text-slate-400">Máxima, média e mínima · °C · dados existentes na estação</p>
        {hasTemperatures ? (
          <div className="h-[76vh] min-h-[540px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 12, right: 24, left: 0, bottom: 6 }}>
                <CartesianGrid stroke="#ffffff" strokeOpacity={0.09} vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={axisTick} minTickGap={24} />
                <YAxis unit="°" tick={axisTick} width={43} domain={["auto", "auto"]} />
                <Tooltip labelFormatter={(date) => String(date)} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="tmax" name="Máxima (°C)" stroke="#ff9660" strokeWidth={2.6} connectNulls={false} dot={false} />
                <Line type="monotone" dataKey="tmean" name="Média (°C)" stroke="#ffe17d" strokeWidth={2.6} connectNulls={false} dot={false} />
                <Line type="monotone" dataKey="tmin" name="Mínima (°C)" stroke="#5ebaff" strokeWidth={2.6} connectNulls={false} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <NoTemperature />}
        <div className="mt-3 flex flex-wrap gap-5 text-[12px] text-slate-300">
          <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#ff9660]" />Máxima</span>
          <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#ffe17d]" />Média</span>
          <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#5ebaff]" />Mínima</span>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-[#0c1e25] p-4">
        <h3 className="mb-1 text-[16px] font-bold">ETo e ETc por dia</h3>
        <p className="mb-4 text-[11px] text-slate-400">ETo de referência e ETc real calculada pelo motor hídrico · mm/dia</p>
        <div className="h-[76vh] min-h-[540px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 12, right: 24, left: 0, bottom: 6 }}>
              <CartesianGrid stroke="#ffffff" strokeOpacity={0.09} vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDay} tick={axisTick} minTickGap={24} />
              <YAxis unit=" mm" tick={axisTick} width={55} domain={[0, "auto"]} />
              <Tooltip labelFormatter={(date) => String(date)} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="eto" name="ETo (mm/dia)" stroke="#ffbf56" strokeWidth={2.8} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="etc" name="ETc real (mm/dia)" stroke="#3bdbba" strokeWidth={2.8} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-[12px] text-slate-300">
          <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#ffbf56]" />ETo</span>
          <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#3bdbba]" />ETc real</span>
        </div>
      </div>
    </section>
  );
}


/** Fallback visual: somente os Kc já utilizados pelo motor nos dias calculados. */
export function ObservedKcChart({ rows, markers = [] }: { rows: DailyBalanceRow[]; markers?: PhenologyChartMarker[] }) {
  const values = useMemo(
    () => rows.filter((row) => Number.isFinite(row.kc)).map((row) => ({
      date: row.date,
      kc: row.kc,
      fase: row.phase,
      dae: row.dae,
    })),
    [rows],
  );

  const reached = markers.filter((marker) => /^R[1-8]$/.test(marker.code))
    .flatMap((marker) => {
      const date = values.find((row) => row.dae != null && Math.abs(row.dae - marker.dae) < 0.5)?.date;
      return date ? [{ ...marker, date }] : [];
    });

  if (values.length === 0) {
    return <p className="p-6 text-[13px] text-slate-400">Sem valores de Kc calculados no período.</p>;
  }

  return (
    <div className="w-full space-y-2">
      <p className="text-[12px] text-graphite-500 dark:text-slate-400">
        Kc histórico utilizado pelo motor, por data, com a fenologia correspondente. Sem curva ativa no cadastro: não há extrapolação do ciclo futuro.
      </p>
      <div className="h-[76vh] min-h-[540px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={values} margin={{ top: 15, right: 22, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#64748b" strokeOpacity={0.17} vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDay} minTickGap={24} tick={axisTick} />
            <YAxis dataKey="kc" domain={[0, "auto"]} tick={axisTick} width={42} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(date) => String(date)} />
            {reached.map((marker) => (
              <ReferenceLine key={marker.code + marker.dae} x={marker.date} stroke="#34d399" strokeDasharray="5 5"
                label={{ value: marker.code, position: "insideTop", fill: "#047857", fontWeight: 700, fontSize: 13 }} />
            ))}
            <Line name="Kc calculado" dataKey="kc" type="monotone" dot={false} stroke="#16a085" strokeWidth={3} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-graphite-500 dark:text-slate-400">
        Último dia: {values[values.length - 1]?.dae ?? "—"} DAE ·
        fase {values[values.length - 1]?.fase ?? "não informada"} ·
        Kc {decimal(values[values.length - 1]?.kc)}.
      </p>
    </div>
  );
}
