"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface UseCrudOptions {
  table: string;
  orderBy?: string;
  ascending?: boolean;
  filters?: Record<string, string | null>;
}

export function useCrud<T extends { id: string }>({
  table,
  orderBy = "created_at",
  ascending = false,
  filters = {},
}: UseCrudOptions) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  // Chave estável do objeto `filters` para invalidação de hooks — evita
  // recomputar sempre que o pai recria o literal, mas dispara quando o
  // conteúdo muda de verdade.
  const filtersKey = JSON.stringify(filters);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending });

    for (const [key, value] of Object.entries(filters)) {
      if (value) query = query.eq(key, value);
    }

    const { data: result, error: err } = await query;

    if (err) {
      setError(err.message);
      setData([]);
    } else {
      setData((result ?? []) as T[]);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, table, orderBy, ascending, filtersKey]);

  useEffect(() => {
    const hasNullRequiredFilter = Object.values(filters).some((v) => v === null);
    if (!hasNullRequiredFilter) {
      fetch();
    } else {
      setData([]);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch, filtersKey]);

  const create = async (item: Omit<T, "id" | "created_at" | "updated_at">) => {
    const { error: err } = await supabase.from(table).insert(item as Record<string, unknown>);
    if (err) throw new Error(err.message);
    await fetch();
  };

  const update = async (id: string, item: Partial<T>) => {
    const { error: err } = await supabase.from(table).update(item as Record<string, unknown>).eq("id", id);
    if (err) throw new Error(err.message);
    await fetch();
  };

  const softDelete = async (id: string) => {
    const { error: err } = await supabase
      .from(table)
      .update({ active: false } as Record<string, unknown>)
      .eq("id", id);
    if (err) throw new Error(err.message);
    await fetch();
  };

  const hardDelete = async (id: string) => {
    const { error: err } = await supabase.from(table).delete().eq("id", id);
    if (err) throw new Error(err.message);
    await fetch();
  };

  return { data, loading, error, fetch, create, update, softDelete, hardDelete };
}
