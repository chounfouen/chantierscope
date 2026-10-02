# ChantierScope

Suivi de l'évolution d'un chantier de génie civil : saisie journalière depuis le
terrain, avancement physique pondéré par le budget, méthode de la valeur acquise,
chemin critique, simulation d'aléa, tableau de bord, analyses, timeline
photographique, plan interactif et rapport hebdomadaire en PDF.

Le jeu de démonstration décrit une résidence de 24 logements R+3 à Abidjan,
six mois après l'ordre de service, en léger retard.

- Conception : [`docs/CONCEPTION.md`](docs/CONCEPTION.md)
- Plan d'implémentation et journal des sprints : [`docs/PLAN.md`](docs/PLAN.md)
- Conventions de code, à lire avant toute modification : [`AGENTS.md`](AGENTS.md)

## Pile

Next.js 16 (App Router, Server Components et Server Actions), React 19,
PostgreSQL 16 avec Drizzle ORM, Auth.js, Tailwind 4, Recharts, Dexie pour la
file hors ligne, `@react-pdf/renderer` pour les rapports. Tests : Vitest et
Playwright. En ligne : Vercel (`fra1`) et Supabase (`eu-central-1`).

## Installation locale

Prérequis : Node.js 22 ou plus, PostgreSQL 16, et pour régénérer le calcul de
référence au tableur, Python 3 avec `openpyxl` et LibreOffice Calc.

```
npm install
cp .env.example .env.local      # puis renseigner les valeurs
createdb chantierscope
createdb chantierscope_test
npm run db:reset                # migrations, peuplement, recalcul
npm run db:check                # 32 vérifications de cohérence
npm run dev
```

Ouvrir http://localhost:3000. Comptes de démonstration, mot de passe commun
`chantier2026` :

| Compte | Rôle |
|---|---|
| `chef@chantierscope.test` | Chef de chantier : saisie journalière |
| `conducteur@chantierscope.test` | Conducteur de travaux : validation, planning, simulation |
| `moe@chantierscope.test` | Maîtrise d'œuvre : lecture, non-conformités |
| `moa@chantierscope.test` | Maître d'ouvrage : lecture, sans coût ni effectif |
| `admin@chantierscope.test` | Administration |

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run verifier` | Typage, lint, absence d'emoji, tests unitaires et d'intégration — avant tout commit |
| `npm run test:e2e` | Construction de production puis parcours Playwright, sur la base de test |
| `npm run db:generate` | Génère une migration depuis `src/db/schema.ts` ; la relire avant de l'appliquer |
| `npm run db:migrate` | Applique les migrations |
| `npm run db:reset` | Base locale reconstruite de zéro ; refuse toute base distante |
| `npm run db:check` | Vérifications de cohérence du jeu de données et de la base |
| `npm run db:recalcul` | Reconstruit le cache dérivé (`recompute`) |
| `npm run db:dump` | Sauvegarde manuelle dans `sauvegardes/` |
| `npm run db:restaurer -- <archive> [base]` | Restaure une sauvegarde dans une base locale |
| `npm run db:verifier-restauration` | Sauvegarde, restaure, compare ligne à ligne, contrôle la copie |
| `npm run reference:tableur` | Régénère le calcul de référence au tableur (`docs/reference/`) |
| `npm run compte:mot-de-passe -- <email>` | Change le mot de passe d'un compte |

## Mise en ligne

L'ordre compte : la base d'abord, l'application ensuite.

### 1. Supabase

1. Créer un projet dans la région `eu-central-1`.
2. Relever les deux chaînes de connexion : le pooler en mode transaction, port
   6543, pour `DATABASE_URL`, et la connexion directe, port 5432, pour
   `DIRECT_URL` (conception, section 11.3).
3. Créer un compartiment de stockage privé `photos`, et relever la clé de
   service.
4. Depuis un poste, avec `DIRECT_URL` pointant sur Supabase dans
   `.env.local` :

   ```
   npm run db:migrate           # schéma, déclencheurs, gel, RLS en refus général
   npm run db:seed              # peuplement UNIQUE : il refuse une base déjà peuplée
   npm run db:recalcul
   npm run db:check
   ```

5. Changer les mots de passe des comptes de démonstration, qui sont publics :
   `npm run compte:mot-de-passe -- conducteur@chantierscope.test`, et ainsi de
   suite.

Aucune modification de structure par l'interface Supabase, jamais
`drizzle-kit push` en production : la base n'est qu'une conséquence du schéma.

### 2. Vercel

1. Importer le dépôt. `vercel.json` fixe la région `fra1`, la commande de
   construction et le cron quotidien de 3 h.
2. Variables d'environnement de production : `DATABASE_URL`, `DIRECT_URL`,
   `AUTH_SECRET` (32 caractères au moins), `AUTH_URL` (adresse publique),
   `CRON_SECRET`, `CHANTIER_LATITUDE`, `CHANTIER_LONGITUDE`, `CHANTIER_FUSEAU`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET_PHOTOS`.
3. La commande de construction, `scripts/construire.sh`, applique les
   migrations avant `next build`, et seulement pour le déploiement de
   production : une prévisualisation de branche ne touche jamais la base.

Le cron nocturne complète la météo, recalcule le cache et garde la base
éveillée : l'offre gratuite suspend une base restée sept jours sans requête.
Vérifier l'état de la base plusieurs jours avant une soutenance.

### 3. Sauvegardes

L'action [`sauvegarde.yml`](.github/workflows/sauvegarde.yml) exporte la base
chaque nuit et conserve l'archive trente jours. Elle attend un secret de dépôt
`DIRECT_URL`. Elle se déclenche aussi à la main, depuis l'onglet Actions : à
faire avant chaque migration de production.

Restaurer une archive téléchargée dans une base locale :

```
npm run db:restaurer -- chantierscope-AAAA-MM-JJ-HHMM.sql.gz chantierscope_restauree
```

## Reprise du projet

- Le noyau de calcul est dans `src/db/compute/` : fonctions pures, testées
  unitairement, sans base ni horloge. Toute règle métier y vit.
- `src/db/recompute.ts` reconstruit tout le cache dérivé à partir de la seule
  source de vérité ; le test de cohérence du cache le garantit.
- Les écrans ne calculent rien : ils lisent les instantanés
  (`src/db/queries/`) et passent par le noyau.
- Les montants sont des entiers de FCFA, les dates de planning des `date`
  sans heure ; tout affichage passe par `src/lib/format.ts`.
- Les couleurs viennent de `src/lib/viz.ts` et `src/lib/etats.ts` ; la palette
  a été validée, la modifier impose une revalidation.
- Le journal de chaque sprint, dans `docs/PLAN.md`, consigne les décisions,
  les défauts trouvés et les limites assumées.

## Licences

Code : voir le dépôt. Police du rapport PDF : Liberation Sans, sous licence
SIL Open Font License 1.1
([`src/services/rapport/polices/LICENCE-Liberation.txt`](src/services/rapport/polices/LICENCE-Liberation.txt)).
