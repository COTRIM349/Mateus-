"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_FARM_TIMEZONE,
  buildOperationalFarmAccess,
  selectInitialFarmId,
  type FarmAccess,
  type FarmAccessRow,
} from "./farm-access";
import type { User } from "@supabase/supabase-js";

interface UserProfile {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "operator" | "viewer";
}


interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  farms: FarmAccess[];
  activeFarmId: string | null;
  activeFarmTimezone: string;
  loading: boolean;
  setActiveFarm: (farmId: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  farms: [],
  activeFarmId: null,
  activeFarmTimezone: DEFAULT_FARM_TIMEZONE,
  loading: true,
  setActiveFarm: () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Timeout duro para não travar a tela global de "Carregando..." se o
// Supabase demorar demais.
const BOOT_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout ${label} > ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function stepTiming(label: string, startedAt: number) {
  const dur = Math.round(performance.now() - startedAt);
  // eslint-disable-next-line no-console
  console.debug(`[boot] ${label}: ${dur} ms`);
  return dur;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [farms, setFarms] = useState<FarmAccess[]>([]);
  const [activeFarmId, setActiveFarmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [supabase] = useState(() => createClient());

  const loadProfile = useCallback(
    async (userId: string): Promise<void> => {
      const started = performance.now();
      const [profileRes, farmRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, company_id, name, email, role, companies(name)")
          .eq("id", userId)
          .single(),
        supabase
          .from("user_farm_access")
          .select("farm_id, is_default, farms(id, name, timezone, active, latitude, longitude)")
          .eq("user_id", userId),
      ]);

      const profileData = profileRes.data;
      if (profileData) {
        const company = profileData.companies as unknown as { name: string } | null;
        setProfile({
          id: profileData.id,
          companyId: profileData.company_id,
          companyName: company?.name ?? "",
          name: profileData.name,
          email: profileData.email,
          role: profileData.role as UserProfile["role"],
        });
      }

      const farmData = farmRes.data;
      if (farmData) {
        // Defesa em profundidade: acesso cadastrado não torna uma fazenda
        // automaticamente apta ao manejo. Apenas fazendas ativas e com
        // coordenadas geográficas válidas entram no contexto operacional.
        const accessList = buildOperationalFarmAccess(
          farmData as unknown as FarmAccessRow[],
        );
        setFarms(accessList);

        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem("cotrim_active_farm")
            : null;
        const selectedFarmId = selectInitialFarmId(accessList, stored);
        setActiveFarmId(selectedFarmId);

        if (typeof window !== "undefined") {
          if (selectedFarmId) {
            localStorage.setItem("cotrim_active_farm", selectedFarmId);
          } else {
            localStorage.removeItem("cotrim_active_farm");
          }
        }
      }

      stepTiming("loadProfile", started);
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const bootStart = performance.now();
      try {
        const t0 = performance.now();
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), BOOT_TIMEOUT_MS, "restoreSession");
        stepTiming("restoreSession", t0);
        if (cancelled) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          try {
            await withTimeout(
              loadProfile(currentUser.id),
              BOOT_TIMEOUT_MS,
              "getProfile+getFarm",
            );
          } catch (profileErr) {
            // eslint-disable-next-line no-console
            console.warn("[boot] loadProfile falhou — app renderiza sem perfil:", profileErr);
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[boot] init falhou — liberando UI:", err);
      } finally {
        if (!cancelled) {
          stepTiming("bootTotal", bootStart);
          setLoading(false);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      try {
        if (newUser) {
          await withTimeout(
            loadProfile(newUser.id),
            BOOT_TIMEOUT_MS,
            `onAuthStateChange:${event}`,
          );
        } else {
          setProfile(null);
          setFarms([]);
          setActiveFarmId(null);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[boot] onAuthStateChange ${event} falhou:`, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const setActiveFarm = (farmId: string) => {
    if (!farms.some((farm) => farm.id === farmId)) {
      // Não permite restaurar por código/localStorage uma fazenda que foi
      // desativada ou bloqueada por coordenadas inválidas.
      console.warn("[auth] seleção de fazenda operacional inválida bloqueada");
      return;
    }
    setActiveFarmId(farmId);
    if (typeof window !== "undefined") {
      localStorage.setItem("cotrim_active_farm", farmId);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("cotrim_active_farm");
    }
  };

  const activeFarmTimezone =
    farms.find((farm) => farm.id === activeFarmId)?.timezone ?? DEFAULT_FARM_TIMEZONE;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        farms,
        activeFarmId,
        activeFarmTimezone,
        loading,
        setActiveFarm,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
