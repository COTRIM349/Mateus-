"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navigationEntries } from "@/config/navigation";
import type { NavGroup, NavItem } from "@/config/navigation";
import { cn } from "@/utils/cn";

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
          "relative flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-md px-3 text-[14px] font-semibold tracking-[-0.01em] transition-colors",
          active
            ? "bg-white/[0.1] text-white ring-1 ring-white/[0.08] after:absolute after:inset-x-3 after:-bottom-1 after:h-[2px] after:rounded-full after:bg-emerald-300"
            : "text-white/72 hover:bg-white/[0.06] hover:text-white",
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
                  "px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em]",
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
                  "flex items-center gap-2.5 rounded-lg px-3 transition-colors duration-150",
                  mobile
                    ? "min-h-10 text-[14px] font-medium"
                    : "min-h-10 text-[14px] font-medium tracking-[-0.005em]",
                  selected
                    ? mobile
                      ? "bg-white/10 text-white"
                      : "bg-santa-50 text-santa-800 dark:bg-santa-900/30 dark:text-santa-200"
                    : mobile
                      ? "text-white/80 hover:bg-white/[0.08] hover:text-white"
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
            "relative flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-md px-3 text-[14px] font-semibold tracking-[-0.01em] transition-colors",
            active || expanded
              ? "bg-white/[0.1] text-white ring-1 ring-white/[0.08] after:absolute after:inset-x-3 after:-bottom-1 after:h-[2px] after:rounded-full after:bg-emerald-300"
              : "text-white/72 hover:bg-white/[0.06] hover:text-white",
          )}
        >
          <NavIcon path={group.icon} />
          {group.label}
          <Chevron expanded={expanded} />
        </button>
        {expanded && (
          <div
            id={"desktop-nav-group-" + index}
            className="absolute left-1/2 top-full z-[60] mt-2 min-w-[300px] -translate-x-1/2 rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-[0_20px_50px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-graphite-800"
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
      className="relative border-t border-white/[0.07] bg-santa-900/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
    >
      <nav
        aria-label="Navegação principal"
        className="mx-auto hidden min-h-[52px] w-full max-w-[1680px] items-center justify-center gap-1 overflow-visible px-4 py-1 lg:flex lg:px-8"
      >
        <div className="flex w-full items-center justify-center gap-1 xl:gap-1.5">
          {navigationEntries.map((entry, index) =>
            entry.type === "item"
              ? <DesktopLink key={entry.item.href} item={entry.item} />
              : <DesktopGroup key={entry.group.label} group={entry.group} index={index} />,
          )}
        </div>
      </nav>

      <div className="px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          className="flex min-h-10 w-full items-center justify-between rounded-lg bg-white/[0.08] px-3 text-[15px] font-semibold text-white"
        >
          <span className="flex items-center gap-2">
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Menu da plataforma
          </span>
          <Chevron expanded={mobileOpen} />
        </button>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Navegação para telas menores"
          className="absolute inset-x-0 top-full z-[60] max-h-[72vh] overflow-y-auto border-t border-white/10 bg-santa-900 px-3 py-3 shadow-modal lg:hidden"
        >
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
