# CLIMA 8 — Orquestrador da Estação Virtual

Objetivo: executar a cadeia climática V2 de forma única e auditável, ainda em Shadow Mode.

Fluxo por estação:

1. sincronizar providers habilitados em paralelo e tolerar falha parcial;
2. identificar intervalos de 30 min dentro de uma janela operacional limitada;
3. gerar consenso CLIMA 6 usando o candidato mais recente de cada provider;
4. calcular ETo CLIMA 7 sobre o consenso mais recente;
5. persistir status, duração, disponibilidade e distribuição de confiança do ciclo.

Princípios:

- uma falha de provider não cancela os outros;
- não chamar endpoints HTTP internos: importar os services diretamente;
- não recalcular todo o horizonte de previsão em cada execução;
- nenhum resultado alimenta `weather_readings` ou `water_balances`;
- cron usa cliente Supabase server-only com service role e rota protegida por `CRON_SECRET`;
- execução manual autenticada continua disponível para validação antes de ativar cron de produção.
