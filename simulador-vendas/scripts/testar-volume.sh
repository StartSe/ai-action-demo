#!/bin/sh
set -eu
# Executado durante o build Linux, antes de publicar a imagem.
DATA_DIR="$(mktemp -d /tmp/simulador-volume.XXXXXX)"
export DATA_DIR
trap 'rm -rf -- "$DATA_DIR"' EXIT
node --import tsx scripts/verificar-volume.ts preparar
chown -R 100:101 "$DATA_DIR"
/usr/local/bin/entrada-simulador node --import tsx scripts/verificar-volume.ts verificar
/usr/local/bin/entrada-simulador node --import tsx scripts/verificar-volume.ts verificar
