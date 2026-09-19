#!/bin/sh
set -eu
DATA_DIR="${DATA_DIR:-/app/data}"
export DATA_DIR
# Não permitir que um DATA_DIR inválido altere os arquivos da aplicação ou do sistema.
case "$DATA_DIR" in /*) ;; *) echo "DATA_DIR deve ser um diretório absoluto do volume." >&2; exit 1 ;; esac
DATA_DIR="$(realpath -m -- "$DATA_DIR")"
case "$DATA_DIR" in /|/app|/etc|/usr|/var|/home|/tmp) echo "DATA_DIR deve apontar para o diretório de dados, não para uma raiz do sistema." >&2; exit 1 ;; esac
if [ "$(id -u)" = "0" ]; then
  mkdir -p -- "$DATA_DIR"
  # Mantém o conteúdo e os modos dos arquivos. Não segue links para fora do volume.
  chown -hR app:app -- "$DATA_DIR"
  exec gosu app "$0" "$@"
fi
if [ ! -r "$DATA_DIR" ] || [ ! -w "$DATA_DIR" ] || [ ! -x "$DATA_DIR" ]; then
  echo "Sem acesso ao volume de dados. Corrija seu proprietário antes de iniciar." >&2
  exit 1
fi
if [ -e "$DATA_DIR/chave-mestra" ] && [ ! -r "$DATA_DIR/chave-mestra" ]; then
  echo "A chave mestra existe, mas está inacessível. Ela foi preservada; corrija as permissões." >&2
  exit 1
fi
exec "$@"
