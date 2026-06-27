/**
 * Dados fictícios dos pivôs centrais.
 *
 * Cada pivô possui seus parâmetros operacionais reais.
 * Os indicadores derivados (volume, energia, custo, prioridade, risco) são
 * calculados pelos services — NÃO são hard-coded.
 */

import type { PivotIrrigationRecommendation } from "@/types/domain/pivot";
import {
  calculateIrrigation,
  calculateVolume,
  calculateIrrigationTime,
  calculatePriority,
  calculateProductiveRisk,
} from "@/modules/irrigation/services";
import { calculateEnergy, calculateEnergyCost } from "@/modules/energy/services";

interface RawPivot {
  id: string;
  nome: string;
  modulo: string;
  cultura: string;
  fase: string;
  area: number;
  deficit: number;
  vazao: number;
  potenciaBomba: number;
  eficiencia: number;
  status: "irrigando" | "parado" | "manutencao" | "alerta";
  /** AFD simulada para cálculo de prioridade e risco. */
  afd: number;
}

const TARIFA_MOCK = 0.72;
const MOTOR_EFFICIENCY = 0.88;

const rawPivots: RawPivot[] = [
  { id: "P14",  nome: "Pivô 14",  modulo: "RDM",   cultura: "Soja",    fase: "floracao",     area: 92,  deficit: 18.4, vazao: 120, potenciaBomba: 150, eficiencia: 0.85, status: "irrigando",  afd: 22 },
  { id: "P126", nome: "Pivô 126", modulo: "M1",    cultura: "Milho",   fase: "enchimento",   area: 110, deficit: 17.1, vazao: 130, potenciaBomba: 175, eficiencia: 0.82, status: "irrigando",  afd: 21 },
  { id: "P31",  nome: "Pivô 31",  modulo: "M2/M3", cultura: "Algodão", fase: "vegetativo",   area: 88,  deficit: 15.9, vazao: 110, potenciaBomba: 125, eficiencia: 0.84, status: "alerta",     afd: 20 },
  { id: "P58",  nome: "Pivô 58",  modulo: "M1",    cultura: "Soja",    fase: "vegetativo",   area: 76,  deficit: 9.7,  vazao: 105, potenciaBomba: 100, eficiencia: 0.86, status: "irrigando",  afd: 24 },
  { id: "P77",  nome: "Pivô 77",  modulo: "RDM",   cultura: "Milho",   fase: "floracao",     area: 64,  deficit: 11.2, vazao: 95,  potenciaBomba: 100, eficiencia: 0.85, status: "irrigando",  afd: 20 },
  { id: "P89",  nome: "Pivô 89",  modulo: "M2/M3", cultura: "Cacau",   fase: "vegetativo",   area: 41,  deficit: 7.4,  vazao: 70,  potenciaBomba: 60,  eficiencia: 0.88, status: "irrigando",  afd: 30 },
  { id: "P102", nome: "Pivô 102", modulo: "M1",    cultura: "Algodão", fase: "maturacao",    area: 95,  deficit: 6.1,  vazao: 115, potenciaBomba: 130, eficiencia: 0.83, status: "parado",     afd: 28 },
  { id: "P109", nome: "Pivô 109", modulo: "RDM",   cultura: "Soja",    fase: "maturacao",    area: 70,  deficit: 3.8,  vazao: 100, potenciaBomba: 90,  eficiencia: 0.87, status: "parado",     afd: 26 },
  { id: "P133", nome: "Pivô 133", modulo: "M2/M3", cultura: "Cacau",   fase: "vegetativo",   area: 38,  deficit: 8.9,  vazao: 65,  potenciaBomba: 55,  eficiencia: 0.88, status: "manutencao", afd: 30 },
  { id: "P140", nome: "Pivô 140", modulo: "M1",    cultura: "Milho",   fase: "vegetativo",   area: 83,  deficit: 5.2,  vazao: 110, potenciaBomba: 110, eficiencia: 0.85, status: "parado",     afd: 25 },
];

function buildRecommendation(raw: RawPivot): PivotIrrigationRecommendation {
  const recommendedDepth = calculateIrrigation(raw.deficit, raw.eficiencia);
  const volume = calculateVolume(recommendedDepth, raw.area);
  const irrigationTime = calculateIrrigationTime(volume, raw.vazao);
  const energy = calculateEnergy({
    pumpPower: raw.potenciaBomba,
    irrigationTime,
    tariffRate: TARIFA_MOCK,
    motorEfficiency: MOTOR_EFFICIENCY,
  });
  const cost = calculateEnergyCost(energy, TARIFA_MOCK);
  const priority = calculatePriority(raw.deficit, raw.afd);
  const productiveRisk = calculateProductiveRisk(raw.deficit, raw.afd, raw.fase);

  return {
    pivotId: raw.id,
    pivotName: raw.nome,
    moduleName: raw.modulo,
    cultureName: raw.cultura,
    cropStage: raw.fase,
    area: raw.area,
    deficit: raw.deficit,
    recommendedDepth,
    irrigationTime,
    volume,
    energy,
    cost,
    priority,
    status: raw.status,
    productiveRisk,
  };
}

export const mockRecommendations: PivotIrrigationRecommendation[] =
  rawPivots.map(buildRecommendation);

export const mockCultures = ["Soja", "Milho", "Algodão", "Cacau"] as const;
export const mockModules = ["RDM", "M1", "M2/M3"] as const;
