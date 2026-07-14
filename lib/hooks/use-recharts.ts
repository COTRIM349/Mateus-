"use client";

import { useState, useEffect } from "react";

type RechartsModule = typeof import("recharts");

let cached: RechartsModule | null = null;
let pending: Promise<RechartsModule> | null = null;

export function useRecharts(): RechartsModule | null {
  const [mod, setMod] = useState<RechartsModule | null>(cached);

  useEffect(() => {
    if (cached) {
      setMod(cached);
      return;
    }
    if (!pending) pending = import("recharts");
    pending.then((m) => {
      cached = m;
      setMod(m);
    });
  }, []);

  return mod;
}
