# Beta operacional — 29/08/2026

## Objetivo
Colocar a plataforma em uso beta controlado, com decisões de irrigação sempre supervisionadas por responsável técnico.

## Escopo liberado no beta
- Cadastro de pivôs, parcelas, culturas, fases e solos.
- Clima operacional aprovado por dia.
- Balanço hídrico FAO-56 Kc simples com Kc, Kl, Ks, p ajustado, CAD, AFD, ARM e recomendação.
- Lançamento de irrigação vinculado à parcela ativa.
- Condição hídrica inicial por capacidade de campo confirmada ou medição.
- Gráfico de manejo e dados auditáveis.

## Regras de segurança
1. Nunca assumir ETo, chuva, condição inicial, solo ou fases ausentes como zero.
2. Sem condição inicial confiável, o balanço permanece bloqueado.
3. Quando um novo cálculo falhar, resultados anteriores devem ser removidos da tela.
4. Nota sensorial é informação de campo e não substitui automaticamente o ARM.
5. CUC não é eficiência de aplicação.
6. Clima de modelo só entra quando explicitamente aprovado pelas regras operacionais.
7. Toda recomendação beta deve ser revisada por responsável técnico antes da operação.

## Critérios de aceitação antes do merge na main
- Project CI verde.
- Climate V2 CI verde.
- Preview Vercel Ready.
- Teste manual do Balanço Hídrico com pelo menos 3 pivôs.
- Um cenário com capacidade de campo confirmada.
- Um cenário com umidade medida.
- Um cenário bloqueado por ausência de clima ou condição inicial.
- Conferência manual de CAD, AFD, ARM, ETc e lâmina recomendada.
- Nenhum resultado antigo visível após erro de recálculo.

## Pendências conhecidas que não impedem beta controlado
- Fazenda Rio do Meio permanece inativa até correção confirmada das coordenadas.
- Climate V2 automático permanece desativado enquanto o endpoint chamado pelo Supabase Cron não retornar JSON da rota de cron; o teste de 29/08 retornou a página de login pelo URL atualmente guardado no Vault.
- Proteção de senha vazada do Supabase deve ser ativada no painel de Auth.
- Avisos de performance de RLS/índices serão tratados após a estabilização funcional.
- Módulos sem dados reais (reservatórios, sensores, casas de bomba e consumo energético) não fazem parte do aceite beta.

## Hardening aplicado
- Funções internas `invalidate_dual*` com SECURITY DEFINER não podem mais ser executadas por `anon` nem `authenticated`; `service_role` mantém execução.

## Status do beta
Branch: `beta/operacao-segura-20260829`

O beta só deve ser promovido para `main` após todos os critérios de aceitação acima passarem.
