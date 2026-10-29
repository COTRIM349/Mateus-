"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  activeFieldObservation, compareStageCodes, daeForFieldObservation,
  type PhenologyFieldObservation, type PhenologyStageOption,
} from "@/modules/culture/services/phenology-observed";

export interface PhenologyObservationContext {
  farmId:string;
  assignmentId:string;
  cultureId:string;
  varietyId:string|null;
}

export function PhenologyStageEditor({
  context,stages,observations,today,todayDae,onSaved,
}:{
  context:PhenologyObservationContext|null;
  stages:PhenologyStageOption[];
  observations:PhenologyFieldObservation[];
  today:string;
  todayDae:number;
  onSaved:(saved:PhenologyFieldObservation)=>void;
}) {
  const [editing,setEditing]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [markerId,setMarkerId]=useState("");
  const [date,setDate]=useState(today);
  const [notes,setNotes]=useState("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const current=activeFieldObservation(observations,stages,today);
  const list=[...stages].sort((a,b)=>compareStageCodes(a.code,b.code));
  const showNew=()=>{
    setEditing(true);setEditingId(null);setMarkerId("");setDate(today);setNotes("");
    setError("");setSuccess("");
  };
  const editLatest=()=>{
    if(!current)return;
    setEditing(true);setEditingId(current.observation.id);
    setMarkerId(current.observation.marker_id);
    setDate(current.observation.observed_date);
    setNotes(current.observation.notes??"");
    setError("");setSuccess("");
  };
  async function save(){
    if(!context||!markerId||!date||saving)return;
    const observedDae=daeForFieldObservation(today,todayDae,date);
    if(observedDae==null){
      setError("Data inválida: escolha uma data entre a emergência e o último dia do balanço.");return;
    }
    if(!stages.some(stage=>stage.id===markerId)){
      setError("O estádio selecionado não pertence à cultura desta parcela.");return;
    }
    setSaving(true);setError("");
    try {
      const supabase=createClient();
      const updateFields={
        marker_id:markerId,observed_date:date,dae:observedDae,
        quality:"campo" as const,notes:notes.trim()||null,
      };
      const query=editingId
        ? supabase.from("phenology_observations").update(updateFields)
            .eq("id",editingId).eq("farm_id",context.farmId)
            .eq("pivot_crop_assignment_id",context.assignmentId)
        : supabase.from("phenology_observations").insert({
            ...updateFields,farm_id:context.farmId,
            pivot_crop_assignment_id:context.assignmentId,culture_id:context.cultureId,
            variety_id:context.varietyId,
          });
      const {data,error:dbError}=await query
        .select("id,marker_id,observed_date,dae,quality,notes").single();
      if(dbError||!data)throw new Error(
        dbError?.code==="23505"
          ? "Este estádio já foi registrado nesta data. Use Editar último registro para corrigir."
          : dbError?.message??"Não foi possível salvar a observação."
      );
      onSaved(data as PhenologyFieldObservation);
      setEditing(false);setEditingId(null);setSuccess("Estádio observado salvo para esta parcela.");
    }catch(e){
      setError(e instanceof Error?e.message:"Falha ao registrar estádio.");
    }finally{setSaving(false);}
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 dark:border-emerald-500/25 dark:bg-emerald-950/15">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-extrabold text-slate-900 dark:text-white">
            Estádio fenológico observado em campo
          </p>
          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
            {current
              ? current.stage.code+" · "+current.stage.name+" · "+current.observation.observed_date.split("-").reverse().join("/")+
                " · confirmado manualmente"
              : "Ainda não há estádio observado registrado para esta parcela."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {current&&<button type="button" onClick={editLatest} disabled={!context}
            className="rounded-lg border border-emerald-300 px-3 py-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-700 dark:text-emerald-200">
            Corrigir último registro
          </button>}
          <button type="button" onClick={editing?()=>setEditing(false):showNew}
            disabled={!context||list.length===0}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-40">
            {editing?"Fechar edição":"+ Registrar estádio observado"}
          </button>
        </div>
      </div>
      {success&&<p role="status" className="mt-2 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">{success}</p>}
      {editing&&(
        <div className="mt-3 grid gap-3 border-t border-emerald-200 pt-3 sm:grid-cols-[1.2fr_.75fr_1.4fr_auto] sm:items-end dark:border-emerald-700/40">
          <label className="block text-[11px] font-semibold text-slate-800 dark:text-slate-200">
            Estádio identificado na lavoura
            <select aria-label="Estádio fenológico observado" value={markerId} onChange={e=>setMarkerId(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-900 dark:border-white/20 dark:bg-[#112631] dark:text-white">
              <option value="">Selecionar estádio (ex.: R1 ou R2)</option>
              {list.map(s=><option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-slate-800 dark:text-slate-200">
            Data da observação
            <input aria-label="Data do estádio observado" type="date" value={date} max={today}
              onChange={e=>setDate(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-900 dark:border-white/20 dark:bg-[#112631] dark:text-white"/>
          </label>
          <label className="block text-[11px] font-semibold text-slate-800 dark:text-slate-200">
            Observação de campo (opcional)
            <input aria-label="Nota fenológica" value={notes} maxLength={240} onChange={e=>setNotes(e.target.value)}
              placeholder="Ex.: primeiras flores visíveis no terço superior"
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-900 placeholder:text-slate-400 dark:border-white/20 dark:bg-[#112631] dark:text-white"/>
          </label>
          <button type="button" onClick={save} disabled={!markerId||saving}
            className="h-10 whitespace-nowrap rounded-lg bg-emerald-700 px-4 text-[12px] font-bold text-white hover:bg-emerald-600 disabled:opacity-40">
            {saving?"Salvando…":"Salvar estágio"}
          </button>
          {error&&<p role="alert" className="text-[11px] font-semibold text-red-600 sm:col-span-4 dark:text-red-300">{error}</p>}
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        Um estádio confirmado altera a identificação visual do desenvolvimento, não a curva Kc,
        a profundidade radicular, os graus-dia ou o balanço hídrico.
        R1 indica início do florescimento; R2 indica florescimento pleno.
      </p>
    </div>
  );
}
