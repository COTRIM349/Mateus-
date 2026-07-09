# Sistema de Fertirrigação em Caixas — Pivô Central

Projeto **simples, técnico e operacionalmente viável** de um sistema de preparo,
diluição, recirculação e injeção de fertilizante via irrigação, com **autonomia
de aproximadamente 7 horas**.

> **Desenho 3D interativo:** abra [`index.html`](./index.html) no navegador.
> Alterne entre **Opção 1 (1 caixa)** e **Opção 2 (2 caixas)** e veja as vazões
> se ajustarem automaticamente.

## Opções de montagem

| Item | Opção 1 — 1 caixa | Opção 2 — 2 caixas (paralelo) |
|---|---|---|
| Volume de calda | 10.000 L | 20.000 L |
| Autonomia alvo | ≈ 7 h | ≈ 7 h |
| Vazão média | 1.428 L/h · 23,8 L/min · 0,39 L/s | 2.857 L/h · 47,6 L/min · 0,79 L/s |
| Operação | conjunto único | só Cx1 · só Cx2 · ambas · 1 opera / 1 limpa |

> Base do cálculo: `10.000 L ÷ 7 h = 1.428 L/h` e `20.000 L ÷ 7 h = 2.857 L/h`.
> A **vazão é regulável** — ajuste a bomba conforme dose do produto, área do
> pivô, tempo de aplicação e volume de calda. Os números são a referência média.

## Código de cores

- 🔵 **Azul** — água limpa (abastecimento, pressurização, lavagem)
- 🟢 **Verde** — calda / fertilizante (sucção, injeção, recirculação)
- ⚪ **Cinza** — tubulação e concreto
- 🔴 **Vermelho** — válvula de retenção / segurança
- 🟡 **Amarelo** — pontos de atenção (injeção, nível, dreno)

## Componentes principais

Cada caixa: tampa de inspeção, entrada superior de água, escala de nível,
saída inferior com registro, dreno inferior, respiro, linha de recirculação e
identificação visual.

Linha de processo: **coletor de sucção → registro → filtro → bomba dosadora →
medidor de vazão → manômetro → válvula de retenção → registro de bloqueio →
ponto de injeção** na linha principal do pivô. Ramais de **recirculação** (com
registro próprio) e de **água limpa** para lavagem.

## Sequência operacional

1. Abastecer a caixa com parte da água.
2. Adicionar o fertilizante aos poucos (nunca concentrado direto na linha).
3. Completar o volume de água.
4. Acionar a recirculação para misturar bem.
5. Ligar o pivô apenas com água e pressurizar a linha.
6. Iniciar a injeção da calda somente após pressurizado.
7. Regular a bomba para aplicar o volume em ~7 h.
8. Ao acabar a calda, continuar irrigando com água limpa para lavar a linha.
9. Lavar caixa, filtro, bomba e tubulações.

## Cuidados com concentração e diluição

Pré-diluir na caixa, manter a calda em movimento (recirculação) para evitar
decantação, filtrar antes da bomba, evitar aplicação concentrada no início/fim
e lavar toda a tubulação com água limpa ao final.
