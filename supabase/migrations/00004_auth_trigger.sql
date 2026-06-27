-- ============================================================================
-- Cotrim Irrigação Pro — Trigger de criação de perfil
-- Quando um usuário faz signup no Supabase Auth, cria automaticamente
-- o registro na tabela users com os dados passados via metadata.
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, company_id, name, email, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'company_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
