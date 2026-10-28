"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { APP_NAME } from "@/constants/app";

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
      <div className="-mx-10 -mt-10 mb-8 rounded-t-2xl bg-santa-700 px-6 pb-7 pt-7 text-center">
        <Image
          src="/brand/santa-colomba-logo-branca.png"
          alt="Santa Colomba"
          width={210}
          height={79}
          priority
          className="mx-auto h-auto w-[210px] object-contain"
        />
        <h1 className="sr-only">{APP_NAME}</h1>
        <p className="mt-3 text-[13px] font-extrabold uppercase tracking-[0.22em] text-white">
          IRRIGA PRO
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">
          Gestão inteligente da irrigação
        </p>
      </div>
      <p className="mb-7 text-center text-sm text-graphite-500 dark:text-gray-400">
        Entre com suas credenciais
      </p>

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
