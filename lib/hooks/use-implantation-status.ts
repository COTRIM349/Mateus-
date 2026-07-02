"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers";

export interface ImplantationStep {
  key: string;
  order: number;
  label: string;
  description: string;
  href: string;
  /** true when this step's prerequisite data exists */
  done: boolean;
  /** number of registered records for this step (in the active farm scope) */
  count: number;
  /** foundation steps are required for the operational MVP (Fase 1) */
  foundation: boolean;
}

interface ImplantationStatus {
  steps: ImplantationStep[];
  /** foundation steps only */
  foundationSteps: ImplantationStep[];
  /** true when every foundation step is complete */
  foundationComplete: boolean;
  /** the next incomplete foundation step, or null when all done */
  nextStep: ImplantationStep | null;
  /** 0-100 completion percentage of the foundation */
  progress: number;
  loading: boolean;
  refresh: () => void;
}

/**
 * Measures how far along the operational implantation of the active farm is.
 * Powers the guided onboarding flow (Fase 1.1) and per-screen prerequisite
 * validation (Fase 1.2). Counts are scoped to the active farm / company via RLS.
 */
export function useImplantationStatus(): ImplantationStatus {
  const { profile, activeFarmId, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const companyId = profile?.companyId ?? null;

  const load = useCallback(async () => {
    setLoading(true);

    const countTable = async (
      table: string,
      column: string,
      value: string,
    ): Promise<number> => {
      const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(column, value)
        .eq("active", true);
      return count ?? 0;
    };

    const countGlobal = async (table: string): Promise<number> => {
      const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("active", true);
      return count ?? 0;
    };

    const result: Record<string, number> = {
      farm: 0,
      soil: 0,
      culture: 0,
      season: 0,
      pivot: 0,
    };

    if (companyId) {
      result.farm = await countTable("farms", "company_id", companyId);
      result.culture = await countGlobal("cultures");
    }

    if (activeFarmId) {
      result.soil = await countTable("soils", "farm_id", activeFarmId);
      result.season = await countTable("seasons", "farm_id", activeFarmId);
      result.pivot = await countTable("pivots", "farm_id", activeFarmId);
    }

    setCounts(result);
    setLoading(false);
  }, [supabase, companyId, activeFarmId]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const steps: ImplantationStep[] = [
    {
      key: "farm",
      order: 1,
      label: "Fazenda",
      description: "Cadastre a fazenda com localização e área. É a base de todos os dados.",
      href: "/fazendas",
      done: (counts.farm ?? 0) > 0,
      count: counts.farm ?? 0,
      foundation: true,
    },
    {
      key: "soil",
      order: 2,
      label: "Solo",
      description: "Defina o perfil de solo (capacidade de campo, ponto de murcha, profundidade).",
      href: "/solos",
      done: (counts.soil ?? 0) > 0,
      count: counts.soil ?? 0,
      foundation: true,
    },
    {
      key: "culture",
      order: 3,
      label: "Cultura",
      description: "Selecione ou personalize as culturas com suas fases fenológicas (Kc).",
      href: "/culturas",
      done: (counts.culture ?? 0) > 0,
      count: counts.culture ?? 0,
      foundation: true,
    },
    {
      key: "season",
      order: 4,
      label: "Safra",
      description: "Crie a safra atual definindo o período de plantio e colheita.",
      href: "/fazendas",
      done: (counts.season ?? 0) > 0,
      count: counts.season ?? 0,
      foundation: true,
    },
    {
      key: "pivot",
      order: 5,
      label: "Pivô",
      description: "Cadastre os pivôs com área, vazão, potência e coordenadas.",
      href: "/pivos",
      done: (counts.pivot ?? 0) > 0,
      count: counts.pivot ?? 0,
      foundation: true,
    },
  ];

  const foundationSteps = steps.filter((s) => s.foundation);
  const doneCount = foundationSteps.filter((s) => s.done).length;
  const foundationComplete = doneCount === foundationSteps.length;
  const nextStep = foundationSteps.find((s) => !s.done) ?? null;
  const progress = foundationSteps.length > 0
    ? Math.round((doneCount / foundationSteps.length) * 100)
    : 0;

  return {
    steps,
    foundationSteps,
    foundationComplete,
    nextStep,
    progress,
    loading: authLoading || loading,
    refresh: load,
  };
}
