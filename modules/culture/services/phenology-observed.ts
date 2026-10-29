/** Registros de campo da parcela são fatos observacionais, não curvas da cultivar. */
export interface PhenologyStageOption {
  id: string;
  code: string;
  name: string;
  order: number;
}

export interface PhenologyFieldObservation {
  id: string;
  marker_id: string;
  observed_date: string;
  dae: number;
  quality: string;
  notes: string | null;
}

export function compareStageCodes(a:string,b:string):number {
  const position=(s:string)=>{
    const code=s.toUpperCase();
    if(code==="VE")return 0;
    if(code==="VC")return 1;
    const v=/^V(\d+)$/i.exec(code);
    if(v)return 10+Number(v[1]);
    if(code==="VN")return 90;
    const r=/^R(\d+)(?:\.(\d+))?$/i.exec(code);
    if(r)return 100+Number(r[1])*10+(r[2]?Number(r[2])/10:0);
    const b=/^B(\d+)$/i.exec(code);if(b)return 210+Number(b[1]);
    const f=/^F(\d+)$/i.exec(code);if(f)return 310+Number(f[1]);
    const c=/^C(\d+)$/i.exec(code);if(c)return 410+Number(c[1]);
    return 900;
  };
  return position(a)-position(b)||a.localeCompare(b);
}

export function activeFieldObservation(
  rows:PhenologyFieldObservation[],
  stages:PhenologyStageOption[],
  today:string,
):{observation:PhenologyFieldObservation;stage:PhenologyStageOption}|null {
  const byId=new Map(stages.map(s=>[s.id,s]));
  const eligible=rows.filter(r=>
    r.quality!=="descartada" && r.observed_date<=today && r.dae>=0 &&
    Number.isFinite(r.dae) && byId.has(r.marker_id)
  );
  eligible.sort((a,b)=>a.observed_date.localeCompare(b.observed_date) ||
    compareStageCodes(byId.get(a.marker_id)!.code,byId.get(b.marker_id)!.code));
  const observation=eligible.at(-1);
  return observation?{observation,stage:byId.get(observation.marker_id)!}:null;
}

/** DAE da data de campo pela mesma origem de DAE do motor (dia da última linha). */
export function daeForFieldObservation(todayDate:string,todayDae:number,observedDate:string):number|null {
  const a=Date.parse(todayDate+"T12:00:00Z");
  const b=Date.parse(observedDate+"T12:00:00Z");
  if(!Number.isFinite(a)||!Number.isFinite(b)||b>a||!Number.isFinite(todayDae))return null;
  const dae=todayDae-Math.round((a-b)/86400000);
  return dae>=0?dae:null;
}
