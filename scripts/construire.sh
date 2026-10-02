#!/usr/bin/env bash
# Commande de construction sur Vercel (conception, section 11.4).
#
# La migration precede la construction : si elle echoue, le deploiement
# echoue et la version precedente reste en ligne. Elle ne s'execute QUE pour
# le deploiement de production : un deploiement de previsualisation, construit
# a chaque branche poussee, ne doit jamais modifier la base de production.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "Deploiement de production : application des migrations."
  npx drizzle-kit migrate
else
  echo "Deploiement '${VERCEL_ENV:-local}' : aucune migration appliquee."
fi

npx next build
