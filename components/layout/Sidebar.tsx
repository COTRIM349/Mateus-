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
  indent,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  onClick?: () => void;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
        indent && "pl-9",
        active
          ? "bg-brand-600 text-white shadow-glow"
          : "text-gray-500 hover:bg-white/[0.06] hover:text-gray-300",
      )}
    >
      <svg className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const activeFarm = farms.find((f) => f.id === activeFarmId);

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    manager: "Gestor",
    operator: "Operador",
    viewer: "Visualizador",
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const isGroupActive = (items: { href: string }[]) =>
    items.some((item) => isActive(item.href));

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

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
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/[0.04] bg-graphite-950 text-gray-400 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-glow">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-tight">Cotrim Irrigação</p>
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
          <div className="mx-4 mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Fazenda</p>
            <p className="mt-0.5 text-sm font-medium text-white">{activeFarm.name}</p>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {topLevelItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive(item.href)}
              onClick={() => setOpen(false)}
            />
          ))}

          {navGroups.map((group) => {
            const groupActive = isGroupActive(group.items);
            const isCollapsed = collapsed[group.label] && !groupActive;

            return (
              <div key={group.label} className="mt-3">
                <button
                  type="button"
                  onClick={() => toggle(group.label)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                    groupActive
                      ? "text-brand-400"
                      : "text-gray-600 hover:text-gray-400",
                  )}
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={group.icon} />
                  </svg>
                  <span className="flex-1 text-left">{group.label}</span>
                  <svg
                    className={cn("h-3.5 w-3.5 transition-transform", isCollapsed && "-rotate-90")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {!isCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                        active={isActive(item.href)}
                        onClick={() => setOpen(false)}
                        indent
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-3 border-t border-white/[0.04] pt-3">
            {bottomItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={isActive(item.href)}
                onClick={() => setOpen(false)}
              />
            ))}
          </div>
        </nav>

        <div className="border-t border-white/[0.04] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/20 text-xs font-bold text-brand-400">
              {profile?.name
                ? profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
                : "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{profile?.name ?? "Usuário"}</p>
              <p className="text-[10px] text-gray-600">{roleLabels[profile?.role ?? "viewer"]}</p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-4 text-[10px] text-graphite-700">
          v{APP_VERSION}
        </div>
      </aside>
    </>
  );
}
