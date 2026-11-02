"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navigationEntries } from "@/config/navigation";
import type { NavGroup, NavItem } from "@/config/navigation";
import { cn } from "@/utils/cn";
import { useAuth } from "@/components/providers";

function NavIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      className={cn("h-[17px] w-[17px] shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={cn("h-3 w-3 transition-transform duration-150", expanded && "rotate-180")}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function TopNavigation() {
  const pathname = usePathname();
  const { farms, activeFarmId, setActiveFarm, profile } = useAuth();
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (navigationRef.current && !navigationRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function onNavigate() {
    setOpenGroup(null);
    setMobileOpen(false);
  }

  function DesktopLink({ item }: { item: NavItem }) {
    const active = isActivePath(pathname, item.href);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[12px] 2xl:px-2.5 2xl:text-[13px] font-semibold tracking-[-0.01em] transition-colors",
          active
            ? "bg-transparent text-white font-extrabold underline underline-offset-[12px] decoration-2 decoration-white/80"
            : "text-white/78 hover:text-white",
        )}
      >
        <NavIcon path={item.icon} />
        {item.label}
      </Link>
    );
  }

  function GroupItems({ group, mobile = false }: { group: NavGroup; mobile?: boolean }) {
    return (
      <>
        {group.items.map((item, index) => {
          const selected = isActivePath(pathname, item.href);
          const showSection = item.section && item.section !== group.items[index - 1]?.section;
          return (
            <div key={item.href}>
              {showSection && (
                <div className={cn(
                  "px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.1em]",
                  mobile ? "text-white/45" : "text-slate-400 dark:text-slate-500",
                  index > 0 && "mt-1 border-t border-slate-100 dark:border-white/10",
                )}>
                  {item.section}
                </div>
              )}
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 transition-colors",
                  mobile
                    ? "min-h-10 text-[14px] font-medium"
                    : "min-h-10 text-[14px] font-medium tracking-[-0.005em]",
                  selected
                    ? mobile
                      ? "bg-white/10 text-white"
                      : "bg-santa-50 text-santa-800 dark:bg-santa-900/30 dark:text-santa-200"
                    : mobile
                      ? "text-white/80 hover:text-white"
                      : "text-graphite-700 hover:bg-santa-50 dark:text-gray-200 dark:hover:bg-white/10",
                )}
              >
                <NavIcon path={item.icon} className={mobile ? "text-white/70" : "text-slate-500"} />
                {item.label}
              </Link>
            </div>
          );
        })}
      </>
    );
  }

  function DesktopGroup({ group, index }: { group: NavGroup; index: number }) {
    const active = group.items.some((item) => isActivePath(pathname, item.href));
    const expanded = openGroup === group.label;
    return (
      <div className="relative">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={"desktop-nav-group-" + index}
          onClick={() => setOpenGroup(expanded ? null : group.label)}
          className={cn(
            "flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-[14px] font-semibold tracking-[-0.01em] transition-colors",
            active || expanded
              ? "bg-transparent text-white font-extrabold underline underline-offset-[12px] decoration-2 decoration-white/80"
              : "text-white/78 hover:text-white",
          )}
        >
          <NavIcon path={group.icon} />
          {group.label}
          <Chevron expanded={expanded} />
        </button>
        {expanded && (
          <div
            id={"desktop-nav-group-" + index}
            className="absolute left-0 top-full z-[60] mt-2 min-w-[285px] rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-graphite-800"
          >
            <GroupItems group={group} />
          </div>
        )}
      </div>
    );
  }

  function MobileLink({ item }: { item: NavItem }) {
    const active = isActivePath(pathname, item.href);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold tracking-[-0.01em]",
          active ? "bg-white/12 text-white" : "text-white/82 hover:bg-white/[0.08]",
        )}
      >
        <NavIcon path={item.icon} />
        {item.label}
      </Link>
    );
  }

  return (
    <div
      ref={navigationRef}
      data-irrigapro-topnav="true"
      className="relative bg-transparent"
    >
      <nav
        aria-label="Navegação principal"
        className="hidden min-h-[54px] items-center justify-center gap-0.5 overflow-visible xl:flex"
      >
        {navigationEntries.map((entry, index) =>
          entry.type === "item"
            ? <DesktopLink key={entry.item.href} item={entry.item} />
            : <DesktopGroup key={entry.group.label} group={entry.group} index={index} />,
        )}
      </nav>

      <div className="flex items-center justify-end xl:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? "Fechar menu da plataforma" : "Abrir menu da plataforma"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            {mobileOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Navegação para telas menores"
          className="absolute right-0 top-[calc(100%+12px)] z-[60] w-[min(360px,calc(100vw-24px))] max-h-[72vh] overflow-y-auto overscroll-contain rounded-xl border border-white/15 bg-[#194747] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.35)] xl:hidden"
        >
          <div className="mb-3 border-b border-white/15 px-2 pb-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/65">Fazenda ativa</p>
            {farms.length > 1 ? (
              <select
                aria-label="Selecionar fazenda"
                value={activeFarmId ?? ""}
                onChange={(event) => {
                  setActiveFarm(event.target.value);
                  setMobileOpen(false);
                }}
                className="min-h-11 w-full min-w-0 rounded-lg border border-white/20 bg-white px-3 text-sm font-semibold text-[#194747]"
              >
                {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
              </select>
            ) : (
              <p className="truncate text-sm font-semibold text-white">
                {activeFarm?.name ?? profile?.companyName ?? "Fazenda"}
              </p>
            )}
          </div>
          {navigationEntries.map((entry, index) => {
            if (entry.type === "item") return <MobileLink key={entry.item.href} item={entry.item} />;
            const group = entry.group;
            const expanded = openGroup === group.label;
            const active = group.items.some((item) => isActivePath(pathname, item.href));
            return (
              <div key={group.label}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={"mobile-nav-group-" + index}
                  onClick={() => setOpenGroup(expanded ? null : group.label)}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[15px] font-semibold tracking-[-0.01em]",
                    active || expanded ? "bg-white/[0.1] text-white" : "text-white/82 hover:bg-white/[0.08]",
                  )}
                >
                  <span className="flex items-center gap-3"><NavIcon path={group.icon} />{group.label}</span>
                  <Chevron expanded={expanded} />
                </button>
                {expanded && (
                  <div id={"mobile-nav-group-" + index} className="mb-2 ml-4 border-l border-white/15 pl-2">
                    <GroupItems group={group} mobile />
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
