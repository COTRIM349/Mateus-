"use client";

import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/components/providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

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
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-6 lg:px-9 lg:py-7">
        <div className="mx-auto w-full max-w-[1920px] animate-in">{children}</div>
      </main>
    </div>
  );
}
