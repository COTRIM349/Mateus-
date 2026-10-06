# Deploy — Cotrim Irrigação Pro (Supabase + Vercel)

App Next.js 14 + Supabase. Planejamento **por clima** (ETo/Kc). Offline não se aplica:
é um app web hospedado; acessa pelo navegador (PC e celular).

> Observação: o deploy em si precisa das SUAS contas (Supabase e Vercel) e dos
> segredos. Siga os passos abaixo; qualquer erro, me manda a mensagem.

## 1. Banco (Supabase)

1. Projeto Supabase: use o que o app já aponta (o mesmo onde estamos cadastrando).
2. Aplicar as migrations (nesta ordem — estão em `supabase/migrations/`):
   ```bash
   supabase link --project-ref <seu-project-ref>
   supabase db push
   ```
   (ou cole cada arquivo novo no **SQL Editor** do Supabase, na ordem do nome)
3. Migrations de cadastro que criamos:
   - `20261006120000_seed_culture_phases_fao56.sql`  — Kc por fase (Kc/DAE)
   - `20261006130000_seed_cotrim_pivots.sql`         — 108 pivôs + módulos + casas de bomba
   - `20261006140000_seed_cotrim_reservoirs.sql`     — reservatórios
   - `20261006150000_seed_cotrim_varieties.sql`      — variedades (soja/algodão) + GRM/ocupação
   - `20261006160000_seed_default_soil_cerrado.sql`  — solo padrão (planejar por clima, sem gerir solo)

## 2. App (Vercel)

1. Vercel → **New Project** → importe o repositório do GitHub.
2. Framework: Next.js (detectado automático). Build: `next build`.
3. **Environment Variables** (Production + Preview) — ver `.env.example`:
   ```
   NEXT_PUBLIC_SUPABASE_URL      = https://<seu-projeto>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon key do Supabase>
   SUPABASE_SERVICE_ROLE_KEY     = <service role key>  (somente server)
   CRON_SECRET                   = <uma senha forte sua>
   CLIMATE_CRON_SECRET           = <uma senha forte sua>
   # Clima (ETo) — pelo menos uma fonte:
   METEOBLUE_API_KEY             = <chave>   (opcional)
   WEATHERAPI_API_KEY            = <chave>   (opcional)
   MET_NORWAY_USER_AGENT         = CotrimIrrigacaoPro/1.0 seu-email@dominio
   INMET_TOKEN                   = <token>   (opcional)
   ```
4. **Deploy**. Vercel gera a URL (ex.: `cotrim-irrigacao.vercel.app`).

## 3. Clima (ETo) — essencial no modo por clima

Como o manejo é por **clima**, a **ETo** é o dado que move a recomendação. Duas opções:
- **Automático**: configure uma das fontes acima (Meteoblue/WeatherAPI/MET Norway/INMET).
  O app tem cron de atualização (`CRON_SECRET`).
- **Manual**: lançar a ETo da semana na tela de Clima/ETo (sem depender de API).

## 4. Primeiro acesso

1. Crie o usuário admin (ver `supabase/fix_bootstrap_admin.sql`).
2. Confira: Culturas (Kc), Pivôs/Módulos/Casas, Reservatórios, Variedades.
3. **Vinculação**: pivô → cultura → variedade → data de plantio (solo já vem padrão).
4. **ETo** da semana (manual ou automática) → **Programação** → **Ordem de Serviço**.

## Observação de arquitetura (modo clima)

A plataforma nasceu com balanço hídrico de **solo** (CC/PMP/AFD). Para operar por
**clima**, usamos um **solo padrão único** aplicado a todos os pivôs — você não gerencia
solo, e a necessidade semanal é essencialmente `ETc = Kc(DAE) × ETo`.
Se quiser um **modo clima puro** (ignorar solo no motor e soltar a trava no banco),
é uma alteração à parte no serviço de recomendação (podemos fazer depois).
