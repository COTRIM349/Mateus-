import { describe,it,expect } from "vitest";
import { buildCropDevelopmentBands,cropDevelopmentStageLabel } from "./crop-development-bands";
import type { CulturePhase } from "./culture.service";
const phase=(name:string,phase_order:number,days_after_plant:number,duration_days:number,phase_key?:string)=>({
  name,phase_order,days_after_plant,duration_days,phase_key,kc_start:.4,kc_end:1.15,
  root_depth_start:.1,root_depth_end:.6,depletion_factor:.5,
}) as CulturePhase;
describe("faixas macrofenológicas ancoradas no cadastro",()=>{
 it("desenha o ciclo mesmo sem DAE individuais VE/VC/V1/R1",()=>{
  const bands=buildCropDevelopmentBands([phase("Inicial",1,0,20),phase("Desenvolvimento",2,20,30),
    phase("Médio (floração/enchimento)",3,50,40),phase("Final (maturação)",4,90,30)],0);
  expect(bands.map(x=>[x.start,x.end])).toEqual([[0,20],[20,50],[50,90],[90,120]]);
  expect(bands.every(x=>x.fill.length>0&&x.label.length>0)).toBe(true);
 });
 it("converte o calendário de fases de DAP para DAE, sem inventar marcadores",()=>{
  const bands=buildCropDevelopmentBands([phase("Emergência",1,0,10),phase("Vegetativo",2,10,25)],5);
  expect(bands.map(x=>[x.start,x.end])).toEqual([[0,5],[5,30]]);
 });
 it("respeita durações cadastrais e não atribui estádios que faltam",()=>{
  expect(buildCropDevelopmentBands([phase("R1",1,0,-3)],0)).toEqual([]);
  expect(cropDevelopmentStageLabel(null,"Formação de vagens")).toBe("Formação de vagens");
  expect(cropDevelopmentStageLabel("R3","Formação de vagens")).toBe("R3");
 });
});
