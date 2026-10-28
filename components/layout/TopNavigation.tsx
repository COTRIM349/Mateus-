"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bottomItems, navGroups, topLevelItems } from "@/config/navigation";
import type { NavItem } from "@/config/navigation";
import { cn } from "@/utils/cn";

function NavIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      className={cn("h-[16px] w-[16px] shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
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
          "flex min-h-[39px] items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors",
          active
            ? "bg-white/15 text-white ring-1 ring-white/10"
            : "text-white/80 hover:bg-white/10 hover:text-white",
        )}
      >
        <NavIcon path={item.icon} />
        {item.label}
      </Link>
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
          "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14px] font-medium",
          active ? "bg-santa-700 text-white" : "text-white/85 hover:bg-white/10",
        )}
      >
        <NavIcon path={item.icon} />
        {item.label}
      </Link>
    );
  }

  return (
    <div ref={navigationRef} className="relative border-t border-white/10 bg-santa-900">
      <nav
        aria-label="Navegação principal"
        className="hidden min-h-[49px] flex-wrap items-center gap-1 px-4 py-1.5 lg:flex lg:px-7"
      >
        {topLevelItems.map((item) => <DesktopLink key={item.href} item={item} />)}
        {navGroups.map((group, index) => {
          const active = group.items.some((item) => isActivePath(pathname, item.href));
          const expanded = openGroup === group.label;
          return (
            <div key={group.label} className="relative">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={"desktop-nav-group-" + index}
                onClick={() => setOpenGroup(expanded ? null : group.label)}
                className={cn(
                  "flex min-h-[39px] items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors",
                  active || expanded ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                )}
              >
                <NavIcon path={group.icon} />
                {group.label}
                <svg className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {expanded && (
                <div
                  id={"desktop-nav-group-" + index}
                  className="absolute left-0 top-full z-[60] mt-2 min-w-[250px] rounded-xl border border-santa-100 bg-white p-2 shadow-modal dark:border-white/10 dark:bg-graphite-800"
                >
                  {group.items.map((item) => {
                    const selected = isActivePath(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                          selected
                            ? "bg-santa-50 text-santa-800 dark:bg-santa-900/30 dark:text-santa-200"
                            : "text-graphite-700 hover:bg-santa-50 dark:text-gray-200 dark:hover:bg-white/10",
                        )}
                      >
                        <NavIcon path={item.icon} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {bottomItems.map((item) => <DesktopLink key={item.href} item={item} />)}
      </nav>

      <div className="px-4 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          className="flex min-h-10 w-full items-center justify-between rounded-lg bg-white/10 px-3 text-[14px] font-semibold text-white"
        >
          <span className="flex items-center gap-2">
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Menu da plataforma
          </span>
          <svg className={cn("h-4 w-4 transition-transform", mobileOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {mobileOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Navegação para telas menores"
          className="absolute inset-x-0 top-full z-[60] max-h-[72vh] overflow-y-auto border-t border-white/10 bg-santa-900 px-3 py-3 shadow-modal lg:hidden"
        >
          {topLevelItems.map((item) => <MobileLink key={item.href} item={item} />)}
          {navGroups.map((group, index) => {
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
                    "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[14px] font-semibold",
                    active || expanded ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10",
                  )}
                >
                  <span className="flex items-center gap-3"><NavIcon path={group.icon} />{group.label}</span>
                  <svg className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {expanded && (
                  <div id={"mobile-nav-group-" + index} className="mb-2 ml-4 border-l border-white/15 pl-2">
                    {group.items.map((item) => <MobileLink key={item.href} item={item} />)}
                  </div>
                )}
              </div>
            );
          })}
          {bottomItems.map((item) => <MobileLink key={item.href} item={item} />)}
        </nav>
      )}
    </div>
  );
}
