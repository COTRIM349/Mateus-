"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

interface CultureOption { id:string; name:string }
interface CultivarOption { id:string; name:string }
interface SourceOption { id:string; title:string|null; institution:string|null }
interface Marker {
  id:string;
  stage_code:string;
  name:string;
  marker_order:number;
  physiological_process:string|null;
  yield_component_risk:string|null;
}
interface Sensitivity {
  id:string;
  culture_id:string;
  cultivar_id:string|null;
  marker_id:string;
  sensitivity_level:string;
  physiological_process:string;
  yield_component_at_risk:string|null;
  irrigation_priority_weight:number|null;
  source_id:string;
  confidence:string;
  validation_status:string;
  active_for_calculation:boolean;
  version:number;
  notes:string|null;
}

const LEVELS=[
 {value:"baixa",label:"Baixa"},{value:"media",label:"Média"},{value:"alta",label:"Alta"},{value:"muito_alta",label:"Muito alta"},
];
const CONFIDENCE=[
 {value:"alta",label:"Alta"},{value:"media",label:"Média"},{value:"baixa",label:"Baixa"},{value:"nao_validada",label:"Não validada"},
];
const VALIDATION=[
 {value:"draft",label:"Rascunho"},{value:"review",label:"Em revisão"},{value:"approved",label:"Aprovado"},{value:"rejected",label:"Rejeitado"},
];
function n(v:FormDataEntryValue|null){const s=String(v??"").trim();if(!s)return null;const x=Number(s.replace(",","."));return Number.isFinite(x)?x:null;}

export function HydricSensitivityTab({
 selectedCultureId,onSelectCulture,cultures,
}:{selectedCultureId:string|null;onSelectCulture:(id:string|null)=>void;cultures:CultureOption[]}){
 const supabase=createClient();
 const [cultivars,setCultivars]=useState<CultivarOption[]>([]);
 const [cultivarId,setCultivarId]=useState("");
 const [sources,setSources]=useState<SourceOption[]>([]);
 const [markers,setMarkers]=useState<Marker[]>([]);
 const [rows,setRows]=useState<Sensitivity[]>([]);
 const [editingMarker,setEditingMarker]=useState<Marker|null>(null);
 const [editing,setEditing]=useState<Sensitivity|null>(null);
 const [error,setError]=useState("");
 const [saving,setSaving]=useState(false);

 const loadBase=useCallback(async()=>{
  if(!selectedCultureId){setCultivars([]);setMarkers([]);setRows([]);return;}
  const [v,s,m]=await Promise.all([
   supabase.from("culture_varieties").select("id,name").eq("culture_id",selectedCultureId).eq("active",true).order("name"),
   supabase.from("agronomic_sources").select("id,title,institution").eq("active",true).order("created_at",{ascending:false}),
   supabase.from("culture_phenology_markers")
    .select("id,stage_code,name,marker_order,physiological_process,yield_component_risk")
    .eq("culture_id",selectedCultureId).eq("active",true).order("marker_order"),
  ]);
  setCultivars((v.data??[]) as CultivarOption[]);
  setSources((s.data??[]) as SourceOption[]);
  setMarkers((m.data??[]) as Marker[]);
 },[selectedCultureId,supabase]);
 useEffect(()=>{void loadBase();},[loadBase]);

 const loadSensitivity=useCallback(async()=>{
  if(!selectedCultureId){setRows([]);return;}
  let q=supabase.from("hydric_sensitivity_stages").select("*").eq("culture_id",selectedCultureId).order("created_at",{ascending:false});
  q=cultivarId?q.eq("cultivar_id",cultivarId):q.is("cultivar_id",null);
  const {data}=await q; setRows((data??[]) as Sensitivity[]);
 },[selectedCultureId,cultivarId,supabase]);
 useEffect(()=>{void loadSensitivity();},[loadSensitivity]);

 const sourceLabel=useMemo(()=>Object.fromEntries(sources.map(s=>[s.id,s.title||s.institution||"Fonte"])),[sources]);
 const activeByMarker=useMemo(()=>{
  const map:Record<string,Sensitivity>={};
  for(const row of rows){if(row.active_for_calculation&&!map[row.marker_id])map[row.marker_id]=row;}
  return map;
 },[rows]);
 const latestByMarker=useMemo(()=>{
  const map:Record<string,Sensitivity>={};
  for(const row of rows){if(!map[row.marker_id])map[row.marker_id]=row;}
  return map;
 },[rows]);

 const columns:Column<Marker>[]=[
  {header:"Estádio",render:m=><div><p className="font-semibold text-graphite-900 dark:text-white">{m.stage_code}</p><p className="text-xs text-graphite-400">{m.name}</p></div>},
  {header:"Sensibilidade ativa",render:m=>{const r=activeByMarker[m.id];return r?LEVELS.find(x=>x.value===r.sensitivity_level)?.label??r.sensitivity_level:"Sem parâmetro ativo";}},
  {header:"Processo fisiológico",render:m=>activeByMarker[m.id]?.physiological_process??m.physiological_process??"—"},
  {header:"Componente em risco",render:m=>activeByMarker[m.id]?.yield_component_at_risk??m.yield_component_risk??"—"},
  {header:"Fonte",render:m=>{const r=activeByMarker[m.id]??latestByMarker[m.id];return r?sourceLabel[r.source_id]??"Fonte arquivada":"—";}},
  {header:"Ações",align:"right",render:m=><Button variant="ghost" size="sm" onClick={()=>{setEditingMarker(m);setEditing(latestByMarker[m.id]??null);setError("");}}>Configurar</Button>},
 ];

 async function save(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault(); if(!selectedCultureId||!editingMarker)return; const fd=new FormData(e.currentTarget);
  const src=String(fd.get("source_id")??"").trim();
  const process=String(fd.get("physiological_process")??"").trim();
  if(!src){setError("Fonte obrigatória.");return;}
  if(!process){setError("Informe o processo fisiológico dominante.");return;}

  const payload={
    culture_id:selectedCultureId,
    cultivar_id:cultivarId||null,
    marker_id:editingMarker.id,
    sensitivity_level:String(fd.get("sensitivity_level")??"media"),
    physiological_process:process,
    yield_component_at_risk:String(fd.get("yield_component_at_risk")??"").trim()||null,
    irrigation_priority_weight:n(fd.get("irrigation_priority_weight")),
    source_id:src,
    confidence:String(fd.get("confidence")??"nao_validada"),
    validation_status:String(fd.get("validation_status")??"draft"),
    active_for_calculation:editing?.active_for_calculation??false,
    version:editing?.version??1,
    notes:String(fd.get("notes")??"").trim()||null
  };

  setSaving(true);setError("");
  const res=editing
    ? await supabase.from("hydric_sensitivity_stages").update(payload).eq("id",editing.id)
    : await supabase.from("hydric_sensitivity_stages").insert(payload);
  if(res.error){setError(res.error.message);setSaving(false);return;}
  setEditingMarker(null);setEditing(null);setSaving(false);await loadSensitivity();
 }

 async function activate(){
  if(!editing||!selectedCultureId)return;
  if(editing.validation_status!=="approved"){setError("Somente registro aprovado pode ficar ativo.");return;}
  setSaving(true);setError("");
  let off=supabase.from("hydric_sensitivity_stages").update({active_for_calculation:false})
   .eq("culture_id",selectedCultureId).eq("marker_id",editing.marker_id);
  off=cultivarId?off.eq("cultivar_id",cultivarId):off.is("cultivar_id",null);
  await off;
  const {error:e}=await supabase.from("hydric_sensitivity_stages")
    .update({active_for_calculation:true,approved_at:new Date().toISOString()})
    .eq("id",editing.id);
  if(e)setError(e.message);
  setSaving(false);await loadSensitivity();
  setEditing(prev=>prev?{...prev,active_for_calculation:!e}:prev);
 }

 const sourceOptions=[{value:"",label:"Selecione a fonte"},...sources.map(s=>({value:s.id,label:s.title||s.institution||"Fonte"}))];

 return <>
  <div className="mb-4 grid gap-4 sm:grid-cols-3">
   <Select id="sens_culture" name="sens_culture" label="Cultura" options={cultures.map(c=>({value:c.id,label:c.name}))} value={selectedCultureId??""} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>onSelectCulture(e.target.value||null)}/>
   <Select id="sens_cultivar" name="sens_cultivar" label="Sensibilidade para" options={[{value:"",label:"Referência da cultura"},...cultivars.map(v=>({value:v.id,label:v.name}))]} value={cultivarId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setCultivarId(e.target.value)} disabled={!selectedCultureId}/>
   <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-graphite-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400">Prioridade hídrica será combinada com déficit, AFD/RAW, Ks, ETc e restrições operacionais — nunca usada isoladamente.</div>
  </div>

  <Card>
   {!selectedCultureId?<p className="py-8 text-center text-sm text-graphite-400">Selecione uma cultura.</p>:markers.length?<Table columns={columns} data={markers} getKey={r=>r.id}/>:<p className="py-8 text-center text-sm text-graphite-400">Sem marcadores fenológicos ativos.</p>}
  </Card>

  {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

  <Modal open={!!editingMarker} onClose={()=>{setEditingMarker(null);setEditing(null);setError("");}} title={editingMarker?(editingMarker.stage_code+" — Sensibilidade hídrica"):"Sensibilidade hídrica"} size="lg">
   {editingMarker&&<form onSubmit={save} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
     <Select id="sensitivity_level" name="sensitivity_level" label="Nível de sensibilidade" options={LEVELS} required defaultValue={editing?.sensitivity_level??"media"}/>
     <Input id="irrigation_priority_weight" name="irrigation_priority_weight" label="Peso de prioridade (0–10)" type="number" min="0" max="10" step="0.1" defaultValue={editing?.irrigation_priority_weight??""}/>
    </div>
    <Input id="physiological_process" name="physiological_process" label="Processo fisiológico dominante" required defaultValue={editing?.physiological_process??editingMarker.physiological_process??""}/>
    <Input id="yield_component_at_risk" name="yield_component_at_risk" label="Componente de produtividade em risco" defaultValue={editing?.yield_component_at_risk??editingMarker.yield_component_risk??""}/>
    <div className="grid gap-4 sm:grid-cols-3">
      <Select id="source_id" name="source_id" label="Fonte" options={sourceOptions} required defaultValue={editing?.source_id??""}/>
      <Select id="confidence" name="confidence" label="Confiabilidade" options={CONFIDENCE} required defaultValue={editing?.confidence??"nao_validada"}/>
      <Select id="validation_status" name="validation_status" label="Validação" options={VALIDATION} required defaultValue={editing?.validation_status??"draft"}/>
    </div>
    <TextArea id="notes" name="notes" label="Observações" defaultValue={editing?.notes??""}/>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">O nível não é inferido automaticamente pelo nome do estádio. Precisa de fonte ou calibração.</div>
    <div className="flex justify-between gap-3">
     <div>{editing&&<Button variant="secondary" type="button" onClick={()=>void activate()} disabled={editing.active_for_calculation||saving}>{editing.active_for_calculation?"Ativo":"Ativar aprovado"}</Button>}</div>
     <div className="flex gap-3"><Button variant="secondary" type="button" onClick={()=>setEditingMarker(null)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar</Button></div>
    </div>
   </form>}
  </Modal>
 </>;
}
