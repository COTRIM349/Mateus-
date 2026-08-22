# Status das sprints de correção

## Concluído no código/banco
- ARM contínuo com seed do balanço anterior.
- Inicialização explícita pela condição de umidade da parcela.
- Clima operacional sem fallback silencioso para zero.
- Balanço diário de chuva limitado pela CAD.
- Separação CUC x eficiência de aplicação.
- Escala hídrica de seis níveis.
- Pivô sem cultura direta.
- Parcela futura removida do manejo ativo.
- Motor legado redirecionado para V2.
- Views Supabase como security_invoker.
- search_path fixo nas funções críticas.
- Índices operacionais prioritários.
- CI geral do projeto.

## Validação antes do merge
A branch não deve ser integrada à main enquanto TypeScript, lint, testes e build não estiverem verdes. Erros detectados pela CI devem ser corrigidos na própria branch.
