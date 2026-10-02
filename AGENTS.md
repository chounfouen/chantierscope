<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# ChantierScope — conventions du projet

Suivi de l'evolution d'un chantier de genie civil. Voir `docs/CONCEPTION.md`
pour la conception et `docs/PLAN.md` pour le plan d'implementation. Le plan est
la reference : suivre l'ordre des sprints, ne pas anticiper.

## Regles non negociables

- **Langue** : tout est en francais — identifiants, commentaires, libelles,
  messages de commit. Les identifiants de code sont sans accent, les libelles
  affiches sont accentues.
- **Aucun emoji**, nulle part. L'iconographie passe par `src/lib/icones.ts`
  (Lucide). `npm run lint:emoji` le verifie.
- **Montants** : entiers de FCFA, `bigint` en base en mode numerique. Jamais de
  flottant, jamais de decimale. Affichage uniquement par `src/lib/format.ts`.
- **Dates** : `date` pour le planning (sans heure ni fuseau), `timestamptz`
  pour les instants reels. Ne jamais melanger.
- **Couleurs** : jamais d'hexadecimal en dur dans un composant. Les teintes de
  serie viennent de `src/lib/viz.ts`, les etats de `src/lib/etats.ts`. La
  palette a ete validee contre les surfaces reelles ; toute modification
  impose une revalidation.
- **Environnement** : jamais de `process.env` direct. Passer par
  `src/lib/env.ts`.
- **Schema de base** : modifier `src/db/schema.ts`, generer une migration, la
  relire, l'appliquer. Jamais `drizzle-kit push` hors base locale jetable.
  Jamais de modification par une interface graphique.
- **Donnees derivees** : tout cache doit etre reconstructible integralement par
  `recompute()` a partir de la seule source de verite.
- **Ordre de travail** : les calculs avant l'interface. Le noyau de
  `src/db/compute/` est teste unitairement avant tout ecran qui l'affiche.

## Commandes

```
npm run dev          serveur de developpement
npm run verifier     typecheck + lint + emoji + tests — a lancer avant commit
npm run test:e2e     construction puis parcours Playwright, sur la base de test
npm run db:generate  genere une migration depuis le schema
npm run db:migrate   applique les migrations
npm run db:studio    explorateur de base
npm run db:dump      sauvegarde manuelle
```

## Base locale

PostgreSQL 16 local, base `chantierscope`, identifiants dans `.env.local`
(jamais versionne). En developpement `DATABASE_URL` et `DIRECT_URL` sont
identiques ; en production la premiere passe par le pooler Supabase.
