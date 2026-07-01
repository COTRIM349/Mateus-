-- ============================================================================
-- COTRIM IRRIGACAO PRO — FIX: Bootstrap do Primeiro Administrador
-- ============================================================================
-- Este script corrige o problema de RLS que impede o primeiro usuario
-- de cadastrar fazendas e demais entidades.
--
-- CAUSA RAIZ:
--   1. Nenhuma empresa (company) existe no banco
--   2. O trigger handle_new_user falhou ao criar o perfil (FK company_id NOT NULL)
--   3. Sem perfil em public.users, todas as funcoes RLS retornam NULL
--   4. Sem user_farm_access, nenhum dado farm-scoped e visivel
--
-- EXECUTE APOS o consolidated_v1.sql
-- Cole no SQL Editor do Supabase e clique Run
-- ============================================================================


-- ============================================================================
-- PASSO 1: Criar empresa padrao
-- ============================================================================
INSERT INTO companies (id, name, cnpj, contact_email, active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Cotrim Irrigacao',
  '00.000.000/0001-00',
  'admin@cotrim.com',
  true
)
ON CONFLICT (cnpj) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();


-- ============================================================================
-- PASSO 2: Criar/corrigir perfil do primeiro usuario como admin
-- ============================================================================
-- Busca o primeiro usuario autenticado no Supabase Auth e vincula
-- a empresa criada acima com role = 'admin'
DO $$
DECLARE
  v_user_id    UUID;
  v_user_email TEXT;
  v_company_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  -- Buscar primeiro usuario do Supabase Auth
  SELECT id, email INTO v_user_id, v_user_email
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE '⚠ Nenhum usuario encontrado em auth.users. Faca signup primeiro.';
    RETURN;
  END IF;

  -- Criar ou atualizar registro em public.users
  INSERT INTO public.users (id, company_id, name, email, role, active)
  VALUES (
    v_user_id,
    v_company_id,
    split_part(v_user_email, '@', 1),
    v_user_email,
    'admin',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = v_company_id,
    role = 'admin',
    active = true,
    updated_at = now();

  RAISE NOTICE '✓ Usuario % configurado como admin da empresa Cotrim Irrigacao', v_user_email;
END $$;


-- ============================================================================
-- PASSO 3: Trigger para auto-conceder acesso a fazenda ao criador
-- ============================================================================
-- Quando alguem cria uma fazenda, automaticamente recebe acesso (user_farm_access)
-- Isso resolve o problema chicken-and-egg: criar farm → nao ver farm
CREATE OR REPLACE FUNCTION auto_grant_farm_access()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO user_farm_access (user_id, farm_id, is_default)
    VALUES (auth.uid(), NEW.id, true)
    ON CONFLICT (user_id, farm_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_farm_access ON farms;
CREATE TRIGGER trg_auto_farm_access
  AFTER INSERT ON farms
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_farm_access();


-- ============================================================================
-- PASSO 4: Corrigir trigger handle_new_user com fallback de empresa
-- ============================================================================
-- Se o signup nao traz company_id no metadata, usa a primeira empresa existente
-- Evita que novos cadastros falhem por FK violation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_role TEXT;
BEGIN
  -- Tentar pegar company_id do metadata do signup
  v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;

  -- Fallback: usar primeira empresa existente
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM companies
    WHERE active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Se ainda nao tem empresa, nao cria perfil (evita erro)
  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Role: usar metadata ou default 'viewer'
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'viewer');

  INSERT INTO public.users (id, company_id, name, email, role)
  VALUES (
    NEW.id,
    v_company_id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ============================================================================
-- PASSO 5: Conceder acesso retroativo a fazendas existentes (se houver)
-- ============================================================================
-- Se por algum motivo ja existem fazendas sem user_farm_access, corrige
DO $$
DECLARE
  v_user_id    UUID;
  v_company_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_farm       RECORD;
BEGIN
  -- Buscar admin
  SELECT id INTO v_user_id
  FROM public.users
  WHERE company_id = v_company_id AND role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Conceder acesso a todas as fazendas da empresa
  FOR v_farm IN
    SELECT id FROM farms WHERE company_id = v_company_id
  LOOP
    INSERT INTO user_farm_access (user_id, farm_id, is_default)
    VALUES (v_user_id, v_farm.id, false)
    ON CONFLICT (user_id, farm_id) DO NOTHING;
  END LOOP;
END $$;


-- ============================================================================
-- VERIFICACAO FINAL
-- ============================================================================
-- Roda estas queries para confirmar que tudo esta correto:

-- 1. Verificar empresa
SELECT id, name, cnpj FROM companies;

-- 2. Verificar usuario admin
SELECT u.id, u.email, u.role, u.company_id, c.name AS empresa
FROM users u
JOIN companies c ON c.id = u.company_id;

-- 3. Verificar funcoes RLS (deve retornar dados, nao NULL)
-- (Estas so funcionam quando executadas pelo usuario logado na app,
--  no SQL Editor rodam como superuser)

-- ============================================================================
-- PRONTO! Agora o usuario pode:
--   1. Fazer login na plataforma
--   2. Cadastrar fazendas (auto-concede acesso)
--   3. Cadastrar pivos, culturas, solos e demais entidades
-- ============================================================================
