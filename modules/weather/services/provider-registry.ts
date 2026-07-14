// ============================================================================
// Registry de provedores climáticos
// ----------------------------------------------------------------------------
// Registra por `data_source` os handlers de ingestão. Adicionar um novo
// provedor (ex.: BR-DWGD, INMET, Davis) é registrar uma entrada aqui — o
// orquestrador `ingestFarmClimate` não precisa mudar.
//
// Cada provedor declara:
//  - dataKind:            que categoria de dado ele grava em weather_readings
//                         ('observed' para APIs em tempo real; 'historical_grid'
//                         para bancos gridados históricos como BR-DWGD).
//  - ingestObservations:  função que grava observações para uma estação.
//  - ingestForecast:      opcional — nem todo provedor tem forecast.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPEN_METEO_PROVIDER,
} from "@/modules/weather/providers/open-meteo";
import {
  METEOBLUE_PROVIDER,
  METEOBLUE_ATTRIBUTION,
} from "@/modules/weather/providers/meteoblue";
import {
  ingestOpenMeteoObservations,
  ingestOpenMeteoForecast,
  type IngestionStation,
  type ObservationIngestionResult,
} from "./ingestion.service";
import {
  ingestMeteoblueObservations,
  ingestMeteoblueForecast,
} from "./meteoblue-ingest";

export type ClimateDataKind = "observed" | "historical_grid";

export interface ClimateProvider {
  /** Chave que casa com weather_stations.data_source. */
  key: string;
  /** Categoria de dado gravado em weather_readings.data_kind. */
  dataKind: ClimateDataKind;
  /** Atribuição/licença legível para UI. */
  attribution: string;
  /** Ingestão de observações recentes/atuais. */
  ingestObservations: (
    supabase: SupabaseClient,
    station: IngestionStation,
    pastDays: number,
  ) => Promise<ObservationIngestionResult>;
  /** Opcional: ingestão de previsão. Ausente se o provedor não oferece forecast. */
  ingestForecast?: (
    supabase: SupabaseClient,
    station: IngestionStation,
    days: number,
  ) => Promise<{ rowsInserted: number; rowsUpdated: number; errorMessage: string | null }>;
}

// Registry mutável: novos provedores se registram no boot.
const REGISTRY = new Map<string, ClimateProvider>();

export function registerProvider(p: ClimateProvider): void {
  REGISTRY.set(p.key, p);
}

export function getProvider(key: string): ClimateProvider | undefined {
  return REGISTRY.get(key);
}

export function listProviderKeys(): string[] {
  return Array.from(REGISTRY.keys());
}

// ── Registro dos provedores conhecidos ───────────────────────────────────────

registerProvider({
  key: OPEN_METEO_PROVIDER,
  dataKind: "observed",
  attribution: "Weather data by Open-Meteo.com (CC-BY 4.0)",
  ingestObservations: ingestOpenMeteoObservations,
  ingestForecast: ingestOpenMeteoForecast,
});

registerProvider({
  key: METEOBLUE_PROVIDER,
  dataKind: "observed",
  attribution: METEOBLUE_ATTRIBUTION,
  ingestObservations: ingestMeteoblueObservations,
  ingestForecast: ingestMeteoblueForecast,
});

// Sprint 5.3 registrará aqui:
//   { key: "br_dwgd", dataKind: "historical_grid",
//     attribution: "BR-DWGD — Xavier, A. et al. (UFES)",
//     ingestObservations: ingestBrDwgdObservations }
// ...sem tocar em ingestFarmClimate.
