"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { type ImplantationStep } from "@/lib/hooks";

interface ImplantationGuideProps {
  steps: ImplantationStep[];
  progress: number;
  nextStep: ImplantationStep | null;
}

export function ImplantationGuide({ steps, progress, nextStep }: ImplantationGuideProps) {
  return (
    <Card className="border-brand-100 dark:border-brand-800/30">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-graphite-900 dark:text-white">
            Configuração inicial da plataforma
          </h2>
          <p className="mt-1 text-sm text-graphite-400 dark:text-gray-500">
            Complete os cadastros na ordem abaixo para começar a operar.
          </p>
        </div>
        <span className="text-sm font-bold text-brand-600 dark:text-brand-400">
          {progress}%
        </span>
      </div>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-graphite-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="mt-6 space-y-2">
        {steps.map((step) => {
          const isNext = nextStep?.key === step.key;
          return (
            <li key={step.key}>
              <Link
                href={step.href}
                className={`flex items-start gap-4 rounded-2xl border p-4 transition-all duration-150 ${
                  isNext
                    ? "border-brand-200 bg-brand-50/60 dark:border-brand-700/40 dark:bg-brand-900/10"
                    : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 dark:border-white/[0.06] dark:hover:border-white/[0.12]"
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                    step.done
                      ? "bg-brand-600 text-white"
                      : isNext
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                        : "bg-gray-100 text-graphite-400 dark:bg-graphite-800 dark:text-gray-600"
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
                    <h3 className="text-sm font-semibold text-graphite-800 dark:text-white">
                      {step.label}
                    </h3>
                    {step.done && step.count > 0 && (
                      <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-200/60 dark:bg-brand-900/20 dark:text-brand-400 dark:ring-brand-700/30">
                        {step.count} cadastrado{step.count > 1 ? "s" : ""}
                      </span>
                    )}
                    {isNext && (
                      <span className="rounded-lg bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        Próximo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-graphite-400 dark:text-gray-500">{step.description}</p>
                </div>

                <svg
                  className={`h-5 w-5 shrink-0 self-center ${isNext ? "text-brand-500" : "text-gray-200 dark:text-graphite-700"}`}
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
