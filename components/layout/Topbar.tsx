"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth, useTheme } from "@/components/providers";
import { useRouter } from "next/navigation";

export function Topbar() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-graphite-700 dark:bg-graphite-900 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 pl-12 lg:pl-0">
        <div className="hidden text-sm text-gray-500 dark:text-gray-400 sm:block">
          {profile?.companyName ?? "Cotrim Irrigação Pro"}
        </div>
      </div>

      <div className="mx-4 hidden max-w-md flex-1 md:block">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.3-4.3m1.3-5.2a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
          </span>
          <input
            type="search"
            placeholder="Buscar pivôs, culturas, alertas..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-graphite-900 outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 dark:border-graphite-700 dark:bg-graphite-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-brand-500 dark:focus:bg-graphite-800"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={theme === "dark" ? "Modo claro" : "Modo escuro"}
          onClick={toggleTheme}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-graphite-900 dark:text-gray-400 dark:hover:bg-graphite-800 dark:hover:text-white"
        >
          {theme === "dark" ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          aria-label="Notificações"
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-graphite-900 dark:text-gray-400 dark:hover:bg-graphite-800 dark:hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-graphite-800"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-graphite-900 dark:text-white">
                {profile?.name ?? "Usuário"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {roleLabels[profile?.role ?? "viewer"]}
              </p>
            </div>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-graphite-700 dark:bg-graphite-800">
              <div className="border-b border-gray-100 px-4 py-2 dark:border-graphite-700">
                <p className="text-sm font-medium text-graphite-900 dark:text-white">
                  {profile?.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {profile?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
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
