"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { topLevelItems, navGroups, bottomItems } from "@/config/navigation";
import { cn } from "@/utils/cn";
import { useAuth } from "@/components/providers";
import { APP_VERSION } from "@/constants/app";

function NavLink({
  href,
  icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-150",
        active
          ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)]"
          : "text-white/60 hover:bg-white/[0.06] hover:text-white/90",
      )}
    >
      <svg
        className={cn("h-[19px] w-[19px] shrink-0 transition-colors", active ? "text-brand-300" : "text-white/50 group-hover:text-white/80")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { farms, activeFarmId, setActiveFarm, profile } = useAuth();

  const activeFarm = farms.find((f) => f.id === activeFarmId);

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gestor",
    operator: "Operador",
    viewer: "Visualizador",
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl bg-forest-900 p-2.5 text-white shadow-elevated lg:hidden"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-forest-900 text-white transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/90 text-white">
            <svg className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-extrabold leading-none tracking-tight text-white">Cotrim</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.22em] text-brand-300">Irrigação Pro</p>
          </div>
        </div>

        {/* Farm selector (quando há mais de uma fazenda) */}
        {farms.length > 1 && (
          <div className="mx-4 mb-3">
            <select
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarm(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-xs font-medium text-white/90 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.1]"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id} className="text-graphite-900">
                  {farm.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-4 py-2">
          {topLevelItems.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} onClick={() => setOpen(false)} />
          ))}

          {navGroups.map((group, gi) => (
            <div key={group.label} className={cn(gi === 0 ? "mt-2" : "mt-5")}>
              <p className="px-3.5 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} onClick={() => setOpen(false)} />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-5 space-y-0.5 border-t border-white/[0.08] pt-4">
            {bottomItems.map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} onClick={() => setOpen(false)} />
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-white/[0.08] px-4 py-4">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-200">
              {profile?.name
                ? profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
                : "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{profile?.name ?? "Usuário"}</p>
              <p className="truncate text-[11px] text-white/45">{activeFarm?.name ?? roleLabels[profile?.role ?? "viewer"]}</p>
            </div>
          </div>
          <p className="mt-2 px-2 text-[10px] text-white/25">v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
