"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/providers";

export default function ClimaLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const observabilidade = pathname.includes("/clima/observabilidade");
  const { profile } = useAuth();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white/80 p-2 dark:border-white/[0.06] dark:bg-graphite-800/80">
        <Link
          href="/clima"
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            !observabilidade
              ? "bg-brand-600 text-white"
              : "text-graphite-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.04]"
          }`}
        >
          Clima atual
        </Link>
        {profile?.role === "admin" ? <Link
          href="/clima/observabilidade"
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            observabilidade
              ? "bg-amber-500 text-amber-950"
              : "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/[0.08]"
          }`}
        >
          Fechamento diário
        </Link> : null}
      </div>
      {children}
    </div>
  );
}
