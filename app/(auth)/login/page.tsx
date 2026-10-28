"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
    <div className="dark relative mx-auto grid w-full max-w-[1160px] overflow-hidden rounded-[28px] border border-white/10 bg-[#081b2b] text-white shadow-[0_28px_90px_rgba(0,0,0,.38)] lg:min-h-[650px] lg:grid-cols-[1.07fr_.93fr]">
      {/* Identidade corporativa somente na tela de acesso. */}
      <aside className="relative isolate min-h-[300px] overflow-hidden bg-[#051e2d] px-6 py-7 sm:px-9 sm:py-9 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_25%_0%,rgba(8,184,150,.2),transparent_58%),linear-gradient(135deg,#06182a_5%,#062c32_64%,#061726)]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -right-24 -z-10 h-96 w-96 rounded-full border border-emerald-300/10 shadow-[0_0_140px_rgba(4,200,154,.1)]" />
        <div className="relative z-10">
          <div className="inline-flex flex-col items-start rounded-2xl border border-white/10 bg-white/[0.055] px-5 py-4">
            <span className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-emerald-200/80">
              Uma solução Santa Colomba
            </span>
            <Image
              src="/brand/santa-colomba-logo-branca.png"
              alt="Logotipo da Santa Colomba"
              width={194}
              height={72}
              priority
              className="h-auto w-[168px] object-contain sm:w-[194px]"
            />
          </div>

          <div className="mt-7 sm:mt-9 lg:mt-16">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[.3em] text-emerald-300">
              Plataforma de gestão hídrica
            </p>
            <h1 className="max-w-lg text-[38px] font-black leading-[.96] tracking-tight sm:text-[54px] lg:text-[67px]">
              <span className="block text-white">SCA</span>
              <span className="block text-white">IRRIGA <span className="text-emerald-400">PRO</span></span>
            </h1>
            <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-slate-300 sm:text-[15px]">
              Gestão inteligente da irrigação. Dados que geram produtividade, do solo à decisão.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-7 hidden lg:block">
          <div className="mb-5 h-px bg-gradient-to-r from-emerald-400/60 via-cyan-300/20 to-transparent" />
          <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold uppercase tracking-[.09em] text-slate-300">
            <span>Solo e água</span>
            <span>Manejo diário</span>
            <span>Decisões</span>
          </div>
          <p className="mt-7 text-[11px] text-slate-400">SCA Irriga Pro · Plataforma de irrigação</p>
        </div>
      </aside>

      <main className="flex items-center bg-[#081927] px-6 py-9 sm:px-10 sm:py-12 lg:px-14">
        <div className="mx-auto w-full max-w-[410px]">
          <div className="mb-9">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              ACESSO À PLATAFORMA
            </div>
            <h2 className="text-[28px] font-extrabold tracking-tight sm:text-[32px]">Bem-vindo de volta</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              Entre com suas credenciais para acessar o manejo da irrigação.
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
              className="h-12"
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
              className="h-12"
            />

            {error && (
              <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 p-3.5 text-[13px] text-red-200">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-2 h-12 w-full bg-emerald-600 text-[14px] font-bold hover:bg-emerald-500" disabled={loading}>
              {loading ? "Entrando..." : "Entrar na plataforma"}
            </Button>
          </form>

          <div className="mt-7 text-center">
            <Link href="/recuperar-senha" className="text-[13px] font-semibold text-emerald-300 transition-colors hover:text-emerald-200">
              Esqueceu a senha?
            </Link>
          </div>
          <div className="mt-10 border-t border-white/10 pt-5 text-center text-[11px] text-slate-500">
            Acesso reservado a usuários autorizados
          </div>
        </div>
      </main>
    </div>
  );
}
