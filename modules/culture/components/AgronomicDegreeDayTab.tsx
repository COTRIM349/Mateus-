"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { calculateDayLengthHours, calculateDegreeDay } from "@/modules/culture/services/agronomic-engine";

interface CultureOption { id:string; name:string; scientific_name?:string|null }
interface CultivarOption { id:string; name:string }
interface SourceOption { id:string; title:string|null; institution:string|null }
interface ThermalParam {
  id:string; parameter_code:string; scope_type:string; culture_id:string; cultivar_id:string|null;
  numeric_value:number|null; text_value:string|null; unit:string|null; source_id:string|null;
  confidence:string; validation_status:string; active_for_calculation:boolean; method:string|null;
  notes:string|null; created_at:string;
}

const CONFIDENCE=[
 {value:"alta",label:"Alta"},{value:"media",label:"Média"},{value:"baixa",label:"Baixa"},{value:"nao_validada",label:"Não validada"},
];
const VALIDATION=[
 {value:"draft",label:"Rascunho"},{value:"review",label:"Em revisão"},{value:"approved",label:"Aprovado"},{value:"rejected",label:"Rejeitado"},
];
const PARAMS=[
 {value:"base_temperature_lower_c",label:"Temperatura-base inferior (Tb)",unit:"°C"},
 {value:"base_temperature_upper_c",label:"Temperatura-base superior",unit:"°C"},
 {value:"optimal_temperature_c",label:"Temperatura ótima",unit:"°C"},
];
function n(v:FormDataEntryValue|null){const s=String(v??"").trim();if(!s)return null;const x=Number(s.replace(",","."));return Number.isFinite(x)?x:null;}
function normalize(s:string){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}

export function AgronomicDegreeDayTab({
 selectedCultureId,onSelectCulture,cultures,
}:{selectedCultureId:string|null;onSelectCulture:(id:string|null)=>void;cultures:CultureOption[]}){
 const supabase=createClient();
 const [cultivars,setCultivars]=useState<CultivarOption[]>([]);
 const [cultivarId,setCultivarId]=useState("");
 const [sources,setSources]=useState<SourceOption[]>([]);
 const [params,setParams]=useState<ThermalParam[]>([]);
 const [modal,setModal]=useState(false);
 const [editing,setEditing]=useState<ThermalParam|null>(null);
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);
 const [tmax,setTmax]=useState("30");
 const [tmin,setTmin]=useState("20");
 const [latitude,setLatitude]=useState("-14");
 const [date,setDate]=useState(new Date().toISOString().slice(0,10));

 const selectedCulture=cultures.find(c=>c.id===selectedCultureId);
 const isSoy=selectedCulture?normalize(`${selectedCulture.name} ${selectedCulture.scientific_name??""}`).includes("soja")||normalize(selectedCulture.scientific_name??"").includes("glycine max"):false;

 const loadCatalog=useCallback(async()=>{
  if(!selectedCultureId){setCultivars([]);setSources([]);return;}
  const [v,s]=await Promise.all([
   supabase.from("culture_varieties").select("id,name").eq("culture_id",selectedCultureId).eq("active",true).order("name"),
   supabase.from("agronomic_sources").select("id,title,institution").eq("active",true).order("created_at",{ascending:false}),
  ]);
  setCultivars((v.data??[]) as CultivarOption[]); setSources((s.data??[]) as SourceOption[]);
 },[selectedCultureId,supabase]);
 useEffect(()=>{void loadCatalog();},[loadCatalog]);

 const loadParams=useCallback(async()=>{
  if(!selectedCultureId){setParams([]);return;}
  let q=supabase.from("agronomic_parameter_values").select("*").eq("culture_id",selectedCultureId)
   .in("parameter_code",["base_temperature_lower_c","base_temperature_upper_c","optimal_temperature_c","degree_day_method"])
   .order("created_at",{ascending:false});
  q=cultivarId?q.eq("cultivar_id",cultivarId):q.is("cultivar_id",null);
  const {data}=await q; setParams((data??[]) as ThermalParam[]);
 },[selectedCultureId,cultivarId,supabase]);
 useEffect(()=>{void loadParams();},[loadParams]);

 const sourceLabel=useMemo(()=>Object.fromEntries(sources.map(s=>[s.id,s.title||s.institution||"Fonte"])),[sources]);
 const activeTb=params.find(p=>p.parameter_code==="base_temperature_lower_c"&&p.active_for_calculation&&p.numeric_value!=null)??null;
 const activeMethod=params.find(p=>p.parameter_code==="degree_day_method"&&p.active_for_calculation)??null;
 const method=activeMethod?.text_value??"simple_average";
 const tmaxN=Number(tmax.replace(",", ".")),tminN=Number(tmin.replace(",", "."));
 let gd:number|null=null;
 if(activeTb?.numeric_value!=null&&Number.isFinite(tmaxN)&&Number.isFinite(tminN)){
  try{gd=calculateDegreeDay({tmaxC:tmaxN,tminC:tminN,baseTemperatureC:activeTb.numeric_value});}catch{gd=null;}
 }
 let photoperiod:number|null=null;
 const latN=Number(latitude.replace(",", "."));
 if(Number.isFinite(latN)&&date){try{photoperiod=calculateDayLengthHours(latN,date);}catch{photoperiod=null;}}

 const columns:Column<ThermalParam>[]=[
  {header:"Parâmetro",render:r=>PARAMS.find(p=>p.value===r.parameter_code)?.label??(r.parameter_code==="degree_day_method"?"Método de graus-dia":r.parameter_code)},
  {header:"Valor",render:r=>r.numeric_value!=null?`${r.numeric_value} ${r.unit??""}`:r.text_value??"—"},
  {header:"Fonte",render:r=>r.source_id?sourceLabel[r.source_id]??"Fonte arquivada":"—"},
  {header:"Confiança",render:r=>r.confidence},
  {header:"Validação",render:r=>r.validation_status},
  {header:"Ativo",render:r=>r.active_for_calculation?"SIM":"—"},
  {header:"Ações",align:"right",render:r=><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={()=>{setEditing(r);setModal(true);}}>Editar</Button><Button variant="ghost" size="sm" disabled={r.active_for_calculation} onClick={()=>void activate(r)}>Ativar</Button></div>},
 ];

 async function activate(row:ThermalParam){
  if(!selectedCultureId)return;
  if(row.validation_status!=="approved"){setError("Somente parâmetro aprovado pode ser ativado.");return;}
  setSaving(true);setError("");
  let off=supabase.from("agronomic_parameter_values").update({active_for_calculation:false})
    .eq("culture_id",selectedCultureId).eq("parameter_code",row.parameter_code);
  off=cultivarId?off.eq("cultivar_id",cultivarId):off.is("cultivar_id",null);
  await off;
  const {error:e}=await supabase.from("agronomic_parameter_values").update({active_for_calculation:true,approved_at:new Date().toISOString()}).eq("id",row.id);
  if(e)setError(e.message);
  setSaving(false);await loadParams();
 }

 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault(); if(!selectedCultureId)return;
  const fd=new FormData(e.currentTarget); const code=String(fd.get("parameter_code")??""); const src=String(fd.get("source_id")??"").trim();
  if(!src){setError("Fonte obrigatória.");return;}
  const isMethod=code==="degree_day_method";
  const numeric=isMethod?null:n(fd.get("numeric_value"));
  const text=isMethod?String(fd.get("text_value")??"").trim():null;
  if(!isMethod&&numeric==null){setError("Informe um valor numérico.");return;}
  if(isMethod&&!text){setError("Informe o método.");return;}
  const scope=cultivarId?"cultivar":"culture";
  const unit=isMethod?null:(PARAMS.find(p=>p.value===code)?.unit??null);
  const payload={parameter_code:code,scope_type:scope,culture_id:selectedCultureId,cultivar_id:cultivarId||null,farm_id:null,season_id:null,planting_window_id:null,numeric_value:numeric,text_value:text,unit,source_id:src,confidence:String(fd.get("confidence")??"nao_validada"),validation_status:String(fd.get("validation_status")??"draft"),method:isMethod?text:"thermal_parameter",active_for_calculation:editing?.active_for_calculation??false,notes:String(fd.get("notes")??"").trim()||null,updated_at:new Date().toISOString()};
  setSaving(true);setError("");
  const res=editing?await supabase.from("agronomic_parameter_values").update(payload).eq("id",editing.id):await supabase.from("agronomic_parameter_values").insert(payload);
  if(res.error){setError(res.error.message);setSaving(false);return;}
  setModal(false);setEditing(null);setSaving(false);await loadParams();
 }

 const defaultCode=editing?.parameter_code??"base_temperature_lower_c";
 const sourceOptions=[{value:"",label:"Selecione a fonte"},...sources.map(s=>({value:s.id,label:s.title||s.institution||"Fonte"}))];

 return <>
  <div className="mb-4 grid gap-4 sm:grid-cols-3">
   <Select id="gdd_culture" name="gdd_culture" label="Cultura" options={cultures.map(c=>({value:c.id,label:c.name}))} value={selectedCultureId??""} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>onSelectCulture(e.target.value||null)}/>
   <Select id="gdd_cultivar" name="gdd_cultivar" label="Parâmetro para" options={[{value:"",label:"Referência da cultura"},...cultivars.map(v=>({value:v.id,label:v.name}))]} value={cultivarId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setCultivarId(e.target.value)} disabled={!selectedCultureId}/>
   <div className="flex items-end justify-end"><Button onClick={()=>{setEditing(null);setModal(true);setError("");}} disabled={!selectedCultureId}>Novo parâmetro térmico</Button></div>
  </div>

  {isSoy&&<div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"><strong>Soja:</strong> GDA não deve ser usado isoladamente para prever florescimento. O motor deverá combinar cultivar, janela e observações; fotoperíodo entra progressivamente conforme a base local aumenta.</div>}

  <div className="grid gap-4 lg:grid-cols-2">
   <Card>
    <div className="mb-3"><h3 className="font-semibold text-graphite-900 dark:text-white">Parâmetros térmicos rastreáveis</h3><p className="text-xs text-graphite-400">Nenhuma Tb é criada automaticamente para completar cadastro.</p></div>
    {params.length?<Table columns={columns} data={params} getKey={r=>r.id}/>:<p className="py-8 text-center text-sm text-graphite-400">Sem parâmetros térmicos cadastrados.</p>}
   </Card>
   <Card>
    <h3 className="font-semibold text-graphite-900 dark:text-white">Validação do cálculo diário</h3>
    <p className="mt-1 text-xs text-graphite-400">Motor V1: GD = max(0, ((Tmax + Tmin) / 2) − Tb).</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><Input id="gdd_tmax" label="Tmax (°C)" value={tmax} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setTmax(e.target.value)}/><Input id="gdd_tmin" label="Tmin (°C)" value={tmin} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setTmin(e.target.value)}/></div>
    <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><p className="text-xs text-graphite-400">Tb ativa</p><p className="text-lg font-semibold">{activeTb?.numeric_value!=null?`${activeTb.numeric_value} °C`:"Sem Tb ativa"}</p><p className="mt-2 text-xs text-graphite-400">Método: {method}</p><p className="mt-3 text-2xl font-semibold text-graphite-900 dark:text-white">{gd!=null?`${gd.toFixed(3)} °C·dia`:"—"}</p></div>
   </Card>
  </div>

  <Card className="mt-4">
   <h3 className="font-semibold text-graphite-900 dark:text-white">Fotoperíodo astronômico</h3>
   <p className="mt-1 text-xs text-graphite-400">Duração do dia usa latitude + data. Longitude só é necessária se forem calculados horários locais de nascer/pôr do sol.</p>
   <div className="mt-4 grid gap-4 sm:grid-cols-3"><Input id="gdd_lat" label="Latitude" value={latitude} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setLatitude(e.target.value)}/><Input id="gdd_date" label="Data" type="date" value={date} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setDate(e.target.value)}/><div className="rounded-xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]"><p className="text-xs text-graphite-400">Fotoperíodo calculado</p><p className="mt-1 text-xl font-semibold">{photoperiod!=null?`${photoperiod.toFixed(2)} h`:"—"}</p></div></div>
  </Card>

  {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

  <Modal open={modal} onClose={()=>{setModal(false);setEditing(null);setError("");}} title={editing?"Editar parâmetro térmico":"Novo parâmetro térmico"} size="lg">
   <form onSubmit={save} className="space-y-5">
    <Select id="parameter_code" name="parameter_code" label="Parâmetro" options={[...PARAMS.map(p=>({value:p.value,label:p.label})),{value:"degree_day_method",label:"Método de cálculo de graus-dia"}]} required defaultValue={defaultCode}/>
    {defaultCode==="degree_day_method"?<Input id="text_value" name="text_value" label="Método" placeholder="simple_average" required defaultValue={editing?.text_value??"simple_average"}/>:<Input id="numeric_value" name="numeric_value" label="Valor" type="number" step="0.01" required defaultValue={editing?.numeric_value??""}/>}
    <div className="grid gap-4 sm:grid-cols-2"><Select id="source_id" name="source_id" label="Fonte" options={sourceOptions} required defaultValue={editing?.source_id??""}/><Select id="confidence" name="confidence" label="Confiabilidade" options={CONFIDENCE} required defaultValue={editing?.confidence??"nao_validada"}/><Select id="validation_status" name="validation_status" label="Validação" options={VALIDATION} required defaultValue={editing?.validation_status??"draft"}/></div>
    <TextArea id="notes" name="notes" label="Observações" defaultValue={editing?.notes??""}/>
    <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={()=>setModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar</Button></div>
   </form>
  </Modal>
 </>;
}
