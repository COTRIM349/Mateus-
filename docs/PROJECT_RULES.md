# Regras do Projeto — Cotrim Irrigação Pro

## 1. Arquitetura

- **Feature-Based Architecture (Modular):** cada módulo em `modules/<nome>` é independente e possui seus próprios `components/`, `services/`, `hooks/` e `types/`.
- **Nenhum cálculo nas páginas.** Toda regra de negócio deve residir em `services`. As páginas (`app/`) são responsáveis exclusivamente por compor componentes e passar dados.
- Componentes de UI genéricos vivem em `components/ui/` e seguem o Design System definido em `constants/design-system.ts`.
- Componentes de layout (Sidebar, Topbar, PageHeader) vivem em `components/layout/`.
- Tipos de domínio estão centralizados em `types/domain/`.
- Constantes globais estão em `constants/`.
- Utilitários puros (sem estado, sem side-effects) estão em `utils/`.
- Configuração (navegação, feature flags futuras) está em `config/`.

## 2. Dependências entre módulos

- Um módulo pode importar de `types/`, `utils/`, `constants/`, `config/`, `shared/` e `components/ui/`.
- Um módulo **NÃO** pode importar diretamente de outro módulo. Se dois módulos precisam compartilhar algo, o código compartilhado deve ser movido para `shared/`.
- Exceção: o módulo `dashboard` pode importar tipos de outros módulos (não implementações).

## 3. TypeScript

- `strict: true` — sem exceção.
- Toda interface de domínio possui tipagem explícita e documentação de unidade (mm, m³, kWh, R$, ha, etc.).
- Usar `as const` em objetos/constantes imutáveis.
- Evitar `any`. Usar `unknown` quando o tipo não é controlável e refinar com type guard.
- Exportar tipos via barrel files (`index.ts`).

## 4. Nomenclatura

| Elemento | Convenção | Exemplo |
|---|---|---|
| Arquivo de componente | PascalCase | `StatCard.tsx` |
| Arquivo de service | kebab-case | `irrigation.service.ts` |
| Arquivo de hook | camelCase com prefixo `use` | `useDashboardMetrics.ts` |
| Arquivo de tipo | kebab-case | `water-balance.ts` |
| Interface/Type | PascalCase | `PivotIrrigationRecommendation` |
| Função de service | camelCase, prefixo `calculate`/`build`/`generate` | `calculateET0()` |
| Constante global | UPPER_SNAKE_CASE | `STEFAN_BOLTZMANN` |

## 5. Componentes

- Todo componente deve ser o menor possível (Single Responsibility).
- Props devem ser tipadas com interfaces locais ou importadas de `types/`.
- Componentes de UI **nunca** importam dados. Recebem tudo via props.
- Componentes cliente (`"use client"`) devem ser usados apenas quando necessário (estado, eventos, hooks de browser).
- Gráficos são sempre client components; telas e tabelas são server components quando possível.

## 6. Services

- Funções puras: recebem entrada, retornam saída, sem side-effects.
- Toda fórmula agronômica, financeira ou de negócio fica em services.
- Services são testáveis isoladamente (sem dependência de React).
- Cada service documenta a referência técnica da fórmula (FAO-56, Embrapa, etc.).

## 7. Estilo e CSS

- Tailwind CSS via classes utilitárias.
- Cores, tipografia e espaçamento seguem os tokens do Design System (`constants/design-system.ts`).
- Nunca usar valores mágicos de cor/fonte/shadow diretamente no JSX.
- Classes condicionais via função `cn()` de `utils/cn.ts`.

## 8. Qualidade

- Princípios SOLID, Clean Code e DRY.
- Sem código morto, sem variáveis não usadas.
- Sem `console.log` em produção.
- Sem imports desnecessários.

## 9. Git

- Commits em português, prefixados: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- Branch de desenvolvimento conforme definido pela equipe.
- Não misturar refatoração com nova funcionalidade no mesmo commit.

## 10. Performance

- Componentes pesados (gráficos, tabelas grandes) devem usar `React.memo` ou `useMemo` quando justificável.
- Server Components por padrão; Client Components apenas quando necessário.
- Lazy loading para módulos não críticos no carregamento inicial.
