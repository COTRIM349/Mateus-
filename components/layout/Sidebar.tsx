"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { topLevelItems, navGroups, bottomItems, type NavItem } from "@/config/navigation";
import { cn } from "@/utils/cn";
import { useAuth } from "@/components/providers";
import { APP_VERSION } from "@/constants/app";

function pathMatches(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function itemInSection(pathname: string, item: NavItem): boolean {
  if (pathMatches(pathname, item.href)) return true;
  return item.children?.some((child) => itemInSection(pathname, child)) ?? false;
}

function NavLink({
  href,
  icon,
  label,
  active,
  inSection,
  nested,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  inSection?: boolean;
  nested?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-md text-[13px] font-medium leading-tight transition-colors duration-150",
        nested ? "px-2.5 py-[5px] pl-8" : "px-2.5 py-[7px]",
        active
          ? "bg-brand-500/20 text-white shadow-[inset_2px_0_0_0_currentColor]"
          : inSection
            ? "text-white"
            : "text-brand-100/70 hover:bg-white/[0.05] hover:text-white",
      )}
    >
      <svg
        className={cn(
          "shrink-0 transition-colors",
          nested ? "h-3.5 w-3.5" : "h-4 w-4",
          active ? "text-brand-300" : "text-brand-200/55 group-hover:text-brand-200",
        )}
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

function NavBranch({
  item,
  pathname,
  nested,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
  onNavigate: () => void;
}) {
  const active = pathMatches(pathname, item.href);
  const inSection = itemInSection(pathname, item);
  const showChildren = Boolean(item.children?.length) && inSection;

  return (
    <div>
      <NavLink
        href={item.href}
        icon={item.icon}
        label={item.label}
        active={active}
        inSection={inSection && !active && !nested}
        nested={nested}
        onClick={onNavigate}
      />
      {showChildren && (
        <div className="mt-0.5">
          {item.children!.map((child) => (
            <NavBranch key={child.href} item={child} pathname={pathname} nested onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
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
          "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-forest-950 text-white transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        )}
      >
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/90 text-white">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-extrabold leading-none tracking-[0.14em] text-brand-200">COTRIM</p>
            <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-brand-400/80">Irrigação Pro</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {topLevelItems.map((item) => (
            <NavBranch key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
          ))}

          {navGroups.map((group) => (
            <div key={group.label} className="mt-4">
              <p className="px-2.5 pb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavBranch key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-4 space-y-0.5">
            {bottomItems.map((item) => (
              <NavBranch key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        </nav>

        <div className="shrink-0 space-y-2 border-t border-white/[0.06] px-3 py-3">
          {farms.length > 0 && (
            <select
              value={activeFarmId ?? ""}
              onChange={(e) => setActiveFarm(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-[11px] font-medium text-white/90 outline-none transition-colors focus:border-white/20"
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id} className="text-graphite-900">
                  {farm.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-bold text-brand-200">
              {profile?.name
                ? profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
                : "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-tight text-white">{profile?.name ?? "Usuário"}</p>
              <p className="truncate text-[10.5px] text-white/45">{activeFarm?.name ?? roleLabels[profile?.role ?? "viewer"]}</p>
            </div>
          </div>
          <p className="text-[10px] text-white/25">v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
