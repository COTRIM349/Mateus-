"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/constants/app";
import { useAuth, useTheme } from "@/components/providers";
import { TopNavigation } from "./TopNavigation";

export function Topbar() {
  const { profile, farms, activeFarmId, setActiveFarm, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-40 w-full border-b border-santa-800 bg-santa-800 text-white shadow-soft">
      <div className="flex min-h-[62px] items-center gap-3 px-4 py-2 sm:px-6 lg:px-7">
        <Link
          href="/"
          title={APP_NAME}
          aria-label="SCA Irriga Pro — início"
          className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-santa-200"
        >
          <span className="border-r border-white/18 pr-3 text-[21px] font-black leading-none tracking-[-.035em] text-white sm:text-[24px]">
            SCA
          </span>
          <span className="text-[11px] font-extrabold uppercase leading-tight tracking-[.14em] text-white sm:text-[13px]">
            IRRIGA <span className="text-emerald-300">PRO</span>
          </span>
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          {farms.length > 1 ? (
            <select
              aria-label="Selecionar fazenda"
              value={activeFarmId ?? ""}
              onChange={(event) => setActiveFarm(event.target.value)}
              className="max-w-[150px] rounded-md border border-white/12 bg-white/[0.08] px-2.5 py-2 text-[13px] font-semibold tracking-[-0.01em] text-white outline-none focus-visible:ring-2 focus-visible:ring-santa-200 sm:max-w-[230px] sm:px-3 sm:text-[14px]"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id} className="text-graphite-900">
                  {farm.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="max-w-[140px] truncate rounded-md border border-white/[0.06] bg-white/[0.07] px-2.5 py-2 text-[13px] font-semibold tracking-[-0.01em] text-white/90 sm:max-w-[230px] sm:px-3 sm:text-[14px]">
              {activeFarm?.name ?? profile?.companyName ?? "Fazenda"}
            </div>
          )}

          <span className="hidden whitespace-nowrap text-[13px] font-medium tracking-[-0.01em] text-white/60 xl:block">
            {today}
          </span>
          <button
            type="button"
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
            onClick={toggleTheme}
            className="rounded-lg p-2 text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-santa-200"
          >
            {theme === "dark" ? (
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13.66-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66-.71-.71M4.05 4.05l-.71.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
              </svg>
            )}
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Menu do usuário"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((current) => !current)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-santa-500 text-[13px] font-bold text-white transition-colors hover:bg-santa-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-santa-200"
            >
              {profile?.name
                ? profile.name.split(" ").map((name) => name[0]).slice(0, 2).join("").toUpperCase()
                : "?"}
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full z-[70] mt-3 w-56 rounded-xl border border-santa-100 bg-white p-2 text-graphite-900 shadow-modal dark:border-white/10 dark:bg-graphite-800 dark:text-white">
                <div className="border-b border-gray-100 px-2 py-2 dark:border-white/10">
                  <p className="truncate text-[14px] font-semibold tracking-[-0.01em]">{profile?.name ?? "Usuário"}</p>
                  <p className="truncate text-[12px] text-graphite-500 dark:text-gray-400">{profile?.email}</p>
                </div>
                <Link href="/configuracoes" onClick={() => setUserMenuOpen(false)} className="mt-1 block rounded-lg px-3 py-2 text-[14px] font-medium hover:bg-santa-50 dark:hover:bg-white/10">
                  Configurações
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full rounded-lg px-3 py-2 text-left text-[14px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <TopNavigation />
    </header>
  );
}
