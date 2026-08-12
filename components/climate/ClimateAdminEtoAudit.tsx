"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers";
import type { ClimateDashboardResponse } from "@/modules/weather/dashboard/climateDashboard";

const METHODS = [
  ["Meteoblue FAO", "etoMeteoblueMm"], ["PM FAO-56", "etoMm"],
  ["Hargreaves-Samani", "etoHargreavesSamaniMm"], ["ASCE-EWRI", "etoAsceEwriMm"],
  ["Priestley-Taylor", "etoPriestleyTaylorMm"], ["Thornthwaite-Camargo", "etoThornthwaiteCamargoMm"],
  ["Blaney-Criddle", "etoBlaneyCriddleMm"], ["Makkink", "etoMakkinkMm"],
  ["Jensen-Haise", "etoJensenHaiseMm"], ["Turc", "etoTurcMm"],
  ["Linacre", "etoLinacreMm"], ["Ivanov", "etoIvanovMm"], ["Camargo 1971", "etoCamargo1971Mm"],
] as const;

const fmt = (value: number | null) => value === null ? "—" : `${value.toFixed(2).replace(".", ",")} mm`;

export function ClimateAdminEtoAudit() {
  const { activeFarmId } = useAuth();
  const [data, setData] = useState<ClimateDashboardResponse | null>(null);

  useEffect(() => {
    if (!activeFarmId) return;
    const controller = new AbortController();
    fetch(`/api/climate/dashboard?farmId=${encodeURIComponent(activeFarmId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Falha ao carregar ETo")))
      .then(setData)
      .catch(() => setData(null));
    return () => controller.abort();
  }, [activeFarmId]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/[0.06] dark:bg-graphite-800">
      <div className="border-b border-gray-100 p-5 dark:border-white/[0.06]"><h2 className="font-bold text-graphite-900 dark:text-white">Auditoria completa da ETo</h2><p className="mt-1 text-xs text-graphite-400">Todos os métodos permanecem separados; ausência é exibida como —.</p></div>
      <div className="overflow-x-auto"><table className="min-w-[1500px] text-left text-xs"><thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-graphite-400 dark:bg-white/[0.03]"><tr><th className="px-4 py-3">Data</th>{METHODS.map(([label]) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">{data?.dailyForecast.map((day) => <tr key={day.date}><td className="whitespace-nowrap px-4 py-3 font-bold">{new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR")}</td>{METHODS.map(([label, field]) => <td key={label} className="whitespace-nowrap px-3 py-3">{fmt(day[field])}</td>)}</tr>)}{!data ? <tr><td colSpan={14} className="p-8 text-center text-graphite-400">Carregando auditoria…</td></tr> : null}</tbody></table></div>
    </section>
  );
}
