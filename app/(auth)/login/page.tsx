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
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg dark:border-graphite-700 dark:bg-graphite-900">
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-500 text-white">
          <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.5l5.5 7.7a6.5 6.5 0 11-11 0L12 2.5z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-graphite-900 dark:text-white">
          Cotrim Irrigação Pro
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Entre com suas credenciais
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
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
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/recuperar-senha"
          className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          Esqueceu a senha?
        </Link>
      </div>
    </div>
  );
}
