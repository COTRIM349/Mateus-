"use client";

import { cn } from "@/utils/cn";

export function Tabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-1 flex gap-1.5 rounded-2xl bg-gray-100/80 p-1 dark:bg-white/[0.04]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200",
            activeTab === tab.id
              ? "bg-brand-600 text-white shadow-glow"
              : "text-graphite-400 hover:text-graphite-700 dark:text-gray-500 dark:hover:text-gray-300",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
