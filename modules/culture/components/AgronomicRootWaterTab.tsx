"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, ConfirmDialog, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { calculateRootDepthMeters } from "@/modules/culture/services/agronomic-engine";

interface CultureOption { id:string; name:string }
interface CultivarOption { id:string; name:string }
interface SourceOption { id:string; title:string|null; institution:string|null }
interface RootCurve {
  id:string; culture_id:string; cultivar_id:string|null; curve_name:string; curve_type:string;
  axis_type:"DAE"|"GDA"|"PHENOLOGY_PROGRESS"; source_id:string|null; confidence:string;
  validation_status:string; active_for_calculation:boolean; version:number; notes:string|null;
}
interface RootAnchor {
  id:string; curve_id:string; sequence_no:number; x_value:number; root_depth_m:number;
  source_id:string|null; confidence:string; notes:string|null;
}
interface PValue {
  id:string; parameter_code:string; scope_type:string; culture_id:string; cultivar_id:string|null;
  numeric_value:number|null; unit:string|null; source_id:string|null; confidence:string;
  validation_status:string; active_for_calculation:boolean; method:string|null; notes:string|null;
}

const CURVE_TYPES=[
  {value:"bibliographic",label:"Bibliográfica"},
  {value:"manufacturer",label:"Fabricante"},
  {value:"regional",label:"Regional"},
  {value:"local_calibrated",label:"Calibrada localmente"},
  {value:"legacy_study",label:"Legado / estudo"},
  {value:"provisional",label:"Provisória"},
];
const AXES=[
  {value:"DAE",label:"DAE"},
  {value:"GDA",label:"GDA"},
  {value:"PHENOLOGY_PROGRESS",label:"Progresso fenológico"},
];
const CONFIDENCE=[
  {value:"alta",label:"Alta"},{value:"media",label:"Média"},{value:"baixa",label:"Baixa"},{value:"nao_validada",label:"Não validada"},
];
const VALIDATION=[
  {value:"draft",label:"Rascunho"},{value:"review",label:"Em revisão"},{value:"approved",label:"Aprovado"},{value:"rejected",label:"Rejeitado"},
];

function n(v:FormDataEntryValue|null):number|null{
  const s=String(v??"").trim(); if(!s)return null; const x=Number(s.replace(",",".")); return Number.isFinite(x)?x:null;
}

function RootSvg({anchors}:{anchors:RootAnchor[]}){
  const p=[...anchors].sort((a,b)=>a.x_value-b.x_value);
  if(p.length<2)return <div className="flex h-52 items-center justify-center text-sm text-graphite-400">Cadastre pelo menos dois pontos de Zr.</div>;
  const minX=p[0].x_value,maxX=p[p.length-1].x_value,spanX=Math.max(maxX-minX,1);
  const maxY=Math.max(...p.map(a=>a.root_depth_m),0.1);
  const coords=p.map(a=>({a,x:45+((a.x_value-minX)/spanX)*510,y:185-(a.root_depth_m/maxY)*145}));
  return <svg viewBox="0 0 600 225" className="h-52 w-full" role="img" aria-label="Curva de profundidade radicular">
    <line x1="45" y1="185" x2="560" y2="185" stroke="currentColor" opacity=".25"/>
    <line x1="45" y1="35" x2="45" y2="185" stroke="currentColor" opacity=".25"/>
    <polyline points={coords.map(c=>`${c.x},${c.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="3"/>
    {coords.map(({a,x,y})=><g key={a.id}><circle cx={x} cy={y} r="5" fill="currentColor"/><text x={x} y={y-9} textAnchor="middle" fontSize="10" fill="currentColor">{a.root_depth_m.toFixed(2)} m</text><text x={x} y="202" textAnchor="middle" fontSize="10" fill="currentColor">{a.x_value}</text></g>)}
    <text x="300" y="220" textAnchor="middle" fontSize="11" fill="currentColor">Eixo da curva</text>
  </svg>;
}

export function AgronomicRootWaterTab({
 selectedCultureId,onSelectCulture,cultures,
}:{selectedCultureId:string|null;onSelectCulture:(id:string|null)=>void;cultures:CultureOption[]}){
  const supabase=createClient();
  const [cultivars,setCultivars]=useState<CultivarOption[]>([]);
  const [cultivarId,setCultivarId]=useState("");
  const [sources,setSources]=useState<SourceOption[]>([]);
  const [curves,setCurves]=useState<RootCurve[]>([]);
  const [curveId,setCurveId]=useState("");
  const [anchors,setAnchors]=useState<RootAnchor[]>([]);
  const [pValues,setPValues]=useState<PValue[]>([]);
  const [curveModal,setCurveModal]=useState(false);
  const [editingCurve,setEditingCurve]=useState<RootCurve|null>(null);
  const [anchorModal,setAnchorModal]=useState(false);
  const [editingAnchor,setEditingAnchor]=useState<RootAnchor|null>(null);
  const [deleteAnchor,setDeleteAnchor]=useState<RootAnchor|null>(null);
  const [pModal,setPModal]=useState(false);
  const [editingP,setEditingP]=useState<PValue|null>(null);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  const loadCatalog=useCallback(async()=>{
    if(!selectedCultureId){setCultivars([]);setSources([]);return;}
    const [v,s]=await Promise.all([
      supabase.from("culture_varieties").select("id,name").eq("culture_id",selectedCultureId).eq("active",true).order("name"),
      supabase.from("agronomic_sources").select("id,title,institution").eq("active",true).order("created_at",{ascending:false}),
    ]);
    setCultivars((v.data??[]) as CultivarOption[]);
    setSources((s.data??[]) as SourceOption[]);
  },[selectedCultureId,supabase]);
  useEffect(()=>{void loadCatalog();},[loadCatalog]);

  const loadCurves=useCallback(async()=>{
    if(!selectedCultureId){setCurves([]);setCurveId("");return;}
    let q=supabase.from("root_depth_curves").select("*").eq("culture_id",selectedCultureId).order("created_at",{ascending:false});
    q=cultivarId?q.eq("cultivar_id",cultivarId):q.is("cultivar_id",null);
    const {data}=await q; const rows=(data??[]) as RootCurve[]; setCurves(rows);
    setCurveId(cur=>rows.some(r=>r.id===cur)?cur:(rows[0]?.id??""));
  },[selectedCultureId,cultivarId,supabase]);
  useEffect(()=>{void loadCurves();},[loadCurves]);

  const loadAnchors=useCallback(async()=>{
    if(!curveId){setAnchors([]);return;}
    const {data}=await supabase.from("root_depth_anchor_points").select("*").eq("curve_id",curveId).order("sequence_no");
    setAnchors((data??[]) as RootAnchor[]);
  },[curveId,supabase]);
  useEffect(()=>{void loadAnchors();},[loadAnchors]);

  const loadP=useCallback(async()=>{
    if(!selectedCultureId){setPValues([]);return;}
    let q=supabase.from("agronomic_parameter_values").select("*")
      .eq("culture_id",selectedCultureId).eq("parameter_code","depletion_fraction_p").order("created_at",{ascending:false});
    q=cultivarId?q.eq("cultivar_id",cultivarId):q.is("cultivar_id",null);
    const {data}=await q; setPValues((data??[]) as PValue[]);
  },[selectedCultureId,cultivarId,supabase]);
  useEffect(()=>{void loadP();},[loadP]);

  const sourceLabel=useMemo(()=>Object.fromEntries(sources.map(s=>[s.id,s.title||s.institution||"Fonte"])),[sources]);
  const curve=curves.find(c=>c.id===curveId)||null;
  const sourceOptions=[{value:"",label:"Selecione a fonte"},...sources.map(s=>({value:s.id,label:s.title||s.institution||"Fonte"}))];

  const saveCurve=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); if(!selectedCultureId)return; const fd=new FormData(e.currentTarget);
    const src=String(fd.get("source_id")??"").trim(); if(!src){setError("Fonte obrigatória.");return;}
    const payload={culture_id:selectedCultureId,cultivar_id:cultivarId||null,curve_name:String(fd.get("curve_name")??"").trim(),curve_type:String(fd.get("curve_type")??"bibliographic"),axis_type:String(fd.get("axis_type")??"DAE"),source_id:src,confidence:String(fd.get("confidence")??"nao_validada"),validation_status:String(fd.get("validation_status")??"draft"),active_for_calculation:editingCurve?.active_for_calculation??false,notes:String(fd.get("notes")??"").trim()||null};
    if(!payload.curve_name){setError("Nome da curva é obrigatório.");return;}
    setSaving(true);setError("");
    const res=editingCurve?await supabase.from("root_depth_curves").update(payload).eq("id",editingCurve.id):await supabase.from("root_depth_curves").insert(payload);
    if(res.error){setError(res.error.message);setSaving(false);return;}
    setCurveModal(false);setEditingCurve(null);setSaving(false);await loadCurves();
  };

  const saveAnchor=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); if(!curve)return; const fd=new FormData(e.currentTarget); const x=n(fd.get("x_value")),z=n(fd.get("root_depth_m"));
    if(x==null||z==null){setError("Eixo e profundidade são obrigatórios.");return;}
    const payload={curve_id:curve.id,sequence_no:n(fd.get("sequence_no"))??anchors.length+1,stage_id:null,x_value:x,root_depth_m:z,source_id:curve.source_id,confidence:curve.confidence,notes:String(fd.get("notes")??"").trim()||null};
    setSaving(true);setError("");
    const res=editingAnchor?await supabase.from("root_depth_anchor_points").update(payload).eq("id",editingAnchor.id):await supabase.from("root_depth_anchor_points").insert(payload);
    if(res.error){setError(res.error.message);setSaving(false);return;}
    setAnchorModal(false);setEditingAnchor(null);setSaving(false);await loadAnchors();
  };

  const activateCurve=async()=>{
    if(!curve||!selectedCultureId)return;
    if(curve.validation_status!=="approved"){setError("Somente curva aprovada pode ser ativada.");return;}
    if(anchors.length<2){setError("Cadastre pelo menos dois pontos de raiz.");return;}
    setSaving(true);
    let off=supabase.from("root_depth_curves").update({active_for_calculation:false}).eq("culture_id",selectedCultureId);
    off=cultivarId?off.eq("cultivar_id",cultivarId):off.is("cultivar_id",null);
    await off;
    await supabase.from("root_depth_curves").update({active_for_calculation:true,approved_at:new Date().toISOString()}).eq("id",curve.id);
    setSaving(false);await loadCurves();
  };

  const saveP=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); if(!selectedCultureId)return; const fd=new FormData(e.currentTarget);
    const value=n(fd.get("p_value")); const src=String(fd.get("source_id")??"").trim();
    if(value==null||value<0||value>1){setError("p deve estar entre 0 e 1.");return;}
    if(!src){setError("Fonte obrigatória.");return;}
    const scope=cultivarId?"cultivar":"culture";
    const payload={parameter_code:"depletion_fraction_p",scope_type:scope,culture_id:selectedCultureId,cultivar_id:cultivarId||null,farm_id:null,season_id:null,planting_window_id:null,numeric_value:value,text_value:null,unit:"fraction",source_id:src,confidence:String(fd.get("confidence")??"nao_validada"),validation_status:String(fd.get("validation_status")??"draft"),method:String(fd.get("method")??"").trim()||null,active_for_calculation:editingP?.active_for_calculation??false,notes:String(fd.get("notes")??"").trim()||null,updated_at:new Date().toISOString()};
    setSaving(true);setError("");
    const res=editingP?await supabase.from("agronomic_parameter_values").update(payload).eq("id",editingP.id):await supabase.from("agronomic_parameter_values").insert(payload);
    if(res.error){setError(res.error.message);setSaving(false);return;}
    setPModal(false);setEditingP(null);setSaving(false);await loadP();
  };

  const activateP=async(p:PValue)=>{
    if(!selectedCultureId)return;
    if(p.validation_status!=="approved"){setError("Somente p aprovado pode ser ativado.");return;}
    setSaving(true);
    let off=supabase.from("agronomic_parameter_values").update({active_for_calculation:false})
      .eq("culture_id",selectedCultureId).eq("parameter_code","depletion_fraction_p");
    off=cultivarId?off.eq("cultivar_id",cultivarId):off.is("cultivar_id",null);
    await off;
    await supabase.from("agronomic_parameter_values").update({active_for_calculation:true,approved_at:new Date().toISOString()}).eq("id",p.id);
    setSaving(false);await loadP();
  };

  const removeAnchor=async()=>{if(!deleteAnchor)return;setSaving(true);await supabase.from("root_depth_anchor_points").delete().eq("id",deleteAnchor.id);setDeleteAnchor(null);setSaving(false);await loadAnchors();};

  const rootColumns:Column<RootAnchor>[]=[
    {header:"#",render:r=>r.sequence_no,align:"right"},
    {header:curve?.axis_type??"X",render:r=>r.x_value,align:"right"},
    {header:"Zr (m)",render:r=>r.root_depth_m.toFixed(3),align:"right"},
    {header:"Ações",align:"right",render:r=><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={()=>{setEditingAnchor(r);setAnchorModal(true);}}>Editar</Button><Button variant="ghost" size="sm" onClick={()=>setDeleteAnchor(r)}>Excluir</Button></div>},
  ];
  const pColumns:Column<PValue>[]=[
    {header:"p",render:r=>r.numeric_value?.toFixed(3)??"—",align:"right"},
    {header:"Origem",render:r=>r.source_id?sourceLabel[r.source_id]??"Fonte arquivada":"—"},
    {header:"Confiança",render:r=>r.confidence},
    {header:"Validação",render:r=>r.validation_status},
    {header:"Ativo",render:r=>r.active_for_calculation?"SIM":"—"},
    {header:"Ações",align:"right",render:r=><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={()=>{setEditingP(r);setPModal(true);}}>Editar</Button><Button variant="ghost" size="sm" onClick={()=>void activateP(r)} disabled={r.active_for_calculation}>Ativar</Button></div>},
  ];

  const middleX=anchors.length>=2?(anchors[0].x_value+anchors[anchors.length-1].x_value)/2:null;
  const middleZ=middleX!=null?calculateRootDepthMeters(anchors.map(a=>({x:a.x_value,y:a.root_depth_m})),middleX):null;

  return <>
    <div className="mb-4 grid gap-4 sm:grid-cols-3">
      <Select id="rw_culture" name="rw_culture" label="Cultura" options={cultures.map(c=>({value:c.id,label:c.name}))} value={selectedCultureId??""} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>onSelectCulture(e.target.value||null)}/>
      <Select id="rw_cultivar" name="rw_cultivar" label="Parâmetro para" options={[{value:"",label:"Referência da cultura"},...cultivars.map(v=>({value:v.id,label:v.name}))]} value={cultivarId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setCultivarId(e.target.value)} disabled={!selectedCultureId}/>
      <div className="flex items-end justify-end gap-2"><Button variant="secondary" onClick={()=>{setEditingP(null);setPModal(true);}} disabled={!selectedCultureId}>Novo p</Button><Button onClick={()=>{setEditingCurve(null);setCurveModal(true);}} disabled={!selectedCultureId}>Nova curva de raiz</Button></div>
    </div>

    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
      <strong>CAD não é cadastrada nem calculada aqui.</strong> A CAD é fornecida pelo módulo de Solo/Balanço Hídrico. Este domínio fornece Zr e p; no cálculo diário recebe <code>cadMm</code> já resolvida para calcular AFD/RAW e Ks.
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="flex-1">
            <Select id="root_curve" name="root_curve" label="Curva de profundidade radicular" options={curves.length?curves.map(c=>({value:c.id,label:`${c.curve_name} · v${c.version}${c.active_for_calculation?" · ATIVA":""}`})):[{value:"",label:"Nenhuma curva"}]} value={curveId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setCurveId(e.target.value)}/>
          </div>
          {curve&&<div className="flex gap-2"><Button variant="secondary" size="sm" onClick={()=>{setEditingCurve(curve);setCurveModal(true);}}>Editar</Button><Button size="sm" onClick={activateCurve} disabled={curve.active_for_calculation||saving}>Ativar</Button></div>}
        </div>
        {curve?<><RootSvg anchors={anchors}/>{middleX!=null&&middleZ!=null&&<p className="text-center text-xs text-graphite-400">Teste: X {middleX.toFixed(1)} → Zr {middleZ.toFixed(3)} m</p>}<div className="mt-4 flex justify-end"><Button size="sm" onClick={()=>{setEditingAnchor(null);setAnchorModal(true);}}>Adicionar ponto</Button></div><div className="mt-3">{anchors.length?<Table columns={rootColumns} data={anchors} getKey={r=>r.id}/>:<p className="py-4 text-center text-sm text-graphite-400">Sem pontos.</p>}</div></>:<p className="py-8 text-center text-sm text-graphite-400">Nenhuma curva de raiz cadastrada.</p>}
      </Card>

      <Card>
        <div className="mb-3"><h3 className="font-semibold text-graphite-900 dark:text-white">Fator de depleção p</h3><p className="text-xs text-graphite-400">p é um parâmetro fisiológico/FAO. Margem de segurança operacional deve permanecer separada.</p></div>
        {pValues.length?<Table columns={pColumns} data={pValues} getKey={r=>r.id}/>:<p className="py-8 text-center text-sm text-graphite-400">Nenhum valor de p rastreável cadastrado.</p>}
      </Card>
    </div>

    {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

    <Modal open={curveModal} onClose={()=>{setCurveModal(false);setEditingCurve(null);setError("");}} title={editingCurve?"Editar curva de raiz":"Nova curva de raiz"} size="lg">
      <form onSubmit={saveCurve} className="space-y-5">
        <Input id="curve_name" name="curve_name" label="Nome da curva" required defaultValue={editingCurve?.curve_name??""}/>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select id="curve_type" name="curve_type" label="Tipo" options={CURVE_TYPES} required defaultValue={editingCurve?.curve_type??"bibliographic"}/>
          <Select id="axis_type" name="axis_type" label="Eixo" options={AXES} required defaultValue={editingCurve?.axis_type??"DAE"}/>
          <Select id="source_id" name="source_id" label="Fonte" options={sourceOptions} required defaultValue={editingCurve?.source_id??""}/>
          <Select id="confidence" name="confidence" label="Confiabilidade" options={CONFIDENCE} required defaultValue={editingCurve?.confidence??"nao_validada"}/>
          <Select id="validation_status" name="validation_status" label="Validação" options={VALIDATION} required defaultValue={editingCurve?.validation_status??"draft"}/>
        </div>
        <TextArea id="notes" name="notes" label="Observações" defaultValue={editingCurve?.notes??""}/>
        <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={()=>setCurveModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar</Button></div>
      </form>
    </Modal>

    <Modal open={anchorModal} onClose={()=>{setAnchorModal(false);setEditingAnchor(null);setError("");}} title={editingAnchor?"Editar ponto de raiz":"Novo ponto de raiz"}>
      <form onSubmit={saveAnchor} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3"><Input id="sequence_no" name="sequence_no" label="Ordem" type="number" min="1" required defaultValue={editingAnchor?.sequence_no??anchors.length+1}/><Input id="x_value" name="x_value" label={curve?.axis_type??"X"} type="number" step="0.01" required defaultValue={editingAnchor?.x_value??""}/><Input id="root_depth_m" name="root_depth_m" label="Zr (m)" type="number" min="0.01" max="5" step="0.001" required defaultValue={editingAnchor?.root_depth_m??""}/></div>
        <TextArea id="notes" name="notes" label="Observações" defaultValue={editingAnchor?.notes??""}/>
        <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={()=>setAnchorModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar</Button></div>
      </form>
    </Modal>

    <Modal open={pModal} onClose={()=>{setPModal(false);setEditingP(null);setError("");}} title={editingP?"Editar p":"Novo fator de depleção p"}>
      <form onSubmit={saveP} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><Input id="p_value" name="p_value" label="p padrão" type="number" min="0" max="1" step="0.001" required defaultValue={editingP?.numeric_value??""}/><Select id="source_id" name="source_id" label="Fonte" options={sourceOptions} required defaultValue={editingP?.source_id??""}/><Select id="confidence" name="confidence" label="Confiabilidade" options={CONFIDENCE} required defaultValue={editingP?.confidence??"nao_validada"}/><Select id="validation_status" name="validation_status" label="Validação" options={VALIDATION} required defaultValue={editingP?.validation_status??"draft"}/></div>
        <Input id="method" name="method" label="Método / condição de referência" defaultValue={editingP?.method??""}/>
        <TextArea id="notes" name="notes" label="Observações" defaultValue={editingP?.notes??""}/>
        <p className="text-xs text-graphite-400">O ajuste diário de p pela ETc é calculado pelo motor e não substitui o valor de referência armazenado.</p>
        <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={()=>setPModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar p</Button></div>
      </form>
    </Modal>

    <ConfirmDialog open={!!deleteAnchor} onClose={()=>setDeleteAnchor(null)} onConfirm={removeAnchor} title="Excluir ponto de raiz" message="Excluir este ponto âncora da curva?" confirmLabel="Excluir" loading={saving}/>
  </>;
}
