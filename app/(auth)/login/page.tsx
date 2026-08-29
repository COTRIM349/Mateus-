"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-10 shadow-elevated dark:border-white/[0.06] dark:bg-graphite-900">
      <div className="mb-10 flex flex-col items-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-soft">
          <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-graphite-900 dark:text-white">
          Cotrim Irrigação Pro
        </h1>
        <p className="mt-2 text-sm text-graphite-400 dark:text-gray-500">
          Entre com suas credenciais
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
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

        <Input
          id="password"
          label="Senha"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        {error && (
          <p className="rounded-xl bg-red-50 p-3.5 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="mt-8 text-center">
        <Link
          href="/recuperar-senha"
          className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400"
        >
          Esqueceu a senha?
        </Link>
      </div>
    </div>
  );
}
