"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface UserProfile {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "operator" | "viewer";
}

interface FarmAccess {
  id: string;
  name: string;
  isDefault: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  farms: FarmAccess[];
  activeFarmId: string | null;
  loading: boolean;
  setActiveFarm: (farmId: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  farms: [],
  activeFarmId: null,
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
  // Log temporário para diagnóstico do boot — pode ser removido quando
  // estabilizar. Não é caro: só uma linha por etapa.
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

  // Cliente criado uma única vez. Antes era `const supabase = createClient()`
  // no corpo do componente, que produzia uma nova instância a cada render e
  // reexecutava o useEffect abaixo em loop.
  const [supabase] = useState(() => createClient());

  const loadProfile = useCallback(
    async (userId: string): Promise<void> => {
      const started = performance.now();
      // Paraleliza as duas leituras — antes eram sequenciais.
      const [profileRes, farmRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, company_id, name, email, role, companies(name)")
          .eq("id", userId)
          .single(),
        supabase
          .from("user_farm_access")
          .select("farm_id, is_default, farms(id, name)")
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
        const accessList: FarmAccess[] = farmData.map((f) => {
          const farm = f.farms as unknown as { id: string; name: string };
          return { id: farm.id, name: farm.name, isDefault: f.is_default };
        });
        setFarms(accessList);

        const stored =
          typeof window !== "undefined"
            ? localStorage.getItem("cotrim_active_farm")
            : null;
        const validStored = accessList.find((f) => f.id === stored);
        const defaultFarm = accessList.find((f) => f.isDefault);
        setActiveFarmId(
          validStored?.id ?? defaultFarm?.id ?? accessList[0]?.id ?? null,
        );
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
        // getSession() lê apenas storage local (cookie) — não faz round-trip
        // de rede. Se o usuário estiver deslogado, retorna null rapidamente.
        // A validação de JWT já é feita pelo middleware do Next.
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
            // Requisito 6: se dados secundários falharem, o app renderiza.
            // eslint-disable-next-line no-console
            console.warn("[boot] loadProfile falhou — app renderiza sem perfil:", profileErr);
          }
        }
      } catch (err) {
        // Requisito 5: qualquer falha aqui não pode travar o loading.
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

    // Escuta trocas de sessão (login/logout/refresh). Já vem com timeout
    // implícito porque o próprio evento só dispara quando o Supabase
    // atualiza a sessão localmente.
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

  return (
    <AuthContext.Provider
      value={{ user, profile, farms, activeFarmId, loading, setActiveFarm, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
