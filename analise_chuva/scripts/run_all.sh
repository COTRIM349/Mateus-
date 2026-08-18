#!/usr/bin/env bash
# Pipeline completo. Executar de qualquer diretorio.
set -e
cd "$(dirname "$0")"
for s in 01_etl 02_auditoria 03_valida_ausentes 04_serie_diaria 05_calibracao 05b_testes \
         06_diagnostico 08_motor 09_cenarios 10_cenarios_v2 11_soja 12_consolida \
         13_produtividade 14_excel 15_dados_web; do
  echo ">>> $s"
  python3 "$s.py" > "../saidas/log_$s.txt" 2>&1 || { echo "FALHOU: $s"; tail -20 "../saidas/log_$s.txt"; exit 1; }
done
echo "OK — planilha e payload gerados."
