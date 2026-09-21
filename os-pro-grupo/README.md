# OS pro Grupo

App independente: tira foto da Ordem de Serviço → gera um relatório pronto para
o grupo do WhatsApp. Roda como site estático + uma função serverless que lê a
foto com a API da Anthropic (Claude). Quem usa **não precisa** de login no Claude.

## Estrutura

- `index.html` — a tela (câmera/galeria, lote de OS, relatório, copiar/WhatsApp).
- `api/ler-os.js` — função serverless que recebe a foto e devolve os campos da OS.
- `package.json` — dependência `@anthropic-ai/sdk`.

## Como colocar no ar (Vercel)

1. Suba esta pasta para um repositório no GitHub (já feito, se você recebeu o link).
2. Em https://vercel.com → **Add New… → Project** → importe este repositório.
3. Em **Environment Variables**, adicione:
   - `ANTHROPIC_API_KEY` = sua chave da Anthropic (obrigatória).
   - `ANTHROPIC_MODEL` = `claude-sonnet-5` (opcional; troque por `claude-haiku-4-5`
     para reduzir o custo por foto, ou `claude-opus-5` para máxima precisão).
4. **Deploy**. Ao final, o Vercel te dá um link `https://<seu-projeto>.vercel.app`.
5. Abra o link no celular e use. Compartilhe o link com a equipe.

## Chave da Anthropic

Crie em https://console.anthropic.com → **API Keys**. O custo é por foto lida
(centavos ou menos, conforme o modelo). Mantenha a chave **só no Vercel** —
ela nunca fica no navegador de quem usa.

## Rodar localmente (opcional)

```
npm install
npx vercel dev
```
(Requer a CLI da Vercel e a variável `ANTHROPIC_API_KEY` no ambiente.)
