"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (authError) {
      setError("Não foi possível enviar o e-mail. Tente novamente.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-10 shadow-elevated dark:border-graphite-700/50 dark:bg-graphite-900">
      <div className="mb-10 flex flex-col items-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-soft">
          <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-graphite-900 dark:text-white">
          Recuperar senha
        </h1>
        <p className="mt-2 text-center text-sm text-graphite-400 dark:text-gray-500">
          Informe seu e-mail para receber o link de recuperação
        </p>
      </div>

      {sent ? (
        <div className="space-y-5 text-center">
          <div className="rounded-xl bg-brand-50 p-5 dark:bg-brand-900/20">
            <p className="text-sm font-medium text-brand-700 dark:text-brand-400">
              E-mail enviado com sucesso!
            </p>
            <p className="mt-1.5 text-xs text-brand-600 dark:text-brand-500">
              Verifique sua caixa de entrada e siga as instruções.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-block text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
          >
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleRecover} className="space-y-5">
          <Input
            id="email"
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          {error && (
            <p className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </Button>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-graphite-400 transition-colors hover:text-graphite-600 dark:text-gray-500"
            >
              Voltar para o login
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
