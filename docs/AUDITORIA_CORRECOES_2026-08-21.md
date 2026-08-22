# Auditoria e correções — 21/08/2026

## Escopo
Correção estrutural do motor hídrico, clima operacional, mapa, cadastro pivô/parcela, segurança do Supabase e CI.

## Regras adotadas
- Pivô é equipamento; cultura/cultivar/safra pertencem à parcela.
- CUC é uniformidade e não substitui eficiência de aplicação (Ea).
- ARM é contínuo e não pode reiniciar arbitrariamente por janela de interface.
- Primeiro dia sem balanço anterior exige condição inicial confiável.
- Ausência de ETo/chuva aprovada nunca é convertida silenciosamente em zero.
- Chuva diária entra no balanço físico; excesso acima da CAD é drenagem/escoamento.
- Mapa hídrico usa seis níveis: azul, verde escuro, verde claro, laranja, vermelho e preto.

## Alterações principais
1. Motor hídrico V2 com seed de ARM/CAD anterior e inicialização por umidade cadastrada.
2. Hook do mapa usa somente clima operacionalmente aprovado e exige continuidade do balanço.
3. Chuva diária deixou de usar a equação mensal USDA-SCS como redução diária.
4. Criado `pivots.application_efficiency`; `cuc` permanece separado.
5. `pivots.culture_id` foi neutralizado e bloqueado no banco.
6. Parcela futura não pode permanecer em manejo ativo.
7. Views operacionais convertidas para `security_invoker`.
8. Funções críticas ganharam `search_path` fixo e RPC anônimo foi reduzido.
9. Índices adicionados em FKs operacionais críticas.
10. CI global criada para TypeScript, lint, testes e build.

## Pendências que devem bloquear merge se a CI falhar
- Nenhum erro TypeScript.
- Nenhum teste legado dependente do antigo motor.
- Build Next.js deve concluir.
- Dados climáticos reais precisam ser aprovados antes de produzir recomendação operacional.
- Fichas antigas com Ea inválida/nula devem aparecer como incompletas, nunca receber valor inventado.
