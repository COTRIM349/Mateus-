"use client";

import Link from "next/link";
import { Card } from "@/components/ui";

interface PrerequisiteNoticeProps {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

export function PrerequisiteNotice({ title, description, actionLabel, actionHref }: PrerequisiteNoticeProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-graphite-800 dark:text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-graphite-400 dark:text-gray-500">{description}</p>
      <Link
        href={actionHref}
        className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-700"
      >
        {actionLabel}
      </Link>
    </Card>
  );
}
