"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, ConfirmDialog, Input, Modal, Select, Table, TextArea, type Column } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { calculateDailyKc } from "@/modules/culture/services/agronomic-engine";

interface CultureOption { id: string; name: string }
interface CultivarOption { id: string; name: string }
interface SourceOption { id: string; title: string | null; institution: string | null }
interface KcCurve {
  id: string;
  culture_id: string;
  cultivar_id: string | null;
  curve_name: string;
  curve_type: string;
  axis_type: "DAE" | "GDA" | "PHENOLOGY_PROGRESS";
  eto_reference_method: string | null;
  source_id: string | null;
  confidence: string;
  validation_status: string;
  active_for_calculation: boolean;
  version: number;
  notes: string | null;
}
interface Anchor {
  id: string;
  curve_id: string;
  sequence_no: number;
  marker_id: string | null;
  x_value: number;
  kc_value: number;
  source_id: string | null;
  confidence: string;
  notes: string | null;
}

const CURVE_TYPES = [
  { value: "bibliographic", label: "Bibliográfica" },
  { value: "manufacturer", label: "Fabricante" },
  { value: "regional", label: "Regional" },
  { value: "local_calibrated", label: "Calibrada localmente" },
  { value: "phenology_adjusted", label: "Bibliográfica ajustada à fenologia local" },
  { value: "legacy_study", label: "Legado / estudo" },
  { value: "provisional", label: "Provisória" },
];
const AXES = [
  { value: "DAE", label: "DAE" },
  { value: "GDA", label: "GDA" },
  { value: "PHENOLOGY_PROGRESS", label: "Progresso fenológico" },
];
const CONFIDENCE = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
  { value: "nao_validada", label: "Não validada" },
];
const VALIDATION = [
  { value: "draft", label: "Rascunho" },
  { value: "review", label: "Em revisão" },
  { value: "approved", label: "Aprovada" },
  { value: "rejected", label: "Rejeitada" },
];

function num(v: FormDataEntryValue | null): number | null {
  const raw=String(v??"").trim();
  if(!raw) return null;
  const parsed=Number(raw.replace(",","."));
  return Number.isFinite(parsed)?parsed:null;
}

function CurveSvg({ anchors }: { anchors: Anchor[] }) {
  const points=[...anchors].sort((a,b)=>a.x_value-b.x_value);
  if(points.length<2){
    return <div className="flex h-56 items-center justify-center text-sm text-graphite-400">Cadastre pelo menos dois pontos âncora.</div>;
  }
  const minX=points[0].x_value;
  const maxX=points[points.length-1].x_value;
  const minY=Math.min(...points.map(p=>p.kc_value));
  const maxY=Math.max(...points.map(p=>p.kc_value));
  const spanX=Math.max(maxX-minX,1);
  const spanY=Math.max(maxY-minY,0.1);
  const coords=points.map(p=>{
    const x=40+((p.x_value-minX)/spanX)*520;
    const y=190-((p.kc_value-minY)/spanY)*150;
    return {x,y,p};
  });
  const poly=coords.map(c=>`${c.x},${c.y}`).join(" ");
  return (
    <svg viewBox="0 0 600 230" className="h-56 w-full" role="img" aria-label="Curva linear de Kc">
      <line x1="40" y1="190" x2="565" y2="190" stroke="currentColor" opacity="0.25" />
      <line x1="40" y1="35" x2="40" y2="190" stroke="currentColor" opacity="0.25" />
      <polyline points={poly} fill="none" stroke="currentColor" strokeWidth="3" />
      {coords.map(({x,y,p})=>(
        <g key={p.id}>
          <circle cx={x} cy={y} r="5" fill="currentColor" />
          <text x={x} y={y-10} textAnchor="middle" fontSize="10" fill="currentColor">{p.kc_value.toFixed(2)}</text>
          <text x={x} y="207" textAnchor="middle" fontSize="10" fill="currentColor">{p.x_value}</text>
        </g>
      ))}
      <text x="300" y="225" textAnchor="middle" fontSize="11" fill="currentColor">Eixo da curva</text>
      <text x="12" y="110" textAnchor="middle" fontSize="11" fill="currentColor" transform="rotate(-90 12 110)">Kc</text>
    </svg>
  );
}

export function AgronomicKcTab({
  selectedCultureId,
  onSelectCulture,
  cultures,
}: {
  selectedCultureId: string | null;
  onSelectCulture: (id: string | null) => void;
  cultures: CultureOption[];
}) {
  const supabase=createClient();
  const [cultivars,setCultivars]=useState<CultivarOption[]>([]);
  const [cultivarId,setCultivarId]=useState("");
  const [sources,setSources]=useState<SourceOption[]>([]);
  const [curves,setCurves]=useState<KcCurve[]>([]);
  const [selectedCurveId,setSelectedCurveId]=useState("");
  const [anchors,setAnchors]=useState<Anchor[]>([]);
  const [curveModal,setCurveModal]=useState(false);
  const [editingCurve,setEditingCurve]=useState<KcCurve|null>(null);
  const [anchorModal,setAnchorModal]=useState(false);
  const [editingAnchor,setEditingAnchor]=useState<Anchor|null>(null);
  const [deleteAnchor,setDeleteAnchor]=useState<Anchor|null>(null);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);

  const loadCatalog=useCallback(async()=>{
    if(!selectedCultureId){
      setCultivars([]); setCurves([]); setSelectedCurveId(""); return;
    }
    const [v,s]=await Promise.all([
      supabase.from("culture_varieties").select("id,name").eq("culture_id",selectedCultureId).eq("active",true).order("name"),
      supabase.from("agronomic_sources").select("id,title,institution").eq("active",true).order("created_at",{ascending:false}),
    ]);
    setCultivars((v.data??[]) as CultivarOption[]);
    setSources((s.data??[]) as SourceOption[]);
  },[selectedCultureId,supabase]);

  useEffect(()=>{void loadCatalog();},[loadCatalog]);

  const loadCurves=useCallback(async()=>{
    if(!selectedCultureId){setCurves([]);return;}
    let query=supabase.from("kc_curves").select("*").eq("culture_id",selectedCultureId).order("created_at",{ascending:false});
    query=cultivarId?query.eq("cultivar_id",cultivarId):query.is("cultivar_id",null);
    const {data}=await query;
    const rows=(data??[]) as KcCurve[];
    setCurves(rows);
    setSelectedCurveId((current)=>rows.some(r=>r.id===current)?current:(rows[0]?.id??""));
  },[selectedCultureId,cultivarId,supabase]);

  useEffect(()=>{void loadCurves();},[loadCurves]);

  const loadAnchors=useCallback(async()=>{
    if(!selectedCurveId){setAnchors([]);return;}
    const {data}=await supabase.from("kc_anchor_points").select("*").eq("curve_id",selectedCurveId).order("sequence_no");
    setAnchors((data??[]) as Anchor[]);
  },[selectedCurveId,supabase]);

  useEffect(()=>{void loadAnchors();},[loadAnchors]);

  const sourceLabel=useMemo(()=>Object.fromEntries(sources.map(s=>[s.id,s.title||s.institution||"Fonte"])),[sources]);
  const selectedCurve=curves.find(c=>c.id===selectedCurveId)||null;

  const saveCurve=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(!selectedCultureId)return;
    const fd=new FormData(e.currentTarget);
    const sourceId=String(fd.get("source_id")??"").trim();
    if(!sourceId){setError("Fonte obrigatória.");return;}
    const payload={
      culture_id:selectedCultureId,
      cultivar_id:cultivarId||null,
      curve_name:String(fd.get("curve_name")??"").trim(),
      curve_type:String(fd.get("curve_type")??"bibliographic"),
      axis_type:String(fd.get("axis_type")??"DAE"),
      eto_reference_method:String(fd.get("eto_reference_method")??"").trim()||null,
      source_id:sourceId,
      confidence:String(fd.get("confidence")??"nao_validada"),
      validation_status:String(fd.get("validation_status")??"draft"),
      active_for_calculation:editingCurve?.active_for_calculation??false,
      notes:String(fd.get("notes")??"").trim()||null,
    };
    if(!payload.curve_name){setError("Nome da curva é obrigatório.");return;}
    setSaving(true);setError("");
    const res=editingCurve
      ? await supabase.from("kc_curves").update(payload).eq("id",editingCurve.id)
      : await supabase.from("kc_curves").insert(payload);
    if(res.error){setError(res.error.message);setSaving(false);return;}
    setCurveModal(false);setEditingCurve(null);setSaving(false);await loadCurves();
  };

  const saveAnchor=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(!selectedCurve)return;
    const fd=new FormData(e.currentTarget);
    const x=num(fd.get("x_value"));
    const kc=num(fd.get("kc_value"));
    if(x==null||kc==null){setError("X e Kc são obrigatórios.");return;}
    const payload={
      curve_id:selectedCurve.id,
      sequence_no:num(fd.get("sequence_no"))??anchors.length+1,
      marker_id:null,
      x_value:x,
      kc_value:kc,
      source_id:selectedCurve.source_id,
      confidence:selectedCurve.confidence,
      notes:String(fd.get("notes")??"").trim()||null,
    };
    setSaving(true);setError("");
    const res=editingAnchor
      ? await supabase.from("kc_anchor_points").update(payload).eq("id",editingAnchor.id)
      : await supabase.from("kc_anchor_points").insert(payload);
    if(res.error){setError(res.error.message);setSaving(false);return;}
    setAnchorModal(false);setEditingAnchor(null);setSaving(false);await loadAnchors();
  };

  const removeAnchor=async()=>{
    if(!deleteAnchor)return;
    setSaving(true);
    await supabase.from("kc_anchor_points").delete().eq("id",deleteAnchor.id);
    setDeleteAnchor(null);setSaving(false);await loadAnchors();
  };

  const activate=async()=>{
    if(!selectedCurve||!selectedCultureId)return;
    if(selectedCurve.validation_status!=="approved"){setError("Somente uma curva aprovada pode ser ativada.");return;}
    if(anchors.length<2){setError("A curva precisa de pelo menos dois pontos âncora.");return;}
    setSaving(true);setError("");
    let off=supabase.from("kc_curves").update({active_for_calculation:false}).eq("culture_id",selectedCultureId);
    off=cultivarId?off.eq("cultivar_id",cultivarId):off.is("cultivar_id",null);
    await off;
    const {error:activateError}=await supabase.from("kc_curves").update({active_for_calculation:true,approved_at:new Date().toISOString()}).eq("id",selectedCurve.id);
    if(activateError)setError(activateError.message);
    setSaving(false);await loadCurves();
  };

  const anchorColumns:Column<Anchor>[]=[
    {header:"#",render:r=>r.sequence_no,align:"right"},
    {header:selectedCurve?.axis_type??"X",render:r=>r.x_value,align:"right"},
    {header:"Kc",render:r=>r.kc_value.toFixed(3),align:"right"},
    {header:"Fonte",render:r=>r.source_id?sourceLabel[r.source_id]??"Fonte arquivada":"Herda da curva"},
    {header:"Ações",align:"right",render:r=><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={()=>{setEditingAnchor(r);setAnchorModal(true);setError("");}}>Editar</Button><Button variant="ghost" size="sm" onClick={()=>setDeleteAnchor(r)}>Excluir</Button></div>},
  ];

  const sampleX=anchors.length>=2?(anchors[0].x_value+anchors[anchors.length-1].x_value)/2:null;
  const sampleKc=sampleX!=null?calculateDailyKc(anchors.map(a=>({x:a.x_value,y:a.kc_value})),sampleX):null;

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Select id="kc_culture" name="kc_culture" label="Cultura" options={cultures.map(c=>({value:c.id,label:c.name}))} value={selectedCultureId??""} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>onSelectCulture(e.target.value||null)} />
        <Select id="kc_cultivar" name="kc_cultivar" label="Curva para" options={[{value:"",label:"Referência da cultura"},...cultivars.map(v=>({value:v.id,label:v.name}))]} value={cultivarId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setCultivarId(e.target.value)} disabled={!selectedCultureId}/>
        <div className="flex items-end justify-end"><Button onClick={()=>{setEditingCurve(null);setError("");setCurveModal(true);}} disabled={!selectedCultureId}>Nova curva Kc</Button></div>
      </div>

      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
        Kc representa a demanda potencial da cultura. <strong>Ks não altera esta curva.</strong> Entre os pontos âncora, o cálculo é linear por trechos; pontos consecutivos com o mesmo Kc formam um patamar contínuo, sem degrau.
      </div>

      {curves.length===0?(
        <Card><p className="py-8 text-center text-sm text-graphite-400">Nenhuma curva cadastrada. Nenhum Kc será inventado automaticamente.</p></Card>
      ):(
        <>
          <Card className="mb-4">
            <div className="grid gap-4 p-1 sm:grid-cols-[1fr_auto]">
              <Select id="kc_curve" name="kc_curve" label="Curva" options={curves.map(c=>({value:c.id,label:`${c.curve_name} · v${c.version}${c.active_for_calculation?" · ATIVA":""}`}))} value={selectedCurveId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setSelectedCurveId(e.target.value)} />
              <div className="flex items-end gap-2">
                <Button variant="secondary" onClick={()=>{if(selectedCurve){setEditingCurve(selectedCurve);setError("");setCurveModal(true);}}}>Editar curva</Button>
                <Button onClick={activate} disabled={!selectedCurve||saving||selectedCurve.active_for_calculation}>{selectedCurve?.active_for_calculation?"Curva ativa":"Ativar para cálculo"}</Button>
              </div>
            </div>
            {selectedCurve&&(
              <div className="mt-4 grid gap-2 text-xs text-graphite-500 sm:grid-cols-4">
                <span>Tipo: {selectedCurve.curve_type}</span>
                <span>Eixo: {selectedCurve.axis_type}</span>
                <span>Fonte: {selectedCurve.source_id?sourceLabel[selectedCurve.source_id]??"Arquivada":"—"}</span>
                <span>Confiança: {selectedCurve.confidence} · {selectedCurve.validation_status}</span>
              </div>
            )}
          </Card>

          {selectedCurve&&(
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <div><h3 className="font-semibold text-graphite-900 dark:text-white">Curva linear por trechos</h3><p className="text-xs text-graphite-400">{selectedCurve.axis_type} × Kc</p></div>
                  <Button size="sm" onClick={()=>{setEditingAnchor(null);setError("");setAnchorModal(true);}}>Adicionar ponto</Button>
                </div>
                <CurveSvg anchors={anchors}/>
                {sampleX!=null&&sampleKc!=null&&<p className="text-center text-xs text-graphite-400">Teste de interpolação: X {sampleX.toFixed(1)} → Kc {sampleKc.toFixed(3)}</p>}
              </Card>
              <Card>
                {anchors.length? <Table columns={anchorColumns} data={anchors} getKey={r=>r.id}/>:<p className="py-8 text-center text-sm text-graphite-400">Sem pontos âncora.</p>}
              </Card>
            </div>
          )}
        </>
      )}

      {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <Modal open={curveModal} onClose={()=>{setCurveModal(false);setEditingCurve(null);setError("");}} title={editingCurve?"Editar curva Kc":"Nova curva Kc"} size="lg">
        <form onSubmit={saveCurve} className="space-y-5">
          <Input id="curve_name" name="curve_name" label="Nome da curva" required defaultValue={editingCurve?.curve_name??""}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select id="curve_type" name="curve_type" label="Tipo" options={CURVE_TYPES} required defaultValue={editingCurve?.curve_type??"bibliographic"}/>
            <Select id="axis_type" name="axis_type" label="Eixo principal" options={AXES} required defaultValue={editingCurve?.axis_type??"DAE"}/>
            <Input id="eto_reference_method" name="eto_reference_method" label="Método ETo compatível" placeholder="Ex.: FAO56_PENMAN_MONTEITH_GRASS" defaultValue={editingCurve?.eto_reference_method??""}/>
            <Select id="source_id" name="source_id" label="Fonte" options={[{value:"",label:"Selecione"},...sources.map(s=>({value:s.id,label:s.title||s.institution||"Fonte"}))]} required defaultValue={editingCurve?.source_id??""}/>
            <Select id="confidence" name="confidence" label="Confiabilidade" options={CONFIDENCE} required defaultValue={editingCurve?.confidence??"nao_validada"}/>
            <Select id="validation_status" name="validation_status" label="Validação" options={VALIDATION} required defaultValue={editingCurve?.validation_status??"draft"}/>
          </div>
          <TextArea id="notes" name="notes" label="Observações" defaultValue={editingCurve?.notes??""}/>
          {error&&<p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={()=>setCurveModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar curva</Button></div>
        </form>
      </Modal>

      <Modal open={anchorModal} onClose={()=>{setAnchorModal(false);setEditingAnchor(null);setError("");}} title={editingAnchor?"Editar ponto Kc":"Novo ponto Kc"}>
        <form onSubmit={saveAnchor} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input id="sequence_no" name="sequence_no" label="Ordem" type="number" min="1" required defaultValue={editingAnchor?.sequence_no??anchors.length+1}/>
            <Input id="x_value" name="x_value" label={selectedCurve?.axis_type??"X"} type="number" step="0.01" required defaultValue={editingAnchor?.x_value??""}/>
            <Input id="kc_value" name="kc_value" label="Kc" type="number" min="0" max="2.5" step="0.001" required defaultValue={editingAnchor?.kc_value??""}/>
          </div>
          <TextArea id="notes" name="notes" label="Observações do ponto" defaultValue={editingAnchor?.notes??""}/>
          <p className="text-xs text-graphite-400">O ponto herda a fonte e a confiabilidade da curva, salvo quando futuramente for vinculada uma fonte específica.</p>
          {error&&<p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={()=>setAnchorModal(false)}>Cancelar</Button><Button type="submit" disabled={saving}>Salvar ponto</Button></div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteAnchor} onClose={()=>setDeleteAnchor(null)} onConfirm={removeAnchor} title="Excluir ponto Kc" message="Excluir este ponto âncora? A curva será recalculada entre os pontos restantes." confirmLabel="Excluir" loading={saving}/>
    </>
  );
}
