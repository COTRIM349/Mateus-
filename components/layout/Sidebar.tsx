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
        "group flex min-h-[38px] items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium leading-snug transition-all duration-150",
        active
          ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08)]"
          : "text-white/80 hover:bg-white/[0.07] hover:text-white",
      )}
    >
      <svg
        className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-santa-200" : "text-white/65 group-hover:text-white")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
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

  const isGroupExpanded = (label: string, hrefs: string[]) => {
    if (groupOpen[label] !== undefined) return groupOpen[label];
    return hrefs.some((href) => isActive(href));
  };

  const toggleGroup = (label: string, hrefs: string[]) => {
    setGroupOpen((prev) => ({ ...prev, [label]: !isGroupExpanded(label, hrefs) }));
  };

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl bg-santa-800 p-2.5 text-white shadow-elevated lg:hidden"
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
          "fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-santa-800 text-white transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        <div className="shrink-0 border-b border-white/10 px-4 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="border-r border-white/20 pr-3 text-[28px] font-black tracking-tight text-white">SCA</span>
            <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-santa-200">
              IRRIGA PRO
            </span>
          </div>
          <p className="mt-2 text-[11px] text-white/65">Gestão inteligente da irrigação</p>
        </div>

        {farms.length > 1 && (
          <div className="mx-3 mb-1.5 shrink-0">
            <select
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarm(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-[13px] font-medium text-white/90 outline-none transition-colors focus:border-white/20 focus:bg-white/[0.1]"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id} className="text-graphite-900">
                  {farm.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav aria-label="Navegação principal" className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {topLevelItems.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} onClick={() => setOpen(false)} />
          ))}

          {navGroups.map((group) => {
            const expanded = isGroupExpanded(group.label, group.items.map((i) => i.href));
            return (
              <div key={group.label} className="mt-1">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(group.label, group.items.map((i) => i.href))}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white/70"
                >
                  {group.label}
                  <svg
                    className={cn("h-3 w-3 shrink-0 transition-transform", expanded ? "rotate-90" : "")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {expanded && (
                  <div className="mt-0.5">
                    {group.items.map((item) => (
                      <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} onClick={() => setOpen(false)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mt-2 border-t border-white/[0.08] pt-1.5">
            {bottomItems.map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={isActive(item.href)} onClick={() => setOpen(false)} />
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/[0.08] px-3 py-2.5">
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-bold text-brand-200">
              {profile?.name
                ? profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
                : "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-white">{profile?.name ?? "Usuário"}</p>
              <p className="truncate text-[11.5px] text-white/55">{activeFarm?.name ?? roleLabels[profile?.role ?? "viewer"]}</p>
            </div>
          </div>
          <p className="mt-1 px-1 text-[11px] text-white/45">v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
