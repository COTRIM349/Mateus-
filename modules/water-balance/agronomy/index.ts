export { ENGINE_VERSION, formatTraced, isPresent, missingValue, traced } from "./trace";
export type { DataKind, MoistureUnit, TraceableValue } from "./trace";
export { MOISTURE_UNIT_LABEL } from "./trace";

export { calculateDtaMmPerCm, DTA_FORMULA } from "./dta";
export { calculateRootZoneStorage, CTA_FORMULA, CRA_FORMULA } from "./root-zone";
export type { AgronomicLayerInput, LayerStorageResult, RootZoneStorage } from "./root-zone";

export { calculateKsFromDr, interpretKs, KS_FORMULA_NO_STRESS, KS_FORMULA_STRESS } from "./ks";
export { calculateAdjustedFd, FD_AUTO_FORMULA, FD_LIMITS } from "./fd";
export type { FdAdjustment, FdMode } from "./fd";

export {
  applyDepletionStep,
  armFromDr,
  initialDrFromMoisture,
  DR_FORMULA,
} from "./depletion";
export type { DepletionStepResult } from "./depletion";

export { calculateIrrigationRequirement } from "./irrigation";
export type { IrrigationRequirement } from "./irrigation";

export {
  AGRONOMIC_STATUS_CONFIG,
  AGRONOMIC_STATUS_THRESHOLDS,
  classifyAgronomicStatus,
  irrigationPriority,
} from "./status";
export type { AgronomicStatus, IrrigationPriority } from "./status";

export { estimateDaysToCra, projectWaterBalance } from "./projection";
export type { DaysToCraResult, ProjectionDayInput, ProjectionDayResult } from "./projection";
