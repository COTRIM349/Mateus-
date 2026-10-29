"use client";

import type { DailyBalanceRow } from "@/modules/water-balance/services";
import type { SoilProfileLayer } from "@/modules/soil/services/soil-profile";
import { buildDecisionSoilProfile } from "@/modules/water-balance/services/decision-soil-profile";

const mm = (v: number, digits=1) =>
  v.toLocaleString("pt-BR", {minimumFractionDigits:digits, maximumFractionDigits:digits});

function ProfileSummary({label,value,subtitle}: {label:string,value:string,subtitle:string}) {
  return <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-3">
    <p className="text-[12px] font-medium text-slate-600">{label}</p>
    <p className="mt-1 text-[22px] font-extrabold tabular-nums text-emerald-950">{value}</p>
    <p className="text-[11px] text-slate-500">{subtitle}</p>
  </div>;
}

/**
 * Profile water storage is modelled for the total root zone. The engine
 * doesn't measure ARM in each horizon. Never label apportioned ARM as measured.
 */
export function DecisionSoilLayerPanel({
  last, soilLayers,
}: {last:DailyBalanceRow | null;soilLayers:SoilProfileLayer[]}) {
  const profile=last?buildDecisionSoilProfile({
    layers:soilLayers,
    rootDepthMeters:last.rootDepth,
    wholeProfileCtaMm:last.cad,
    wholeProfileCraMm:last.afd,
    wholeProfileArmMm:last.storedWater,
  }):null;
  return <section className="overflow-hidden rounded-xl border border-emerald-100 bg-white text-slate-800 shadow-[0_3px_16px_rgba(17,79,56,.07)]"
    aria-label="Perfil de água no solo por camadas">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-100 bg-emerald-50/75 px-4 py-4">
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-[26px] text-emerald-700">≋</div>
        <div>
          <h3 className="text-[20px] font-extrabold text-emerald-950">Perfil de água no solo por camadas</h3>
          <p className="text-[12px] text-slate-600">Capacidade hídrica e distribuição estimada no perfil explorado pela raiz.</p>
        </div>
      </div>
      {profile && <span className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[12px] font-semibold text-emerald-800">
        Raiz no perfil: {mm(profile.rootDepthCm,0)} cm
      </span>}
    </header>
    {!profile ? <div className="px-4 py-5 text-[13px] text-slate-600">
      Não há camadas cadastradas suficientes para detalhar o perfil do solo. Cadastre CC e PMP por profundidade para visualizar CTA, CRA e DTA por camada.
      O balanço total permanece disponível sem estimar dados inexistentes.
    </div> : <>
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProfileSummary label="CTA do perfil" value={`${mm(profile.ctaMm)} mm`} subtitle="Água total disponível até a raiz"/>
        <ProfileSummary label="CRA / AFD do perfil" value={`${mm(profile.craMm)} mm`} subtitle={`F semanal: ${mm(profile.factorWeekly,2)}`}/>
        <ProfileSummary label="DTA média do perfil" value={`${mm(profile.dtaMeanMmPerCm,2)} mm/cm`} subtitle="Disponibilidade por cm de solo"/>
        <ProfileSummary label="ARM total (balanço)" value={`${mm(last!.storedWater)} mm`} subtitle="Estimativa por camada, não medição"/>
      </div>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full min-w-[820px] overflow-hidden rounded-lg border border-emerald-100 text-left text-[13px] text-slate-800">
          <thead className="bg-[#126548] text-[12px] font-semibold text-white">
            <tr>
              <th className="px-3 py-3">Camada (cm)</th>
              <th className="px-3 py-3">CTA (mm)</th>
              <th className="px-3 py-3">CRA (mm)</th>
              <th className="px-3 py-3">DTA (mm/cm)</th>
              <th className="px-3 py-3">ARM estimada (mm)</th>
              <th className="min-w-[175px] px-3 py-3">Disponibilidade estimada</th>
              <th className="px-3 py-3">CC / PMP (% vol.)</th>
            </tr>
          </thead>
          <tbody>
            {profile.layers.map((layer,i)=>{
              const pct=Math.min(100,Math.max(0,layer.availableFraction*100));
              const barColor=pct>=70?"bg-emerald-400":pct>=40?"bg-amber-300":"bg-rose-400";
              return <tr key={layer.startCm+"-"+layer.endCm} className={i%2?"bg-emerald-50/50":"bg-white"}>
                <td className="whitespace-nowrap px-3 py-3 font-bold">{mm(layer.startCm,0)}–{mm(layer.endCm,0)} cm</td>
                <td className="px-3 py-3 tabular-nums">{mm(layer.layerCapacityMm)}</td>
                <td className="px-3 py-3 tabular-nums">{mm(layer.readilyDepletableMm)}</td>
                <td className="px-3 py-3 tabular-nums">{mm(layer.dtaMmPerCm,2)}</td>
                <td className="px-3 py-3 tabular-nums">{mm(layer.estimatedArmMm)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 min-w-[75px] flex-1 overflow-hidden rounded-full bg-emerald-100">
                      <div className={`h-full rounded-full ${barColor}`} style={{width:`${pct}%`}} />
                    </div>
                    <span className="w-10 text-right font-semibold tabular-nums">{mm(pct,0)}%</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                  {mm(layer.fieldCapacityPctVol,1)} / {mm(layer.wiltingPointPctVol,1)}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-4 text-[12px] leading-relaxed text-slate-600">
        CTA e DTA são calculadas a partir de CC, PMP e espessura cadastradas, com recorte na profundidade radicular.
        CRA (AFD) = CTA × F semanal. <strong>ARM estimada por camada</strong> é um rateio proporcional da ARM total do balanço, assumindo
        esgotamento relativo uniforme; não representa uma medição individual de umidade nem informa qual camada está mais seca.
        Para o diagnóstico real por camada, utilize sensores ou amostragem.
      </p>
    </>}
  </section>;
}
