"use client";

import Link from "next/link";
import { Card } from "@/components/ui";

interface PrerequisiteNoticeProps {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

/**
 * Blocking notice shown by a screen when a required prior registration is
 * missing (Fase 1.2). Guides the user to the screen that resolves the gap
 * instead of presenting an empty form with no context.
 */
export function PrerequisiteNotice({ title, description, actionLabel, actionHref }: PrerequisiteNoticeProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-graphite-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{description}</p>
      <Link
        href={actionHref}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        {actionLabel}
      </Link>
    </Card>
  );
}
