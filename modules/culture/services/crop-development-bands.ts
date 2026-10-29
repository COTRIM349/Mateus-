import type { CulturePhase } from "./culture.service";

export interface CropDevelopmentBand {
  key: string;
  label: string;
  start: number;
  end: number;
  fill: string;
  stripe: string;
  text: string;
}

/** Retorna apenas fases reais cadastradas, convertendo DAP → DAE. Não interpola estádios V/R. */
export function buildCropDevelopmentBands(phases: CulturePhase[], daeOffsetFromPlanting: number): CropDevelopmentBand[] {
  const offset = Number.isFinite(daeOffsetFromPlanting) ? Math.max(0, daeOffsetFromPlanting) : 0;
  return [...phases]
    .sort((a,b) => a.phase_order-b.phase_order)
    .flatMap((phase,index) => {
      const startDap = Number(phase.days_after_plant);
      const duration = Number(phase.duration_days);
      if (!Number.isFinite(startDap) || !Number.isFinite(duration) || duration<=0) return [];
      const start=Math.max(0,startDap-offset);
      const end=Math.max(0,startDap+duration-offset);
      if(end<=start)return [];
      const plain=(phase.phase_key ?? phase.name ?? "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      const palette = plain.includes("matur")||plain.includes("final")||plain.includes("colheit")
        ? {fill:"#fce7e7",stripe:"#fda4a4",text:"#9f1239"}
        : plain.includes("enchim")||plain.includes("graos")||plain.includes("medio")
        ? {fill:"#ffedd5",stripe:"#fdba74",text:"#9a3412"}
        : plain.includes("vagen")||plain.includes("maca")
        ? {fill:"#ffedd5",stripe:"#fdba74",text:"#9a3412"}
        : plain.includes("flores")||plain.includes("florac")||plain.includes("boto")
        ? {fill:"#fef9c3",stripe:"#fde047",text:"#854d0e"}
        : plain.includes("veget")||plain.includes("desenvolv")
        ? {fill:"#ccfbf1",stripe:"#5eead4",text:"#115e59"}
        : {fill:"#dcfce7",stripe:"#86efac",text:"#166534"};
      return [{key:(phase.phase_key??phase.name??"fase")+"-"+index,label:phase.name,
        start,end,...palette}];
    });
}

/** Evita inferir que um Rn ou Vn foi observado somente pela idade/macro fase. */
export function cropDevelopmentStageLabel(
  stageCode: string | null | undefined,
  phaseName: string | null | undefined,
) {
  return stageCode ?? (phaseName?.trim() || "Não definido");
}
