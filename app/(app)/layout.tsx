"use client";

import { Sidebar } from "@/components/layout/Sidebar";
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
    <div className="flex min-h-screen bg-gray-50 dark:bg-graphite-950">
      <Sidebar />
      <div className="flex flex-1 flex-col lg:pl-64">
        <Topbar />
        <main className="flex-1 bg-gradient-to-b from-transparent via-transparent to-brand-50/30 px-4 py-8 dark:to-brand-950/5 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
