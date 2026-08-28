-- Hardening compatível com a UI atual: entradas operacionais exigem sessão autenticada.
REVOKE ALL ON public.irrigation_events FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.irrigation_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.irrigation_events TO authenticated;

REVOKE ALL ON public.manual_rainfall_entries FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.manual_rainfall_entries FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_rainfall_entries TO authenticated;

-- Histórico calculado legado continua temporariamente gravável pelo app atual
-- até a estabilização ser publicada, mas nunca por usuário anônimo.
REVOKE ALL ON public.water_balances FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.water_balances FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.water_balances TO authenticated;
