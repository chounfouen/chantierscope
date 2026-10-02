#!/usr/bin/env bash
# Restauration d'une sauvegarde dans une base LOCALE (conception, 11.12).
#
#   bash scripts/restaurer.sh sauvegardes/chantierscope-AAAA-MM-JJ-HHMM.sql.gz [base]
#
# La base cible est detruite puis recreee. Refus de toute cible distante : on
# restaure pour verifier, ou pour reprendre en local, jamais par dessus la
# production depuis ce script.
set -euo pipefail

ARCHIVE="${1:?Archive de sauvegarde attendue en premier argument.}"
BASE="${2:-chantierscope_restauration}"
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

# Serveur local tire de DIRECT_URL, base remplacee par la cible.
SERVEUR="${DIRECT_URL%/*}"
case "$SERVEUR" in
  *@localhost*|*@127.0.0.1*) ;;
  *) echo "Refus : la restauration ne vise qu'un serveur local."; exit 1 ;;
esac

psql "$SERVEUR/postgres" -q -c "drop database if exists \"$BASE\"" -c "create database \"$BASE\""
gunzip -c "$ARCHIVE" | psql "$SERVEUR/$BASE" -q -v ON_ERROR_STOP=1 > /dev/null
echo "Restauree dans $BASE : $SERVEUR/$BASE"
