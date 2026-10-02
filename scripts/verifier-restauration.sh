#!/usr/bin/env bash
# Preuve de restauration : « une sauvegarde jamais restauree n'est pas une
# sauvegarde » (conception, 11.12).
#
# Sauvegarde la base locale, la restaure dans une base neuve, puis compare
# les deux table par table, contenu compris, et passe `db:check` sur la copie.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.local; set +a

bash scripts/sauvegarder.sh | head -1
ARCHIVE="$(ls -t sauvegardes/*.sql.gz | head -1)"
BASE=chantierscope_restauration
bash scripts/restaurer.sh "$ARCHIVE" "$BASE"
COPIE="${DIRECT_URL%/*}/$BASE"

# Empreinte de chaque table : toutes les lignes, dans un ordre canonique.
empreintes() {
  psql "$1" -At -c "select string_agg(format('select %L || '':'' || count(*) || '':'' || coalesce(md5(string_agg(t::text, ''|'' order by t::text)), ''-'') from %I.%I t', n.nspname || '.' || c.relname, n.nspname, c.relname), ' union all ' order by n.nspname, c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'drizzle')" \
  | psql "$1" -At
}

diff <(empreintes "$DIRECT_URL") <(empreintes "$COPIE") > /dev/null \
  && echo "Contenu identique : $(empreintes "$COPIE" | wc -l) tables comparees ligne a ligne." \
  || { echo "ECHEC : la copie differe de l'original."; diff <(empreintes "$DIRECT_URL") <(empreintes "$COPIE"); exit 1; }

DATABASE_URL="$COPIE" DIRECT_URL="$COPIE" npx tsx src/db/verifier.ts | tail -1
