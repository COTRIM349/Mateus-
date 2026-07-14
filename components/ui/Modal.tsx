"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const sizeClass = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  }[size];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-graphite-950/40 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={cn("w-full rounded-2xl border border-gray-100 bg-white shadow-modal dark:border-white/[0.06] dark:bg-graphite-900", sizeClass)}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5 dark:border-white/[0.06]">
          <h2 className="text-lg font-semibold tracking-tight text-graphite-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-graphite-400 transition-colors hover:bg-gray-100 hover:text-graphite-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
