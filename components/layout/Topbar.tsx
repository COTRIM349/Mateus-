"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth, useTheme } from "@/components/providers";
import { useRouter } from "next/navigation";

export function Topbar() {
  const { profile, farms, activeFarmId, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const activeFarm = farms.find((f) => f.id === activeFarmId);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-[#f4f7f5]/85 px-5 backdrop-blur-xl dark:border-white/[0.06] dark:bg-graphite-900/85 sm:px-8 lg:px-10">
      <div className="flex items-center gap-2.5 pl-12 lg:pl-0">
        <svg className="h-4 w-4 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
        </svg>
        <span className="text-[13px] font-semibold tracking-tight text-graphite-800 dark:text-white">
          {activeFarm?.name ?? profile?.companyName ?? "Cotrim Irrigação Pro"}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Data */}
        <span className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-graphite-500 dark:text-gray-400 sm:flex">
          <svg className="h-4 w-4 text-graphite-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {today}
        </span>

        <div className="mx-1 hidden h-5 w-px bg-gray-200 dark:bg-white/[0.08] sm:block" />

        {/* Atualização */}
        <span className="hidden items-center gap-1.5 text-[11px] font-medium text-graphite-400 dark:text-gray-500 md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          Atualizado
        </span>

        {/* Theme */}
        <button
          type="button"
          aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
          onClick={toggleTheme}
          className="rounded-lg p-2 text-graphite-400 transition-colors hover:bg-gray-100 hover:text-graphite-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
        >
          {theme === "dark" ? (
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          ) : (
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" /></svg>
          )}
        </button>

        {/* Configurações */}
        <Link
          href="/configuracoes"
          aria-label="Configurações"
          className="rounded-lg p-2 text-graphite-400 transition-colors hover:bg-gray-100 hover:text-graphite-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
        >
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>

        <div className="relative ml-0.5" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white transition-transform hover:scale-105"
          >
            {profile?.name ? profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "?"}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-elevated dark:border-white/[0.06] dark:bg-graphite-800">
              <div className="border-b border-gray-100 px-3 py-2.5 dark:border-white/[0.06]">
                <p className="text-sm font-medium text-graphite-800 dark:text-white">{profile?.name}</p>
                <p className="mt-0.5 text-xs text-graphite-400 dark:text-gray-500">{profile?.email}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
