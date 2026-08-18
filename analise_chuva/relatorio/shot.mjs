import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [tema, sufixo] of [['light','claro'], ['dark','escuro']]) {
  const p = await b.newPage({ viewport: { width: 1180, height: 1200 }, colorScheme: tema });
  const erros = [];
  p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
  await p.goto('file:///home/user/Mateus-/analise_chuva/relatorio/relatorio_chuva.html');
  await p.waitForTimeout(1500);
  console.log(tema, 'erros:', erros.length ? erros : 'nenhum');
  const alt = await p.evaluate(() => document.body.scrollHeight);
  console.log(tema, 'altura:', alt, '| overflow horizontal:',
    await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
  await p.screenshot({ path: `shot-${sufixo}-full.png`, fullPage: true });
  for (const [nome, sel] of [['cal','#cal'],['resid','#ch-resid'],['avanco','#ch-avanco'],['prod','#ch-prod']]) {
    const e = await p.$(sel);
    if (e) await e.screenshot({ path: `shot-${sufixo}-${nome}.png` });
  }
  await p.close();
}
await b.close();
