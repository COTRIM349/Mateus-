"use client";

import { useState, useRef, useEffect } from "react";
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

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gestor",
    operator: "Operador",
    viewer: "Visualizador",
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-white/95 px-4 shadow-sm backdrop-blur-xl dark:border-white/[0.06] dark:bg-graphite-900/95 dark:shadow-none sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 pl-12 lg:pl-0">
        <span className="text-sm font-semibold text-graphite-800 dark:text-white">
          {activeFarm?.name ?? profile?.companyName ?? "Cotrim Irrigação Pro"}
        </span>
      </div>

      <div className="mx-4 hidden max-w-md flex-1 md:block">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-graphite-300 dark:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3m1.3-5.2a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Buscar pivôs, culturas, alertas..."
            className="w-full rounded-xl border border-gray-100 bg-gray-50/80 py-2 pl-9 pr-4 text-sm text-graphite-800 outline-none transition-all duration-150 placeholder:text-graphite-300 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-gray-600 dark:focus:border-brand-500/50 dark:focus:bg-white/[0.06]"
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
          onClick={toggleTheme}
          className="rounded-xl p-2 text-graphite-400 transition-colors hover:bg-gray-100 hover:text-graphite-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
        >
          {theme === "dark" ? (
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          aria-label="Notificações"
          className="relative rounded-xl p-2 text-graphite-400 transition-colors hover:bg-gray-100 hover:text-graphite-600 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
        >
          <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-graphite-900" />
        </button>

        <div className="ml-1 h-6 w-px bg-gray-100 dark:bg-white/[0.06]" />

        <div className="relative ml-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-xs font-bold text-white">
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-graphite-800 dark:text-white">
                {profile?.name ?? "Usuário"}
              </p>
              <p className="text-[10px] text-graphite-400 dark:text-gray-600">
                {roleLabels[profile?.role ?? "viewer"]}
              </p>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-elevated dark:border-white/[0.06] dark:bg-graphite-800">
              <div className="border-b border-gray-100 px-3 py-2.5 dark:border-white/[0.06]">
                <p className="text-sm font-medium text-graphite-800 dark:text-white">
                  {profile?.name}
                </p>
                <p className="mt-0.5 text-xs text-graphite-400 dark:text-gray-500">
                  {profile?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
