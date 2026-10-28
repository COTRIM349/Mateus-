"use client";

import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/components/providers";
import { usePathname } from "next/navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const pathname = usePathname();
  const isWaterBalance = pathname?.startsWith("/balanco-hidrico") ?? false;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-graphite-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
          <span className="text-sm text-graphite-400 dark:text-gray-500">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-[#f3f7f6] dark:bg-graphite-950">
      <Topbar />
      <main className={`min-w-0 flex-1 py-5 sm:py-6 lg:py-7 ${isWaterBalance ? "px-2 sm:px-3 lg:px-4" : "px-4 sm:px-7 lg:px-9"}`}>
        <div className={`mx-auto w-full min-w-0 animate-in ${isWaterBalance ? "max-w-none" : "max-w-[1920px]"}`}>{children}</div>
      </main>
    </div>
  );
}
