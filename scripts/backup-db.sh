#!/bin/sh
set -e
# Simple backup: copy DB with timestamp
DB_PATH="${1:-./avaliacoes.db}"
OUT_DIR="${2:-./backups}"
mkdir -p "$OUT_DIR"
TS=$(date -u +"%Y%m%dT%H%M%SZ")
cp "$DB_PATH" "$OUT_DIR/avaliacoes.db.$TS"
echo "Backup criado: $OUT_DIR/avaliacoes.db.$TS"
