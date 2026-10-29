/** Projeção visual do desenvolvimento com DAE cadastrados. Sem inventar idade de estádio. */
import type { PhenologyChartMarker } from "./phenology-chart-markers";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";
import { calculateDailyKc } from "./agronomic-engine";
import { compareStageCodes } from "./phenology-observed";

export const SOY_STAGE_CODES = [
  "VE", "VC", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10",
  "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8",
] as const;

export interface DevelopmentMilestone {
  code: string;
  label: string;
  dae: number | null;
  origin: "calibrado" | "esperado" | null;
  reached: boolean;
  current: boolean;
}

export interface DevelopmentAudit {
  currentStage: DevelopmentMilestone | null;
  stageOrigin: "calibrado" | "esperado" | "não cadastrado";
  stages: DevelopmentMilestone[];
  issues: string[];
  checkedKcDays: number;
}

const normalize = (s: string) => s.trim().toUpperCase();

/** Calibração tem precedência somente se o alvo foi ativado no cadastro. */
export function buildDevelopmentAudit(input: {
  isSoy: boolean;
  currentDae: number | null;
  markers: PhenologyChartMarker[];
  rows: DailyBalanceRow[];
  kcCurve: { x: number; y: number }[] | null;
}): DevelopmentAudit {
  const { currentDae, isSoy, markers, rows, kcCurve }=input;
  const dae= currentDae != null && Number.isFinite(currentDae) ? Math.max(0,currentDae) : null;
  const validMarkers = markers.filter(m=>Number.isFinite(m.dae) && m.dae>=0)
    .map(m=>({...m,code:normalize(m.code)}));
  // Não descartar Vn nem subdivisões R5.1–R5.5 já cadastradas na plataforma.
  const stageCodes = isSoy
    ? Array.from(new Set<string>([
        ...SOY_STAGE_CODES,
        ...validMarkers.map(m=>m.code).filter(s=>/^(VE|VC|VN|V\d+|R[1-8](?:\.\d+)?)$/.test(s)),
      ])).sort(compareStageCodes)
    : Array.from(new Set(validMarkers.map(m=>m.code))).sort(compareStageCodes);
  const stages: DevelopmentMilestone[] = stageCodes.map(code=>{
    const m=validMarkers.find(x=>x.code===code);
    return {code,label:m?.label??code,dae:m?.dae??null,origin:m?.origin??null,
      reached:dae!=null && m!=null && m.dae<=dae,current:false};
  });
  const reached=stages.filter(s=>s.reached)
    .sort((a,b)=>(a.dae??0)-(b.dae??0)||compareStageCodes(a.code,b.code));
  const lastDae=reached.at(-1)?.dae;
  const simultaneous=lastDae==null?[]:reached.filter(s=>s.dae===lastDae);
  const isAmbiguous=simultaneous.length>1;
  // DAE idêntico para R5.1–R5.5 não é observação de todos os estádios no mesmo dia.
  const currentStage=(isAmbiguous
    ? [...reached].reverse().find(s=>s.dae!==lastDae)
    : reached.at(-1))??null;
  if(currentStage) currentStage.current=true;
  const issues:string[]=[];
  if (dae == null) issues.push("DAE atual não disponível: não é possível posicionar estádios.");
  if(isAmbiguous) issues.push("Vários estádios compartilham "+lastDae+" DAE ("+
    simultaneous.map(s=>s.code).join(", ")+"): subdivisões precisam de calibração de campo.");
  if(isSoy && stages.filter(s=>s.dae!=null).length<4)
    issues.push("Fenologia da cultivar incompleta: cadastre DAE de VE, VC, V1, V2 e demais estádios para acompanhar sua progressão.");
  const sortedCodes = stages.filter(s=>s.dae!=null);
  for(let i=1;i<sortedCodes.length;i++) if((sortedCodes[i].dae??0)<(sortedCodes[i-1].dae??0)) {
    issues.push("Marcos fenológicos fora de ordem: "+sortedCodes[i-1].code+" e "+sortedCodes[i].code+".");
    break;
  }
  const validCurve=kcCurve?.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.x-b.x)??[];
  let checkedKcDays=0, kcMismatches=0;
  if(validCurve.length>=2){
    for(const row of rows){
      if(row.dae==null||!Number.isFinite(row.dae)||!Number.isFinite(row.kc)) continue;
      checkedKcDays++;
      const expected=calculateDailyKc(validCurve,row.dae);
      if(Math.abs(row.kc-expected)>0.035) kcMismatches++;
    }
    if(kcMismatches) issues.push("Kc registrado difere da curva ativa em "+kcMismatches+" de "+checkedKcDays+" dia(s). Verifique DAE, curva aprovada e recálculo.");
  }else issues.push("Sem curva de Kc aprovada em DAE para confrontar os valores diários; exibindo o Kc do motor.");
  for(const row of rows){
    if(!Number.isFinite(row.rootDepth)||row.rootDepth<=0) {
      issues.push("Profundidade radicular efetiva inválida em "+row.date+".");break;
    }
    if(row.rootDepthEstimated!=null && Number.isFinite(row.rootDepthEstimated) && row.rootDepth>row.rootDepthEstimated+0.02){
      issues.push("Raiz efetiva supera a raiz estimada da cultura em "+row.date+".");break;
    }
  }
  return {currentStage,stageOrigin:currentStage?.origin??"não cadastrado",stages,issues,checkedKcDays};
}
