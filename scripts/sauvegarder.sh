#!/usr/bin/env bash
# Sauvegarde manuelle de la base, a lancer avant toute migration en production
# et la veille de la soutenance.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

mkdir -p sauvegardes
CIBLE="sauvegardes/chantierscope-$(date +%Y-%m-%d-%H%M).sql.gz"

pg_dump "$DIRECT_URL" --no-owner --no-privileges --clean --if-exists | gzip > "$CIBLE"

echo "Sauvegarde ecrite : $CIBLE ($(du -h "$CIBLE" | cut -f1))"
echo
echo "Rappel : une sauvegarde jamais restauree n'est pas une sauvegarde."
echo "Tester la restauration au moins une fois :"
echo "  createdb chantierscope_test && gunzip -c $CIBLE | psql chantierscope_test"
