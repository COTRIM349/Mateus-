"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { navItems } from "@/config/navigation";
import { cn } from "@/utils/cn";
import { useAuth } from "@/components/providers";
import { APP_VERSION } from "@/constants/app";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { farms, activeFarmId, setActiveFarm } = useAuth();

  const activeFarm = farms.find((f) => f.id === activeFarmId);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl bg-graphite-900 p-2.5 text-white shadow-elevated lg:hidden"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-graphite-950/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-graphite-950 text-gray-400 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white tracking-tight">Cotrim Irrigação</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">Pro</p>
          </div>
        </div>

        {farms.length > 1 && (
          <div className="mx-4 mb-4">
            <select
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarm(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5 text-xs text-gray-300 outline-none transition-colors focus:border-brand-500/50 focus:bg-white/[0.06]"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {farms.length === 1 && activeFarm && (
          <div className="mx-5 mb-4 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Fazenda</p>
            <p className="mt-0.5 text-sm font-medium text-gray-300">{activeFarm.name}</p>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                  active
                    ? "bg-brand-600/15 text-brand-400"
                    : "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300",
                )}
              >
                <svg className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 text-[11px] text-graphite-600">
          v{APP_VERSION}
        </div>
      </aside>
    </>
  );
}
