import { describe, it, expect } from "vitest";
import { buildDevelopmentAudit } from "./crop-development-view";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";
const row=(dae:number,kc:number,rootDepth=.2,rootDepthEstimated=.25)=>({
 date:"2026-10-"+String(dae+10).padStart(2,"0"),dae,kc,rootDepth,rootDepthEstimated
}) as DailyBalanceRow;
const marker=(code:string,dae:number,origin:"esperado"|"calibrado"="esperado")=>({code,dae,origin,label:code});
describe("desenvolvimento de soja por estádio",()=>{
 it("mostra VE, VC, V1, V2 sem atribuir DAE fictício a estádios ausentes",()=>{
  const result=buildDevelopmentAudit({isSoy:true,currentDae:13,markers:[marker("VE",0),marker("VC",3),marker("V1",8)],rows:[row(13,.4)],kcCurve:[{x:0,y:.4},{x:20,y:.4}]});
  expect(result.currentStage?.code).toBe("V1");
  expect(result.stages.find(s=>s.code==="V2")?.dae).toBeNull();
  expect(result.stages.find(s=>s.code==="V2")?.reached).toBe(false);
 });
 it("usa a última etapa calibrada alcançada e não confunde R3 futuro com atual",()=>{
  const result=buildDevelopmentAudit({isSoy:true,currentDae:55,markers:[marker("R1",42,"calibrado"),marker("R2",50),marker("R3",61)],rows:[row(55,1.15,.6,1.1)],kcCurve:[{x:0,y:.4},{x:43,y:1.15}]});
  expect(result.currentStage?.code).toBe("R2");
  expect(result.stageOrigin).toBe("esperado");
  expect(result.stages.find(x=>x.code==="R3")?.reached).toBe(false);
  expect(result.checkedKcDays).toBe(1);
 });
 it("aponta divergência de Kc real versus curva ativa e raiz fisicamente inconsistente",()=>{
  const result=buildDevelopmentAudit({isSoy:true,currentDae:20,markers:[],rows:[row(20,1.1,.8,.4)],kcCurve:[{x:0,y:.4},{x:20,y:.6}]});
  expect(result.issues.some(s=>s.includes("Kc registrado difere"))).toBe(true);
  expect(result.issues.some(s=>s.includes("Raiz efetiva supera"))).toBe(true);
 });
 it("não inventa estádio quando não há marcadores cadastrados",()=>{
  const result=buildDevelopmentAudit({isSoy:true,currentDae:55,markers:[],rows:[row(55,1.15)],kcCurve:null});
  expect(result.currentStage).toBeNull();
  expect(result.stageOrigin).toBe("não cadastrado");
 });
});
