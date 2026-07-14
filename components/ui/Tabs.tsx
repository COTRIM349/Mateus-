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
    <div className="border-b border-gray-100 dark:border-white/[0.06]">
      <nav className="-mb-px flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150",
              activeTab === tab.id
                ? "bg-brand-600 text-white shadow-glow"
                : "text-graphite-400 hover:bg-gray-100 hover:text-graphite-700 dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
