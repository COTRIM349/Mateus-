"use client";

import { useMemo } from "react";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";
import type { PhenologyChartMarker } from "@/modules/culture/services/phenology-chart-markers";
import { buildDevelopmentAudit } from "@/modules/culture/services/crop-development-view";

type KcPoint = { x:number; y:number };
interface Props {
  rows: DailyBalanceRow[];
  markers: PhenologyChartMarker[];
  kcCurve: KcPoint[] | null;
  kcCurveLabel?: string | null;
  cropName: string | null;
  varietyName: string | null;
}

const fmt=(value:number,decimal=1)=>new Intl.NumberFormat("pt-BR",{
  minimumFractionDigits:decimal, maximumFractionDigits:decimal,
}).format(value);

function MiniSeries({title,unit,values,color,subtitle,cap}:{
  title:string;unit:string;values:Array<{x:number;y:number}>;
  color:string;subtitle:string;cap?:number;
}) {
  const sorted=values.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.x-b.x);
  const maxX=Math.max(1,...sorted.map(p=>p.x)),maxY=Math.max(cap??0.1,...sorted.map(p=>p.y)) *1.07;
  const plot={x:40,y:12,w:840,h:128};
  const x=(v:number)=>plot.x+Math.max(0,Math.min(1,v/maxX))*plot.w;
  const y=(v:number)=>plot.y+plot.h-(Math.max(0,Math.min(maxY,v))/maxY)*plot.h;
  const coords=sorted.map(p=>x(p.x)+","+y(p.y)).join(" ");
  const last=sorted.at(-1);
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.035]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-[14px] font-extrabold text-slate-800 dark:text-white">{title}</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-[14px] font-black dark:bg-white/10" style={{color}}>
          {last ? fmt(last.y,unit==="Kc"?2:0)+" "+(unit==="Kc"?"":unit) : "—"}
        </div>
      </div>
      {sorted.length<2 ? <div className="flex h-36 items-center justify-center text-[12px] text-slate-500">
        Série histórica insuficiente para mostrar a evolução.
      </div> : (
        <svg viewBox="0 0 930 188" className="w-full" role="img" aria-label={"Evolução observada de "+title+" até hoje"}>
          {[0,.25,.5,.75,1].map(i=>(
            <g key={i}>
              <line x1={plot.x} y1={y(maxY*i)} x2={plot.x+plot.w} y2={y(maxY*i)}
                stroke="currentColor" strokeOpacity={.09}/>
              <text x={plot.x-7} y={y(maxY*i)+4} textAnchor="end" fontSize={12}
                className="fill-slate-500 dark:fill-slate-400">{fmt(maxY*i,unit==="Kc"?2:0)}</text>
            </g>
          ))}
          <polyline points={coords} fill="none" stroke={color} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round"/>
          {last&&<circle cx={x(last.x)} cy={y(last.y)} r={5.2} fill={color} stroke="white" strokeWidth={1.6}>
            <title>Hoje · {fmt(last.x,0)} DAE · {fmt(last.y,unit==="Kc"?2:0)} {unit}</title>
          </circle>}
          <text x={plot.x} y={plot.y+plot.h+22} fontSize={12} className="fill-slate-500 dark:fill-slate-400">0 DAE</text>
          <text x={plot.x+plot.w} y={plot.y+plot.h+22} textAnchor="end" fontSize={12} className="fill-slate-500 dark:fill-slate-400">
            {fmt(maxX,0)} DAE · hoje
          </text>
        </svg>
      )}
    </section>
  );
}

export function CropDevelopmentPanel({rows,markers,kcCurve,kcCurveLabel,cropName,varietyName}:Props){
  const last=rows.at(-1);
  const dae=last?.dae!=null && Number.isFinite(last.dae) ? Math.max(0,last.dae) : null;
  const soy=/soja/i.test(cropName??"");
  const model=useMemo(()=>buildDevelopmentAudit({
    isSoy:soy,currentDae:dae,markers,rows,kcCurve,
  }),[soy,dae,markers,rows,kcCurve]);
  const reached=model.stages.filter(s=>s.reached && s.dae!=null).sort((a,b)=>(a.dae??0)-(b.dae??0));
  const missing=model.stages.filter(s=>s.dae==null);
  const veg=model.stages.filter(s=>s.code==="VE"||s.code==="VC"||/^V\d+$/.test(s.code));
  const repro=model.stages.filter(s=>/^R[1-8]$/.test(s.code));
  const effectiveCm=last && Number.isFinite(last.rootDepth) ? last.rootDepth*100 : null;
  const estimatedCm=last && last.rootDepthEstimated!=null && Number.isFinite(last.rootDepthEstimated)
    ? last.rootDepthEstimated*100 : null;
  const rootLimited=estimatedCm!=null && effectiveCm!=null && estimatedCm>effectiveCm+1;
  const kcData=rows.filter(r=>r.dae!=null&&Number.isFinite(r.dae)&&Number.isFinite(r.kc))
    .map(r=>({x:r.dae!,y:r.kc}));
  const rootData=rows.filter(r=>r.dae!=null&&Number.isFinite(r.dae)&&Number.isFinite(r.rootDepth))
    .map(r=>({x:r.dae!,y:r.rootDepth*100}));
  const plot={left:53,right:1110,lineY:126,firstY:36,secondY:72};
  const maxDay=Math.max(1,dae??1);
  const pos=(v:number)=>plot.left+(Math.min(maxDay,Math.max(0,v))/maxDay)*(plot.right-plot.left);
  if(!last)return null;
  const metric=(label:string,value:string,sub:string)=>(
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.035]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-1 text-[19px] font-extrabold leading-tight text-slate-900 dark:text-white">{value}</div>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-black tracking-tight text-slate-900 dark:text-white">
            Desenvolvimento da cultura
          </h2>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
            {cropName??"Cultura"} · {varietyName??"Cultivar não cadastrada"} ·
            fenologia, consumo potencial e sistema radicular até hoje
          </p>
        </div>
        <div className="rounded-full border border-emerald-300/40 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          Somente dados do cadastro e do balanço
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metric("Estádio identificado",
          model.currentStage?.code??"Não definido",
          model.currentStage ? model.currentStage.label+" · DAE "+model.currentStage.dae+" ("+model.stageOrigin+")"
            : "Cadastre os DAE fenológicos da cultivar")}
        {metric("Idade da cultura",dae==null?"—":dae+" DAE",last.phase+" · fase do motor")}
        {metric("Kc usado no balanço",fmt(last.kc,2),kcCurveLabel??"Kc do motor (sem curva ativa)")}
        {metric("Raiz efetiva no balanço",effectiveCm==null?"—":fmt(effectiveCm,0)+" cm",
          rootLimited ? "Limite do perfil cadastrado" : "Profundidade explorada no solo")}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5 dark:border-white/10 dark:bg-[#0b202b]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[16px] font-extrabold text-slate-900 dark:text-white">Linha do tempo fenológica</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              VE → VC → V1, V2… → R1 a R8. Datas previstas/calibradas são do cadastro; não são medições de campo.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            {dae==null?"DAE indisponível":"Até "+dae+" DAE"}
          </span>
        </div>
        {dae==null ? <p className="rounded-lg bg-amber-50 p-4 text-[12px] text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          Falta uma referência válida de emergência para posicionar o desenvolvimento da cultura.
        </p> : (
          <svg viewBox="0 0 1160 198" className="w-full" role="img"
            aria-label="Linha do tempo do desenvolvimento fenológico até o dia atual">
            <line x1={plot.left} y1={plot.lineY} x2={plot.right} y2={plot.lineY} stroke="#cbd5e1" strokeWidth={9} strokeLinecap="round" opacity={.5}/>
            {reached.length>0&&<line x1={plot.left} y1={plot.lineY}
              x2={pos(reached[reached.length-1].dae??0)} y2={plot.lineY} stroke="#10b981" strokeWidth={9} strokeLinecap="round"/>}
            {Array.from({length:6},(_,i)=>i).map(i=>(
              <g key={i}>
                <line x1={pos(dae*i/5)} y1={plot.lineY+11} x2={pos(dae*i/5)} y2={plot.lineY+16} stroke="#64748b"/>
                <text x={pos(dae*i/5)} y={plot.lineY+32} textAnchor="middle" fontSize={13}
                  className="fill-slate-500 dark:fill-slate-400">{Math.round(dae*i/5)}</text>
              </g>
            ))}
            {reached.map((m,i)=>{
              const cx=pos(m.dae??0),cy=i%2===0?plot.firstY:plot.secondY;
              return <g key={m.code+"-"+m.dae}>
                <line x1={cx} x2={cx} y1={cy+23} y2={plot.lineY-8}
                  stroke={m.current?"#059669":"#64748b"} strokeWidth={1.4} strokeOpacity={.8}/>
                <circle cx={cx} cy={plot.lineY} r={m.current?8:5} fill={m.current?"#059669":"#3b82f6"}
                  stroke="white" strokeWidth={1.3}/>
                <rect x={cx-22} y={cy} width={44} height={23} rx={6}
                  fill={m.current?"#047857":m.code.startsWith("R")?"#b45309":"#145c8b"}/>
                <text x={cx} y={cy+16} textAnchor="middle" fontSize={12.5} fontWeight={800} fill="white">{m.code}</text>
                <title>{m.code} · {m.label} · {m.dae} DAE ({m.origin})</title>
              </g>;
            })}
            <line x1={pos(dae)} x2={pos(dae)} y1={18} y2={plot.lineY+15}
              stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" />
            <text x={plot.right} y={186} textAnchor="end" fontSize={12} className="fill-emerald-600 dark:fill-emerald-400">
              HOJE · {dae} DAE
            </text>
          </svg>
        )}
        {soy && (
          <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 dark:border-white/10 xl:grid-cols-2">
            {[{label:"Desenvolvimento vegetativo",items:veg},{label:"Desenvolvimento reprodutivo",items:repro}].map(group=>(
              <div key={group.label}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map(m=>(
                    <span key={m.code} title={m.dae!=null?m.label+" · "+m.dae+" DAE ("+m.origin+")":"Sem DAE cadastrado"}
                      className={"inline-flex min-w-[46px] justify-center rounded-md border px-2 py-1.5 text-[11px] font-bold "+
                        (m.current?"border-emerald-500 bg-emerald-600 text-white":
                         m.reached?"border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-900/35 dark:text-sky-200":
                         "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.025] dark:text-slate-500")}>
                      {m.code}{m.reached&&m.dae!=null?<span className="ml-1 font-normal opacity-75">{m.dae}d</span>:""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {missing.length>0 && soy && (
          <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">
            {missing.length} estádio(s) sem DAE cadastrado. As etiquetas em cinza não representam previsão de ocorrência;
            complete a escala fenológica da cultivar para posicioná-las na linha do tempo.
          </p>
        )}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <MiniSeries title="Kc ao longo do desenvolvimento" subtitle="Histórico diário efetivamente utilizado pelo balanço · ETc potencial = ETo × Kc"
          values={kcData} color="#0d9488" unit="Kc" cap={1.25}/>
        <MiniSeries title="Crescimento radicular efetivo" subtitle="Raiz diária limitada à profundidade de solo cadastrada"
          values={rootData} color="#8b5cf6" unit="cm"/>
      </div>
      {rootLimited && (
        <p className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/20 dark:text-amber-200">
          Raiz estimada pela curva da cultura: {fmt(estimatedCm!,0)} cm. Profundidade efetiva usada no balanço:
          {" "+fmt(effectiveCm!,0)} cm. A diferença vem do limite de solo cadastrado; não significa que toda a raiz esteja
          comprovadamente explorando esse perfil.
        </p>
      )}
      <div className={"rounded-xl border px-3 py-2.5 text-[11px] "+
        (model.issues.length?"border-amber-300/50 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/20 dark:text-amber-200":
          "border-emerald-300/50 bg-emerald-50 text-emerald-900 dark:border-emerald-600/25 dark:bg-emerald-900/10 dark:text-emerald-200")}>
        <p className="font-extrabold">
          {model.issues.length?"Conferências e dados a revisar":"Coerência dos dados do desenvolvimento"}
        </p>
        <p className="mt-1">Kc confrontado com curva aprovada em {model.checkedKcDays} dia(s).
          A fenologia é um calendário estimado/calibrado, não identificação visual automática da lavoura.</p>
        {model.issues.map((issue,i)=><p key={i} className="mt-1">• {issue}</p>)}
      </div>
    </div>
  );
}
