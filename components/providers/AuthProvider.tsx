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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [farms, setFarms] = useState<FarmAccess[]>([]);
  const [activeFarmId, setActiveFarmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const loadProfile = useCallback(async (userId: string) => {
    const { data: profileData } = await supabase
      .from("users")
      .select("id, company_id, name, email, role, companies(name)")
      .eq("id", userId)
      .single();

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

    const { data: farmData } = await supabase
      .from("user_farm_access")
      .select("farm_id, is_default, farms(id, name)")
      .eq("user_id", userId);

    if (farmData) {
      const accessList: FarmAccess[] = farmData.map((f) => {
        const farm = f.farms as unknown as { id: string; name: string };
        return {
          id: farm.id,
          name: farm.name,
          isDefault: f.is_default,
        };
      });
      setFarms(accessList);

      const stored = localStorage.getItem("cotrim_active_farm");
      const validStored = accessList.find((f) => f.id === stored);
      const defaultFarm = accessList.find((f) => f.isDefault);
      setActiveFarmId(validStored?.id ?? defaultFarm?.id ?? accessList[0]?.id ?? null);
    }
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
      if (currentUser) {
        await loadProfile(currentUser.id);
      }
      setLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const newUser = session?.user ?? null;
        setUser(newUser);
        if (newUser) {
          await loadProfile(newUser.id);
        } else {
          setProfile(null);
          setFarms([]);
          setActiveFarmId(null);
        }
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, [supabase, loadProfile]);

  const setActiveFarm = (farmId: string) => {
    setActiveFarmId(farmId);
    localStorage.setItem("cotrim_active_farm", farmId);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("cotrim_active_farm");
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, farms, activeFarmId, loading, setActiveFarm, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
