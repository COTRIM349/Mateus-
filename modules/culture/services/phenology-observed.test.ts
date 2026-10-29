import {describe,expect,it} from "vitest";
import { activeFieldObservation,compareStageCodes,daeForFieldObservation } from "./phenology-observed";
import type {PhenologyFieldObservation,PhenologyStageOption} from "./phenology-observed";
const stages:PhenologyStageOption[]=[
 {id:"r2",code:"R2",name:"Florescimento pleno",order:4},
 {id:"r1",code:"R1",name:"Início do florescimento",order:3},
 {id:"v2",code:"V2",name:"Segundo nó",order:12},
];
const observation=(stage:string,date:string,quality="campo"):PhenologyFieldObservation=>({
 id:stage+date,marker_id:stage,observed_date:date,dae:55,quality,notes:null
});
describe("faixa fenológica editável",()=>{
 it("ordena VE VC V1 V2 e R1/R2 por desenvolvimento, não marker_order antigo",()=>{
  expect(["R2","V2","R1","VC","VE"].sort(compareStageCodes)).toEqual(["VE","VC","V2","R1","R2"]);
 });
 it("confirma R1 observado até hoje sem antecipar R2",()=>{
  const active=activeFieldObservation([observation("r1","2026-10-29")],stages,"2026-10-29");
  expect(active?.stage.code).toBe("R1");
  expect(active?.observation.observed_date).toBe("2026-10-29");
 });
 it("prioriza o último registro real e ignora observação futura ou descartada",()=>{
  const obs=[
   observation("v2","2026-10-21"),observation("r1","2026-10-27"),
   observation("r2","2026-10-31"),observation("r2","2026-10-28","descartada"),
  ];
  expect(activeFieldObservation(obs,stages,"2026-10-29")?.stage.code).toBe("R1");
 });
 it("converte uma edição histórica sem alterar DAE do motor",()=>{
  expect(daeForFieldObservation("2026-10-29",55,"2026-10-27")).toBe(53);
  expect(daeForFieldObservation("2026-10-29",55,"2026-10-30")).toBeNull();
  expect(daeForFieldObservation("2026-10-29",5,"2026-10-19")).toBeNull();
 });
});
