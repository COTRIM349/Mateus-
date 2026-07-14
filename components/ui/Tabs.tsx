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
    <div className="border-b border-gray-100 dark:border-graphite-700/50">
      <nav className="-mb-px flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "whitespace-nowrap rounded-t-lg px-4 pb-3 pt-2 text-sm font-medium transition-all duration-150",
              activeTab === tab.id
                ? "border-b-2 border-brand-500 text-brand-600 dark:text-brand-400"
                : "text-graphite-400 hover:text-graphite-700 dark:text-gray-500 dark:hover:text-gray-300",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
