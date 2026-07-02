"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { type ImplantationStep } from "@/lib/hooks";

interface ImplantationGuideProps {
  steps: ImplantationStep[];
  progress: number;
  nextStep: ImplantationStep | null;
}

/**
 * Guided onboarding checklist (Fase 1.1). Renders the ordered sequence of
 * foundation registrations an irrigator must complete before the platform
 * can operate, highlighting the next required step.
 */
export function ImplantationGuide({ steps, progress, nextStep }: ImplantationGuideProps) {
  return (
    <Card className="border-brand-200 dark:border-brand-800">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-graphite-900 dark:text-white">
            Configuração inicial da plataforma
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Complete os cadastros na ordem abaixo para começar a operar.
          </p>
        </div>
        <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">
          {progress}% concluído
        </span>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-graphite-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="mt-6 space-y-3">
        {steps.map((step) => {
          const isNext = nextStep?.key === step.key;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                className={`flex items-start gap-4 rounded-xl border p-4 transition-colors ${
                  isNext
                    ? "border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-900/20"
                    : "border-gray-200 hover:border-gray-300 dark:border-graphite-700 dark:hover:border-graphite-600"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    step.done
                      ? "bg-brand-500 text-white"
                      : isNext
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                        : "bg-gray-100 text-gray-400 dark:bg-graphite-800 dark:text-gray-500"
                  }`}
                >
                  {step.done ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step.order
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-graphite-900 dark:text-white">
                      {step.label}
                    </h3>
                    {step.done && step.count > 0 && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">
                        {step.count} cadastrado{step.count > 1 ? "s" : ""}
                      </span>
                    )}
                    {isNext && (
                      <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Próximo passo
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{step.description}</p>
                </div>

                <svg
                  className={`h-5 w-5 shrink-0 self-center ${isNext ? "text-brand-500" : "text-gray-300 dark:text-gray-600"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
