# ChantierScope — Plan d'implementation

Document de pilotage. Il raffine la section 9 de `CONCEPTION.md` en decoupage
executable : un sprint 0 de fondations puis huit sprints, chacun avec ses
livrables, ses fichiers, ses commandes et son critere d'achevement verifiable.

Devise : FCFA (XOF). Icones : Lucide React, aucun emoji.

---

## Etat de l'environnement

Verifie le 30 septembre 2026 sur la machine de developpement.

| Element | Etat |
|---|---|
| PostgreSQL | 16.15, local, port 5432, role `james` avec `CREATEDB` |
| Base de developpement | `chantierscope`, creee |
| Node | 24.14.1 |
| npm | 11.11.0 |
| `psql` / `pg_dump` | presents dans le PATH |
| Depot Git | initialise, branche `main` |
| Next.js | **16.3.7** et non 15 — voir la note ci-dessous |
| React | 19.1 |
| Vulnerabilites de production | aucune (`npm audit --omit=dev`) |

### Note : Next.js 16 au lieu de 15

Le plan initial prevoyait Next.js 15. L'installation a fait apparaitre un
avis de securite de gravite haute sur `postcss`, transitif de Next 15, dont la
correction impose Next 16. Le passage a ete fait au sprint 0, alors qu'aucune
ligne de code metier n'existait, donc a cout nul ; le report aurait impose une
migration en fin de projet. `npm audit --omit=dev` ne remonte plus aucune
vulnerabilite.

Consequence a retenir : Next 16 introduit des ruptures d'API par rapport a
Next 15. Le fichier `AGENTS.md` genere a la racine renvoie vers
`node_modules/next/dist/docs/`, a consulter avant d'ecrire un gestionnaire de
route ou une Server Action.

Consequence : pas de Docker. En developpement, la connexion est directe, donc
`DATABASE_URL` et `DIRECT_URL` pointent vers la meme base. La distinction ne
prend son sens qu'en production, ou `DATABASE_URL` passe par le pooler
Supabase sur le port 6543. Le code doit lire les deux variables des le depart,
pour que le passage en production ne demande aucune modification.

---

## Regles de travail

### Definition de fini

Une tache n'est finie que si les cinq conditions sont reunies.

1. Le code compile sans erreur en TypeScript strict.
2. Aucun avertissement ESLint.
3. Les tests unitaires concernes passent.
4. Le critere d'achevement du sprint est demontrable a l'ecran ou en console.
5. Le commit est fait, avec un message decrivant l'effet et non l'action.

### Git

Une branche par sprint, `sprint-1-schema`, `sprint-2-calculs`, et ainsi de
suite. Fusion dans `main` a la fin du sprint, apres verification du critere
d'achevement. `main` doit rester deployable en permanence.

Messages de commit en francais, a l'imperatif, sans prefixe technique :
`Ajoute le calcul du chemin critique`, pas `feat(cpm): add`.

### Ordre non negociable

Les calculs avant l'interface. Les sprints 2 et 3 produisent des fonctions
pures et des requetes testees, sans une ligne d'interface. C'est
contre-intuitif mais c'est ce qui evite le piege classique : une belle
interface affichant des chiffres faux, impossible a corriger parce que la
logique est diluee dans les composants.

### Ce qui n'est pas dans le perimetre

A ecrire noir sur blanc pour ne pas y deriver : pas de gestion de facturation
ni de situations de travaux, pas de gestion documentaire contractuelle, pas de
module de securite et prevention, pas d'application mobile native, pas de
multi-entreprise, pas de visionneuse IFC. Ces sujets sont mentionnes en
perspectives dans le memoire.

---

## Sprint 0 — Fondations

Objectif : un projet qui demarre, se connecte a la base, et impose ses
conventions. Aucune fonctionnalite metier.

### Taches

1. Initialiser Next.js 15, App Router, TypeScript strict, Tailwind CSS 4.
   Desactiver Turbopack si instable, ce n'est pas le moment de deboguer
   l'outillage.
2. Configurer `tsconfig.json` en strict integral : `strict`,
   `noUncheckedIndexedAccess`, `noImplicitOverride`,
   `exactOptionalPropertyTypes`. Plus penible au debut, beaucoup moins de bugs
   sur les calculs ensuite.
3. ESLint et Prettier, avec une regle interdisant `any` implicite et une regle
   interdisant les caracteres emoji dans le code source.
4. Installer les dependances : `drizzle-orm`, `postgres`, `drizzle-kit`, `zod`,
   `lucide-react`, `date-fns`, `recharts`, `next-auth@beta`, `vitest`.
5. Initialiser shadcn/ui et importer les primitives utiles : `button`, `card`,
   `table`, `dialog`, `form`, `input`, `select`, `tabs`, `badge`, `tooltip`,
   `progress`, `sheet`, `skeleton`.
6. Variables d'environnement : `.env.local` renseigne avec les identifiants de
   la base locale, `.env.example` sans aucune valeur secrete, `.gitignore`
   couvrant `.env*.local`.
7. `drizzle.config.ts` pointant sur `DIRECT_URL`.
8. Utilitaires de formatage : `fcfa()`, `pourcent()`, `jours()`,
   `dateCourte()`, `dateLongue()`. Un seul endroit pour tout affichage de
   montant ou de date.
9. Jeton de theme : palette, mode clair et sombre, echelle typographique.
   Definir des a present les six couleurs d'etat qui serviront partout :
   non commence, en cours, acheve, en retard, critique, non travaille.
10. Table de correspondance des icones, dans un module unique
    `src/lib/icones.ts`, pour garantir qu'une notion a toujours la meme icone.
11. `git init`, premier commit.

### Fichiers produits

```
package.json  tsconfig.json  next.config.ts  eslint.config.mjs
drizzle.config.ts  .env.local  .env.example  .gitignore
src/app/layout.tsx  src/app/page.tsx  src/app/globals.css
src/lib/format.ts  src/lib/icones.ts  src/lib/theme.ts
```

### Critere d'achevement

`npm run dev` sert une page. `npm run lint` et `npx tsc --noEmit` passent sans
sortie. `psql` confirme la connexion a `chantierscope` depuis les variables
d'environnement du projet.

---

## Sprint 1 — Schema et jeu de donnees

Objectif : la base contient un chantier complet, realiste et reproductible.
C'est le sprint le plus determinant : tout le reste s'appuie dessus.

### Taches

1. Enumerations PostgreSQL : `role_utilisateur`, `unite_mesure`,
   `methode_avancement`, `type_liaison`, `statut_releve`, `type_alea`,
   `statut_alea`, `type_ressource`, `unite_cout`.
2. Les seize tables de la section 3 de `CONCEPTION.md`, dans
   `src/db/schema.ts`, avec les types exacts : `bigint` en mode numerique pour
   les montants, `numeric(14,3)` pour les quantites, `date` pour le planning,
   `timestamptz` pour les evenements.
3. Contraintes : index unique partiel sur le releve actif par lot et par jour,
   verifications de positivite, coherence des dates, interdiction de la liaison
   reflexive.
4. Regles de suppression explicites sur chaque cle etrangere, selon le tableau
   de la section 11.6.
5. Les sept index de la section 11.11.
6. Migration initiale `0000_init.sql`, relue ligne par ligne.
7. Migration manuelle `0001_audit.sql` : fonction PL/pgSQL `tracer_modification`
   et declencheurs sur les quatre tables auditees. Ecrite a la main, Drizzle ne
   genere pas de declencheurs.
8. Generateur pseudo-aleatoire a graine fixe, algorithme mulberry32, dans
   `src/db/seed/alea.ts`. Aucun appel a `Math.random` dans le peuplement.
9. Peuplement, en modules separes et dans cet ordre :
   - `utilisateurs.ts` — cinq comptes, un par role, mots de passe hashes
   - `projet.ts` — les 24 logements, 2 100 000 000 FCFA, ordre de service au
     6 janvier 2025, penalite d'un millieme par jour
   - `lots.ts` — huit lots avec leur budget et leur teinte
   - `planning.ts` — environ 60 taches en WBS a trois niveaux, 80 liaisons de
     types varies, six jalons dont quatre contractuels
   - `quantitatif.ts` — lignes de quantitatif avec unites et prix unitaires
     coherents avec le marche ivoirien
   - `meteo.ts` — recuperation Open-Meteo pour Abidjan sur la periode, mise en
     cache dans un fichier JSON pour que le peuplement reste hors ligne
   - `releves.ts` — six mois de releves journaliers, effectifs, quantites,
     avec la derive volontaire de douze jours sur le gros oeuvre
   - `aleas.ts` — la serie d'intemperies de juin et la rupture
     d'approvisionnement en acier, plus quelques non-conformites
   - `zones.ts` — decoupage en zones avec contours SVG, quatre niveaux
   - `photos.ts` — quatre points de vue, huit dates chacun, images generees
10. Scripts npm : `db:generate`, `db:migrate`, `db:seed`, `db:reset`,
    `db:studio`, `db:dump`.
11. Script de verification `db:check` : compte les lignes de chaque table,
    verifie que la somme des budgets de lots egale le montant du marche, que
    tout releve valide porte un validateur, qu'aucune quantite cumulee ne
    depasse anormalement le prevu, et que le graphe des liaisons est acyclique.

### Points d'attention

La derive de douze jours ne doit pas etre ecrite en dur comme un decalage de
dates. Elle doit **emerger** des donnees : des quantites journalieres
inferieures au rythme necessaire, plus des journees non travaillees pour
intemperie. Sinon les indicateurs calcules ne correspondront pas a l'histoire
racontee, et la demonstration sera incoherente.

Les prix unitaires doivent etre plausibles pour le contexte ivoirien : beton
dose a 350 autour de 110 000 FCFA le metre cube, acier autour de 900 000 FCFA
la tonne, coffrage autour de 9 000 FCFA le metre carre. Un correcteur du
domaine le verra immediatement.

### Critere d'achevement

`npm run db:reset` s'execute sans erreur en moins de trente secondes.
`npm run db:check` affiche un rapport entierement vert. Deux executions
successives de `db:reset` produisent des donnees identiques, verifiable par
comparaison de deux `pg_dump`.

---

## Sprint 2 — Noyau de calcul

Objectif : toute la logique metier, en fonctions pures, testee, sans base de
donnees ni interface. C'est le coeur scientifique du projet et la matiere
principale du memoire.

### Taches

1. `compute/avancement.ts` — les quatre methodes d'avancement, le plafonnement
   a 100 pour cent par le minimum, et l'agregation ponderee par le budget.
2. `compute/cpm.ts` — tri topologique avec detection de cycle, passe avant,
   passe arriere, marge totale, marge libre, marquage des taches critiques.
   Gestion des quatre types de liaison et des decalages negatifs.
3. `compute/evm.ts` — les treize indicateurs, plus la lecture horizontale de la
   courbe en S pour l'ecart de delai en jours, plus la penalite en FCFA.
4. `compute/meteo.ts` — application des seuils par nature de tache, production
   de la liste des journees non travaillables avec leur cause.
5. `compute/simulation.ts` — clonage du graphe en memoire, application d'un
   decalage, relance du CPM, comparaison a la reference, jalons impactes.
6. `compute/calendrier.ts` — jours ouvrables, jours feries ivoiriens, conversion
   entre duree calendaire et duree ouvrable.

### Tests

Ce sprint est le seul ou les tests precedent le code, car les valeurs attendues
viennent d'un calcul manuel independant.

- Un sous-graphe de dix taches, calcule a la main sur papier : dates au plus
  tot, au plus tard, marges, chemin critique. Ce cas devient une figure du
  memoire.
- Detection de cycle sur un graphe volontairement circulaire.
- Les quatre types de liaison, avec decalage positif et negatif.
- Agregation : deux taches de meme duree et de budgets tres differents, pour
  demontrer l'ecart entre ponderation budgetaire et ponderation par duree.
  C'est le contre-exemple chiffre annonce dans la section 10.
- EVM a une date donnee, valeurs attendues calculees au tableur.
- Depassement de quantite : l'avancement reste a 100 pour cent et un ecart de
  quantitatif est signale.
- Chaque seuil meteo, a la valeur limite et de part et d'autre.

### Critere d'achevement

`npm run test` vert. Le cas du sous-graphe de dix taches produit exactement les
valeurs calculees a la main. Couverture superieure a 90 pour cent sur le
dossier `compute/`, mesuree, pas estimee.

---

## Sprint 3 — Persistance et recalcul

Objectif : brancher le noyau de calcul sur la base, avec un recalcul fiable et
un cache coherent.

### Taches

1. `db/index.ts` — client Drizzle, `prepare: false`, `max: 1`,
   `casing: 'snake_case'`.
2. `db/queries/` — lectures typees : chargement du graphe de planning complet
   d'un projet en une requete, cumuls de quantites par ligne en une requete
   agregee, lecture des instantanes pour la courbe en S.
3. `db/mutations/` — ecritures transactionnelles, avec `SET LOCAL app.user_id`
   en tete de transaction pour alimenter l'audit.
4. `recompute.ts` — la fonction centrale. Reconstruit depuis la seule source de
   verite : avancement des taches, marges et criticite par le CPM, puis les
   instantanes journaliers. Accepte un projet et une date de depart.
5. `validerReleve()` — validation idempotente par filtre sur le statut, suivie
   du recalcul, le tout dans une seule transaction.
6. Route de cron `app/api/cron/nuit/route.ts` — releve meteo du jour, recalcul
   complet, et requete triviale de maintien en eveil de la base.

### Tests

- Test d'integration sur la base locale : peuplement, recalcul complet,
  comparaison des instantanes a des valeurs de reference.
- Test d'idempotence : deux recalculs consecutifs produisent des instantanes
  identiques.
- Test de coherence du cache : recalcul incremental apres validation d'un
  releve, compare a un recalcul integral depuis zero. Les deux doivent
  concorder exactement. C'est le test qui protege l'invariant de la
  section 11.5.
- Test de double validation : le second appel ne modifie rien.

### Critere d'achevement

Le test de coherence du cache passe. Le recalcul integral du projet de
demonstration prend moins de deux secondes. `db:check` reste vert apres
recalcul.

---

## Sprint 4 — Authentification et coquille applicative

Objectif : une application navigable, avec des roles effectifs et les ecrans de
lecture pure.

### Taches

1. Auth.js v5 en mode identifiants, sessions JWT, les cinq roles.
2. La fonction garde `exiger(projetId, ...roles)`, appelee en tete de chaque
   Server Action et de chaque page protegee.
3. Mise en page : barre laterale de navigation, fil d'Ariane, selecteur de
   projet, indicateur du role actif, mode clair et sombre.
4. Ecran de connexion, avec les cinq comptes de demonstration rappeles en
   developpement uniquement.
5. Vue projet, en lecture : identite du marche, montants, dates
   contractuelles, liste des lots avec leur avancement.
6. Vue lot : tableau du quantitatif, prevu, realise, reste a faire, avancement,
   montants, valeur acquise, totaux.
7. Masquage par role : le role `MOA` recoit une requete qui ne selectionne
   jamais les colonnes de cout interne ni les effectifs.
8. Etats vides, etats de chargement par `Suspense` et squelettes, pages
   d'erreur.

### Tests

- Un test par role verifiant l'acces autorise et l'acces refuse.
- Un test verifiant qu'une reponse destinee au role `MOA` ne contient aucune
  cle de cout interne, en inspectant la charge utile serialisee et non
  l'affichage.

### Critere d'achevement

Les cinq comptes se connectent et voient exactement ce que la matrice de droits
prevoit. Le test de non-fuite pour le role `MOA` passe.

---

## Sprint 5 — Saisie journaliere

Objectif : l'ecran le plus utilise du chantier, utilisable sur telephone et
sans reseau.

### Taches

1. Formulaire en etapes, une colonne, champs larges, conception mobile
   d'abord : date et lot, meteo, effectifs et heures, quantites du jour,
   photos, observations, alea eventuel, envoi.
2. Schemas Zod partages entre le client et le serveur, un seul schema par
   etape.
3. Prechargement de la meteo depuis Open-Meteo, avec correction manuelle
   possible et conservation de la valeur corrigee.
4. Saisie des quantites : rappel de la quantite prevue et du cumul deja
   realise, alerte immediate en cas de depassement, saisie au clavier numerique.
5. Photos : compression WebP dans le navigateur, longueur maximale 1600 pixels,
   qualite 0,8, generation de la vignette, envoi par URL signee.
6. Declaration d'alea depuis le releve, avec type, gravite et impact estime.
7. Circuit de validation : brouillon, soumis, valide, rectifie. Gel du releve
   valide, correction par releve rectificatif trace.
8. Mode hors ligne : service worker, file d'attente dans IndexedDB par Dexie,
   synchronisation au retour du reseau, indicateur d'etat visible, resolution
   des conflits par la contrainte d'unicite du releve actif.
9. Journal de chantier : liste chronologique des releves, filtres par lot et
   par periode, acces au detail.

### Tests

- Parcours Playwright complet de saisie et de validation.
- Parcours en viewport telephone.
- Test hors ligne : coupure reseau simulee, deux saisies en file, retour du
  reseau, verification des deux releves en base.
- Test de conflit : deux saisies concurrentes sur le meme lot et le meme jour,
  la seconde doit etre refusee proprement avec un message explicite.

### Critere d'achevement

Une saisie faite en mode avion apparait en base apres retour du reseau. Un
releve valide ne peut plus etre modifie. L'avancement du projet bouge
immediatement apres validation.

---

## Sprint 6 — Planning, Gantt et simulation

Objectif : le morceau technique de reference, developpe sur mesure.

### Taches

1. Composant Gantt en SVG : arborescence WBS repliable a gauche, echelle de
   temps a droite, virtualisation verticale au-dela de cent lignes.
2. Zoom par palier : jour, semaine, mois, trimestre, avec conservation du
   centrage temporel au changement de palier.
3. Barres : prevue en fond, avancement reel superpose plus fin, marge totale en
   trait, teinte du lot.
4. Chemin critique souligne, liaisons en polylignes orthogonales avec
   evitement des chevauchements.
5. Jalons en losanges, contractuels en plein, internes en contour, avec leur
   date reelle quand elle existe.
6. Ligne du jour, colonnes grisees sur les journees non travaillables avec la
   cause en infobulle.
7. Infobulle de tache : dates au plus tot et au plus tard, marges, avancement,
   budget, valeur acquise.
8. Edition du planning : modification des dates et des durees, creation et
   suppression de liaisons, avec refus explicite en cas de cycle detecte et
   nommage des taches fautives.
9. Glisser-deposer d'une barre : ouvre la simulation, n'ecrit rien avant
   confirmation.
10. Ecran de simulation : formulaire de scenario, superposition des deux Gantt,
    nouvelle date de fin, jalons menaces, penalite en FCFA, enregistrement du
    scenario.

### Tests

- Rendu du Gantt sur le projet de demonstration, comparaison du chemin critique
  a la sortie des tests du sprint 2.
- Refus d'une liaison creant un cycle.
- Simulation d'un glissement de dix jours sur les fondations : verification
  manuelle de la date de fin et de la penalite.
- Performance : rendu sous 500 millisecondes avec 200 taches.

### Critere d'achevement

Le chemin critique affiche est conforme au calcul manuel du sprint 2. Une
simulation produit une date de fin et une penalite verifiables a la main.

---

## Sprint 7 — Tableau de bord et analyses

Objectif : la synthese decisionnelle, et les courbes qui feront la soutenance.

### Taches

1. Bandeau de quatre indicateurs, avec tendance sur trente jours.
2. Ligne budgetaire : marche, valeur acquise, cout reel, cout estime final.
3. Courbe en S : valeur planifiee, valeur acquise, cout reel, projection en
   pointille au-dela du jour, et lecture de l'ecart horizontal en jours.
4. Avancement par lot : barres prevu et realise superposees, ecart chiffre.
5. Panneau d'alertes, trie par criticite, avec regles explicites : tache
   critique en retard, jalon contractuel menace, non-conformite ouverte depuis
   plus de sept jours, releve non valide depuis plus de trois jours,
   depassement de quantitatif superieur a cinq pour cent.
6. Prochains jalons, avec le nombre de jours restants.
7. Ecran analyses : histogramme des effectifs avec courbe de charge prevue,
   consommation cumulee de beton, acier et coffrage, rendements par nature de
   tache, repartition des aleas par type et gravite, jours perdus cumules,
   journees non travaillables par cause.
8. Palette de visualisation coherente, lisible en clair et en sombre,
   contrastes verifies.

### Tests

- Comparaison des indicateurs affiches a un calcul de reference au tableur,
  a trois dates differentes.
- Test de chaque regle d'alerte, declenchee et non declenchee.

### Critere d'achevement

Les treize indicateurs concordent avec le calcul de reference aux trois dates.
Le tableau de bord se charge en moins d'une seconde depuis les instantanes.

---

## Sprint 8 — Photos, plan, rapports et mise en ligne

Objectif : les livrables visuels, puis la mise en production et l'optimisation.

### Taches

1. Timeline photographique : regroupement par point de vue, curseur temporel,
   comparateur a volet coulissant entre deux dates, grille par date, filtres.
2. Plan interactif : plans de niveau en SVG, zones colorees selon l'avancement,
   selecteur de niveau, curseur temporel rejouant l'avancement, clic sur zone
   ouvrant le detail des taches.
3. Rapports PDF : page de garde, synthese des indicateurs, avancement par lot,
   faits marquants, aleas de la periode, meteo, effectifs, planche
   photographique, jalons a venir. Rendu React converti en PDF.
4. Mise en ligne : projet Supabase en `eu-central-1`, migration appliquee,
   peuplement unique, Storage configure, RLS activee en refus general.
5. Vercel : region `fra1`, variables d'environnement, `buildCommand` avec
   migration prealable, cron quotidien.
6. Action GitHub de sauvegarde quotidienne, plus declenchement manuel.
7. Restauration de sauvegarde testee sur la base locale, au moins une fois.
8. Optimisation : mesure du chargement en 4G bridee, verification des huit
   regles de la section 7, suppression des cascades de requetes, mise en cache
   par etiquette.
9. Accessibilite : navigation au clavier, contrastes, libelles des controles.
10. `README.md` d'installation et de reprise du projet.

### Critere d'achevement

L'application est accessible en ligne. Premier rendu utile sous 1,5 seconde en
4G, navigation sous 400 millisecondes, soumission d'un releve sous 1 seconde.
Le rapport hebdomadaire se genere en PDF. Une sauvegarde a ete restauree avec
succes.

---

## Charge et calendrier

| Sprint | Contenu | Charge estimee |
|---|---|---|
| 0 | Fondations | 6 h |
| 1 | Schema et peuplement | 20 h |
| 2 | Noyau de calcul | 24 h |
| 3 | Persistance et recalcul | 16 h |
| 4 | Authentification et coquille | 14 h |
| 5 | Saisie journaliere | 22 h |
| 6 | Planning, Gantt, simulation | 28 h |
| 7 | Tableau de bord et analyses | 20 h |
| 8 | Photos, plan, rapports, mise en ligne | 26 h |
| | **Total** | **176 h** |

A raison de vingt heures par semaine, environ neuf semaines. Le Gantt et le
peuplement sont les deux postes les plus susceptibles de deraper.

### Noyau irreductible

Si le temps manque, le perimetre soutenable pour un memoire de genie civil est
constitue des sprints 0 a 7. Le sprint 8 est reductible a la seule mise en
ligne, en abandonnant la timeline photographique, le plan interactif et les
rapports PDF. Ce qui ne peut jamais etre sacrifie : le peuplement realiste,
les calculs testes, le Gantt avec chemin critique, et le tableau de bord EVM.

---

## Risques et parades

| Risque | Consequence | Parade |
|---|---|---|
| Le Gantt sur mesure prend trop de temps | Sprint 6 hors delai | Livrer d'abord une version en lecture seule sans edition ni glisser-deposer ; l'edition est un ajout, pas un prerequis |
| Le peuplement produit une histoire incoherente avec les indicateurs | Demonstration non credible | Faire emerger la derive des quantites journalieres, jamais d'un decalage de dates ecrit en dur ; `db:check` verifie la coherence |
| Perte de la base en production | Six mois de donnees perdus | Sauvegarde quotidienne automatique, sauvegarde manuelle avant chaque migration, restauration testee |
| Mise en pause de la base Supabase apres sept jours | Application inaccessible | Cron quotidien, et verification de l'etat trois jours avant la soutenance |
| Derive du schema entre local et production | Migrations inapplicables | Interdiction absolue de `drizzle-kit push` en production et de toute modification par l'interface Supabase |
| Photos non compressees | Depassement du quota de 1 Go | Compression cote navigateur obligatoire avant tout envoi, verifiee en test |
| Elargissement du perimetre | Rien n'est fini | La liste hors perimetre en tete de ce document, relue au debut de chaque sprint |
| Perte de l'outillage a quelques jours de la soutenance | Impossible de corriger | A partir du sprint 7, une version fonctionnelle etiquetee dans Git a chaque fin de sprint |

---

## Matiere pour le memoire, produite au fil des sprints

A collecter pendant le developpement, pas a reconstituer a la fin.

| Sprint | Element a conserver |
|---|---|
| 1 | Schema relationnel complet, a mettre en annexe |
| 2 | Le sous-graphe de dix taches calcule a la main, avec la comparaison a la sortie de l'application |
| 2 | Le contre-exemple chiffre ponderation budgetaire contre ponderation par duree |
| 3 | Le resultat du test de coherence du cache, qui demontre l'invariant de recalcul |
| 6 | Capture du Gantt avec chemin critique, et la simulation de glissement |
| 7 | Verification des indicateurs EVM a trois dates, calcul manuel contre application |
| 8 | Mesures de latence avant et apres suppression du back separe, captures de l'onglet reseau |
| 8 | Limites assumees : la saisie reste declarative, l'application ne mesure rien physiquement |


---

## Journal d'avancement

### Sprint 0 — Fondations : termine

Commit `fe4f5d5`. Critere d'achevement atteint : `npm run verifier` passe
(typage strict, ESLint, absence d'emoji, tests), `npm run build` produit une
sortie statique, et la connexion a la base `chantierscope` est verifiee depuis
les variables d'environnement du projet.

Ecarts par rapport au plan, tous assumes :

| Ecart | Raison |
|---|---|
| Next.js 16 au lieu de 15 | Avis de securite sur `postcss`, voir ci-dessus |
| PostgreSQL local au lieu de Docker | Serveur 16.15 deja installe sur la machine |
| Ajout de `src/lib/env.ts` | Le typage strict a rendu visible l'acces direct a `process.env` ; une validation Zod au demarrage vaut mieux qu'un contournement |
| `@eslint/eslintrc` et `FlatCompat` retires | `eslint-config-next` 16 exporte nativement de la configuration plate ; le pont provoquait une erreur de structure circulaire |
| Composant `form` de shadcn non installe | Il depend de `react-hook-form`, qui n'a d'utilite qu'au sprint 5 |
| `vitest.config.mts` au lieu de `.ts` | Vite charge un `.ts` racine en CommonJS et emet un avertissement |

Ajouts non prevus au plan, conserves :

- Regle ESLint interdisant toute couleur hexadecimale en dur hors des modules
  de palette. La palette a ete validee ; une couleur ecrite a la main dans un
  composant echapperait a cette validation.
- Script `npm run lint:emoji`, qui applique la contrainte d'iconographie plutot
  que de la laisser a la vigilance.
- Script `npm run verifier`, qui enchaine les quatre controles avant commit.
- Page de reference des jetons a la racine de l'application : elle rend
  visibles la palette, les etats et le formatage, pour qu'une derive se voie
  immediatement. Elle sera remplacee par le selecteur de projet au sprint 4.

Rapport de validation de la palette, a conserver pour le memoire :

| Verification | Clair, surface `#ffffff` | Sombre, surface `#171717` |
|---|---|---|
| Bande de clarte | conforme | conforme |
| Plancher de chroma | conforme | conforme |
| Separation en vision deficiente, paires adjacentes | 9,1 (>= 8) | 8,4 (>= 8) |
| Plancher en vision normale, paires adjacentes | 19,6 (>= 15) | 19,3 (>= 15) |
| Contraste face a la surface | 3 teintes sous 3:1, regle de relief appliquee | les 8 au-dela de 3:1 |
| Courbe en S, 3 series, toutes paires | 9,2 / 24,0 | 9,4 / 20,9 |

La regle de relief signifie que tout graphique employant les teintes 3, 4 ou 5
en mode clair doit porter des etiquettes directes visibles ou offrir la vue
tableau. Contrainte de conception, pas une recommandation.


### Sprint 1 — Schema et jeu de donnees : termine

Commit `274801e`. Critere d'achevement atteint : `npm run db:reset` s'execute
en moins de dix secondes, `npm run db:check` enchaine 25 controles de
coherence sans echec, et deux peuplements successifs produisent la meme
empreinte metier.

#### Ce qui a ete produit

Dix-neuf tables, deux migrations, six declencheurs. Un chantier de 24
logements R+3 a Abidjan : 76 taches en WBS a trois niveaux, 60 liaisons, 134
lignes de quantitatif, 357 releves journaliers, 1 201 quantites realisees, 12
aleas, 6 jalons, 12 zones, 32 planches photographiques.

#### Ecarts par rapport au plan

| Ecart | Raison |
|---|---|
| 19 tables au lieu de 16 | Les deux colonnes tableau de la conception, `projet_ids` sur l'utilisateur et `tache_ids` sur la zone, sont devenues les tables de liaison `acces_projet` et `zone_tache` : indexables, porteuses de l'integrite referentielle, et conformes a la normalisation attendue d'un modele relationnel |
| Montant du marche 1 156 141 200 FCFA au lieu de 2 100 000 000 | Le montant n'est pas un parametre mais la somme du quantitatif. La cible initiale de 2,1 milliards correspondait a 516 000 FCFA du metre carre habitable, au-dessus des ordres de grandeur du marche ivoirien pour du logement collectif |
| Duree 412 jours au lieu de 426 | La duree contractuelle est calee sur la duree du reseau, elle-meme issue des durees de taches. Un contrat plus long aurait offert une marge de quatorze jours qui aurait absorbe la derive et prive la demonstration de son enjeu de penalite |
| Ordre de service au 2 mars 2026 au lieu du 6 janvier 2025 | La demonstration doit paraitre vivante le jour de la soutenance. La date d'analyse du 30 septembre 2026 place le chantier au jour 212 sur 412 |
| Derive constatee de 14 jours au lieu de 12 | La derive n'etant pas ecrite mais emergente, sa valeur exacte est un resultat, pas une consigne. Le modele a ete calibre en trois iterations pour atteindre la zone d'alerte |
| Le module `src/db/compute/meteo.ts` ecrit au sprint 1 | Le peuplement a besoin des memes seuils que l'application. Les dupliquer aurait garanti leur divergence. Ses tests restent au sprint 2 |
| Passage du projet en modules ES | Requis par les scripts de peuplement, qui utilisent l'attente de premier niveau et `import.meta`. Verifie sans regression sur le typage, le lint et la construction |

#### Une correction de fond, et non un ajustement

La premiere calibration produisait 37 jours de derive. L'analyse a montre que
la cause principale n'etait pas un parametre mal regle mais une regle fausse :
le seuil de pluie qui interdisait le betonnage etait fixe a 10 mm, comme pour
les terrassements. C'est inexact. On betonne sous pluie legere, avec bachage
et cure adaptee ; seule la pluie forte, au-dela de 25 mm, l'interdit. Les
terrassements, les VRD, l'etancheite et les enduits sont en revanche
reellement arretes des 10 mm.

La regle a donc ete corrigee dans `src/db/compute/meteo.ts`, ou elle sert a la
fois au peuplement et a l'application. La derive est tombee de 37 a 22 jours
par cette seule correction. Le reste de l'ecart a ete resorbe en ajustant deux
parametres du modele : le rendement du gros oeuvre et la duree de la rupture
d'approvisionnement.

C'est un point a raconter dans le memoire : un modele qui donne un resultat
aberrant signale parfois une erreur de comprehension du metier, pas une erreur
de calage.

#### Ajouts non prevus au plan, conserves

- `npm run db:empreinte` produit une empreinte du jeu de donnees independante
  des identifiants et des horodatages, ce qui permet de prouver le
  determinisme au lieu de l'affirmer.
- `scripts/reinitialiser.ts` refuse de s'executer sur une base dont l'hote
  n'est pas local. Un garde-fou vaut mieux qu'une consigne.
- Les declencheurs d'audit sont desactives pendant le chargement puis
  reactives : le journal doit tracer des actions humaines, pas les quinze
  mille ecritures du peuplement.
- Les planches photographiques sont des SVG generes, portant la mention
  « image de demonstration, generee, non photographique ». Elles rendent la
  timeline du sprint 8 demontrable sans se procurer de vraies photographies,
  sans jamais pouvoir passer pour un releve reel.

#### Matiere pour le memoire produite a ce sprint

- Le schema relationnel complet, 19 tables, a mettre en annexe.
- Le rapport des 25 verifications de coherence.
- La preuve de determinisme par empreinte, avant et apres reinitialisation.
- Le tableau des trois causes de derive et leur contribution respective.
- L'episode de la regle meteo fausse, qui illustre la difference entre calibrer
  un modele et corriger sa comprehension du metier.

#### Commandes disponibles

```
npm run db:generate   genere une migration depuis le schema
npm run db:migrate    applique les migrations
npm run db:seed       peuple le chantier de demonstration
npm run db:reset      reinitialise, migre et peuple
npm run db:check      25 controles de coherence
npm run db:empreinte  empreinte metier, pour prouver le determinisme
npm run db:meteo      re-archive l historique meteo
npm run db:studio     explorateur de base
npm run db:dump       sauvegarde manuelle
```


### Sprint 2 — Noyau de calcul : termine

Commits `e0a1b57` et suivant. Critere d'achevement atteint : 261 tests au
vert, et une couverture de `src/db/compute` et `src/lib` de 98,7 % des
instructions, 99,4 % des lignes, 100 % des fonctions et 87,5 % des branches,
au-dessus des seuils fixes au sprint 0.

#### Ce qui a ete produit

| Module | Role | Tests |
|---|---|---|
| `cpm.ts` | Tri topologique, passes avant et arriere, marges totale et libre, chemin critique, detection de circuit | 39 |
| `avancement.ts` | Les quatre methodes d'avancement, plafonnement du depassement, agregation ponderee par le budget | 36 |
| `evm.ts` | Les treize indicateurs, lecture horizontale de la courbe en S, penalite, modele de cout reel | 37 |
| `simulation.ts` | Calcul pur : decalages, allongements, jalons menaces, marges consommees | 30 |
| `calendrier.ts` | Feries ivoiriens, Paques par l'algorithme gregorien | 28 |
| `meteo.ts` | Seuils testes a leur valeur limite et de part et d'autre | 24 |
| `format.ts`, `viz.ts`, `env.ts` | Montants FCFA, dates, palette, validation d'environnement | 67 |

#### Le cas de reference

Le reseau de dix taches de `src/db/compute/reference.ts` a ete resolu au
crayon AVANT l'ecriture du moteur : passe avant, passe arriere, marges
totales et libres, chemin critique A-B-D-F-G-I-J de 35 jours. Le calcul
manuel complet figure en en-tete du fichier, pret a devenir une annexe du
memoire. Les valeurs attendues des tests en sont recopiees, et non relevees
sur la sortie du programme : c'est ce qui donne au test valeur de preuve
plutot que de constat.

#### Verification croisee

Applique au reseau reel de 59 taches et 60 liaisons, le moteur retrouve
exactement les dates au plus tot du planning cale independamment au sprint 1
par `src/db/seed/planning.ts`. Deux implementations ecrites separement qui
concordent au jour pres sur un reseau de taille reelle. Une divergence aurait
signale une erreur dans l'une des deux sans dire laquelle, ce qui aurait
oblige a revenir au calcul manuel pour trancher.

#### Un test faux, corrige apres analyse

Le scenario « decalage de dix jours sur une tache a marge » attendait que le
predecesseur de la tache decalee devienne critique. Le programme repondait le
contraire. Verification faite, c'est le test qui avait tort : le decalage est
une CONTRAINTE DE DATE posee sur la tache, pas un retard propage depuis son
predecesseur. La tache ne pouvant plus remonter, son predecesseur gagne de la
marge au lieu d'en perdre — il passe de quatre a dix jours.

Le cas a ete conserve et documente comme tel dans `simulation.test.ts` : il
distingue deux natures de perturbation que l'intuition confond, et merite
d'etre expose dans le memoire.

#### Limite assumee : le modele de cout reel

Le cout reel d'un chantier est une donnee comptable, lue dans la comptabilite
analytique de l'entreprise. L'application n'en dispose pas : elle le
reconstitue a partir de ce que le chantier declare, heures ouvriers, journees
d'encadrement, quantites mises en oeuvre et cout des aleas, avec quatre
parametres d'ordre de grandeur ivoirien.

Cela suffit a rendre le CPI significatif en tendance — une productivite
degradee consomme plus d'heures pour la meme valeur acquise, et fait
mecaniquement descendre l'indice — mais ne remplace pas une comptabilite. Le
point est documente en tete de `evm.ts` et doit figurer parmi les limites du
memoire.

#### Matiere pour le memoire produite a ce sprint

- Le calcul manuel du reseau de dix taches, avec la sortie du programme en
  regard.
- Le contre-exemple chiffre de la ponderation : deux taches de meme duree,
  budgets de 12 et 108 millions, la premiere achevee. Ponderation par duree
  50 %, ponderation budgetaire 10 %, soit quarante points d'ecart. Seule la
  seconde est coherente avec la valeur acquise.
- La distinction entre l'ecart de delai en jours, lu horizontalement sur la
  courbe en S, et le SPI, qui est un rapport sans unite. Les confondre est
  une erreur classique.
- L'episode du test faux sur la nature d'une contrainte de date.


### Sprint 3 — Persistance et recalcul : termine

Critere d'achevement atteint : le test de coherence du cache passe, le
recalcul integral du projet de demonstration prend 434 ms pour 1 917
instantanes, et `npm run db:check` reste au vert, desormais avec 29 controles.

#### Ce qui a ete produit

| Fichier | Role |
|---|---|
| `src/db/queries/contexte.ts` | Chargement du contexte complet d'un projet en six requetes paralleles, jamais une par tache |
| `src/db/recompute.ts` | Reconstruction integrale du cache : avancement, poids budgetaire, marges, criticite, et la totalite des instantanes journaliers |
| `src/db/mutations/releve.ts` | Ecritures transactionnelles, identite de l'auteur posee par `set_config`, recalcul dans la meme transaction |
| `src/services/meteo.ts` | Releve Open-Meteo, archive et prevision fusionnees, tolerant a l'indisponibilite |
| `src/app/api/cron/nuit/route.ts` | Tache nocturne : completion de la meteo, recalcul, maintien en eveil |
| `scripts/recalculer.ts` | Recalcul manuel, pour verifier l'invariant a la demande |

24 tests d'integration s'ajoutent aux 262 tests unitaires, soit 286 au total.

#### Situation calculee depuis la base

| Indicateur | Valeur |
|---|---|
| Avancement | 43,3 % |
| Valeur planifiee | 573 504 519 FCFA |
| Valeur acquise | 500 883 296 FCFA |
| Cout reel | 511 857 107 FCFA |
| SPI | 0,873 |
| CPI | 0,979 |
| Ecart de delai | 17,5 jours |
| Duree du recalcul | 434 ms pour 1 917 instantanes |

Ces valeurs different legerement de celles mesurees au sprint 1, et la raison
est une decision de conception : **seuls les releves VALIDES alimentent les
indicateurs**. Le jeu de demonstration laisse volontairement les trois
derniers jours en attente de validation, de sorte que valider un releve fasse
observablement bouger l'avancement du projet. C'est le critere d'achevement du
sprint, et c'est aussi ce qui justifie l'alerte « releve en attente ».

Le modele de cout, dont les quatre parametres avaient ete poses sans
calibration au sprint 2, produit un CPI de 0,979 : la derive de productivite
du gros oeuvre se traduit bien par une consommation d'heures superieure a la
valeur acquise, sans exagerer l'effet.

#### Le test qui protege l'invariant

`coherence du cache : incremental contre integral` compare deux chemins :

1. Validation d'un releve, qui declenche un recalcul incremental dans la
   transaction.
2. Effacement total du cache, puis recalcul integral reparti de zero.

Les deux empreintes doivent etre identiques, sur les taches comme sur les
1 917 instantanes. Tant que ce test passe, l'invariant de la section 11.5 de
la conception tient : aucune incoherence n'est definitive.

#### Decisions prises a ce sprint

| Decision | Motif |
|---|---|
| Seuls les releves VALIDES comptent | Un releve en brouillon ou soumis n'engage encore personne. Rend la validation observable |
| Les frais de chantier ne sont pas repartis sur les lots | Ce sont des couts indirects. Les ventiler au prorata serait une convention arbitraire presentee comme une mesure |
| `snapshot_avancement` est efface puis reecrit sur la plage recalculee | Un `insert on conflict` laisserait subsister les instantanes de journees devenues vides apres annulation d'un releve |
| Mise a jour des 76 taches en une seule instruction, par jointure sur une table de valeurs | Soixante-seize instructions distinctes couteraient soixante-seize allers-retours |
| Base d'integration dediee, reconstruite a chaque execution de la suite | Les tests ecrivent ; ils ne doivent jamais alterer le jeu de demonstration |
| `set_config` avec portee de transaction plutot que `SET` | Une identite collee a une connexion reutilisee par le pooler attribuerait des actions au mauvais utilisateur |

#### Matiere pour le memoire produite a ce sprint

- Le resultat du test de coherence du cache, qui demontre l'invariant de
  recalcul plutot que de l'affirmer.
- La mesure du recalcul : 1 917 instantanes en 434 ms, ce qui justifie le
  choix de precalculer plutot que d'agreger a l'affichage.
- La justification du perimetre des releves pris en compte, et son effet
  mesure sur les indicateurs.


### Sprint 4 — Authentification et coquille applicative : termine

Commit `298db6b` puis correctifs. Critere d'achevement atteint : les cinq
comptes de demonstration se connectent sur la construction de production et
voient exactement ce que la matrice prevoit ; le test de non-fuite pour le
role `MOA` passe. `npm run verifier` est au vert avec 321 tests.

#### Ce qui a ete produit

| Fichier | Role |
|---|---|
| `src/auth.ts` | Auth.js v5, identifiants, sessions JWT de douze heures, role et projets portes par le jeton |
| `src/lib/droits.ts` | Matrice des droits en logique pure, groupes de roles nommes par ce qu'ils autorisent |
| `src/lib/garde.ts` | `exiger(projetId, roles)`, appliquee a la session courante |
| `src/db/queries/lecture.ts` | Lectures de la vue projet et de la vue lot, colonnes internes selectionnees selon le role |
| `src/app/(app)/` | Coquille : navigation laterale, fil d'Ariane, menu utilisateur, tableau de bord, vue lot, etats de chargement et d'erreur |
| `src/components/graphiques/courbe-s.tsx` | Courbe en S, serie du cout reel absente pour le maitre d'ouvrage |

#### Verification a l'ecran

Parcours automatise sur `next start` : connexion de chacun des cinq comptes,
ouverture du tableau de bord puis d'un lot. Le conducteur voit le CPI, la
serie du cout reel et le cout reel reconstitue ; le maitre d'ouvrage voit
l'avancement, le SPI et la date de fin projetee, mais ni CPI ni cout reel,
et aucune cle de cout dans la charge utile.

#### Deux defauts trouves a la cloture

| Defaut | Correction |
|---|---|
| Le test de coherence du cache comparait un recalcul incremental a la date du jour avec un recalcul integral a la date figee du 30 septembre. Il ne passait que ce jour-la | Le chemin integral reprend la date d'analyse effectivement employee par le chemin incremental |
| `recompute()` n'effacait que les instantanes anterieurs a la date d'analyse. Un recalcul a une date plus ancienne laissait subsister des instantanes posterieurs qu'aucun recalcul a cette date ne savait reproduire | L'effacement couvre tous les instantanes du projet ; le calcul repartant du premier jour, rien n'est perdu |

Le second defaut violait directement la regle selon laquelle tout cache doit
etre reconstructible par `recompute()`. C'est le test de cache detruit puis
reconstruit qui l'a revele, une fois le premier corrige : un test qui ne
passe que par coincidence de date masque les autres.

Deux erreurs ESLint, un parametre inutilise dans l'infobulle de la courbe en
S et une comparaison non stricte, empechaient aussi `npm run verifier` de
passer.

#### Matiere pour le memoire produite a ce sprint

- Le filtrage par selection de colonnes plutot que par masquage, et sa preuve
  par inspection de la charge utile serialisee.
- La separation des roles : le chef de chantier saisit, le conducteur valide.
- L'episode du test dependant de la date, exemple d'un test vert qui ne
  prouvait rien.


### Sprint 5 — Saisie journaliere : termine

Critere d'achevement atteint, et demontre par les parcours Playwright au
bureau comme au telephone (`npm run test:e2e`, 8 parcours au vert) :

- une saisie faite sans reseau est gardee sur le telephone puis apparait en
  base au retour de la connexion ;
- un releve valide ne peut plus etre modifie, et la base elle-meme le refuse ;
- l'avancement du projet bouge des la validation.

`npm run verifier` passe avec 475 tests.

#### Ce qui a ete produit

| Fichier | Role |
|---|---|
| `src/lib/releve.ts` | Schemas Zod par etape, partages entre navigateur et serveur |
| `src/lib/releve-formulaire.ts` | Etat du formulaire et conversion en releve, sans React |
| `src/db/compute/saisie.ts` | Controle d'une quantite face au prevu, au cumul valide et au cumul en attente |
| `src/db/mutations/releve.ts` | Enregistrement idempotent, rectification, refus metier explicites |
| `drizzle/0003_gel_releve_valide.sql` | Gel d'un releve valide et de ses quantites, par declencheur |
| `src/app/api/projet/[id]/releves/route.ts` | Point d'entree unique des envois, direct ou depuis la file |
| `src/components/saisie/` | Formulaire en etapes, journal, fiche, file d'attente |
| `src/lib/hors-ligne/` | Classement des issues d'envoi, file IndexedDB, synchronisation |
| `public/sw.js` | Service worker : pages en reseau d'abord, ressources en cache d'abord |
| `src/services/stockage.ts` | Magasin de photos : Supabase en production, disque signe en local |
| `e2e/` | Parcours Playwright |

#### Decisions prises a ce sprint

| Decision | Motif |
|---|---|
| L'identifiant d'un releve est genere par le navigateur | Il rend l'envoi idempotent : un releve renvoye apres une reponse perdue retrouve sa ligne au lieu d'en creer une seconde. Genere dans la page et non par le serveur, faute de quoi une page servie depuis le cache donnerait le meme identifiant a deux saisies |
| Saisie par gestionnaire de route, validation par Server Action | L'identifiant d'une Server Action change a chaque construction : un releve reste en file pendant un redeploiement ne pourrait plus l'appeler. La validation, elle, ne se fait qu'en ligne |
| Gel porte par un declencheur, code d'erreur `CS001` | Une regle que la base peut garantir ne doit pas dependre de la discipline des mutations futures |
| Rectification validee d'emblee, reservee aux roles qui valident | Le rectificatif engage autant qu'une validation ; un passage par « soumis » ferait disparaitre la journee des indicateurs jusqu'a la validation |
| Un depassement de quantite est signale, pas refuse | Le refuser pousserait a saisir une quantite fausse pour passer le controle. L'avancement reste plafonne par le noyau |
| L'alerte de depassement compte aussi les releves en attente | Deux releves non valides, chacun sous le prevu, peuvent le depasser ensemble |
| Trois issues d'envoi : enregistre, refuse, reporte | Seul un releve que le serveur n'a pas pu juger est rejoue. Un refus est garde avec son motif, jamais renvoye en boucle |
| File cloisonnee par utilisateur | Sur un telephone partage, un releve ne doit pas partir sous la session du suivant |
| Pages en cache effacees au passage par la connexion | Elles portent les donnees du compte connecte |
| Photos compressees a la selection, metadonnees EXIF effacees | Le reseau de chantier, et la position GPS qui n'a pas a quitter le telephone |
| Journal reserve aux roles qui voient les donnees internes | Il porte les effectifs et les heures |

#### Defauts trouves et corriges en chemin

| Defaut | Correction |
|---|---|
| Un alea rattache a un lot etait compte dans le cout du lot ET ajoute au cout du projet | Seuls les aleas sans lot s'ajoutent au projet. Test d'agregat ajoute |
| `Date.parse` acceptait le 30 fevrier, reporte au 2 mars | Verification par aller-retour, revelee par un test |
| En production, un refus d'acces s'affichait comme une panne : React masque le message des erreurs serveur | Garde de page `exigerPage`, qui redirige vers un ecran « Acces refuse » |
| La vue lot chargeait un lot sans verifier qu'il appartenait au projet de l'adresse | Controle ajoute, page introuvable sinon |
| Une variable d'environnement declaree vide faisait echouer la validation | Une variable vide vaut une variable absente, comme dans `.env.example` |

#### Le CPI compare desormais le cout reel au cout budgete

La correction du double comptage des aleas a fait passer le CPI de 0,984 a
1,034, ce qui a conduit a examiner le modele de cout dans son principe. Deux
erreurs, plus profondes qu'un parametre mal regle, en sont ressorties.

1. **La valeur acquise etait comparee au cout reel au prix de vente.** Le
   quantitatif est un bordereau de prix, marge comprise ; le cout reel est un
   cout de revient. Un chantier execute exactement comme prevu aurait affiche
   un CPI egal a l'inverse de la marge, au-dessus de un : l'indice mesurait
   l'erosion de marge, pas la performance de cout. Le CPI rapporte desormais
   le cout reel au cout budgete du travail realise, `k x VA`, ou `k` est le
   coefficient de debourse, budget en cout sur budget en prix. EAC et VAC sont
   exprimes au cout. Le SPI n'est pas concerne.
2. **Le budget et l'execution ne partageaient pas les memes effectifs.** Le
   peuplement simulait les equipes avec sa propre table par nature d'ouvrage,
   divergente des affectations du planning (14 ouvriers au betonnage contre
   une equipe de coffrage de 12). Une table unique, `EQUIPE_PAR_NATURE`, sert
   maintenant aux deux. Le bruit d'effectif, decentre d'un demi-ouvrier par
   lot et par jour, et la journee moyenne de 7,9 heures contre 8 au budget ont
   ete recentres pour la meme raison : un biais de simulation se serait lu
   comme un ecart de performance.

Le budget de debourse applique au planning le modele meme du cout reel :
materiaux, heures des equipes affectees jour par jour, encadrement au meme
taux d'un encadrant pour douze ouvriers plus le chef de chantier, frais de
chantier sur la duree contractuelle. Il fait apparaitre une marge
previsionnelle de 14 % (coefficient de 0,859), plausible en batiment. Aucun parametre n'a
ete ajuste pour viser une valeur.

| Indicateur | Avant | Apres |
|---|---|---|
| CPI du projet | 1,034 | 0,892 |
| Avancement, SPI, ecart de delai | inchanges | inchanges |

La lecture est desormais causale. Les lots 02 et 03, acheves a l'heure,
sortent sous un CPI de un a cause des aleas qu'ils ont portes, 3,5 et 6,1
millions, que le budget ne provisionne pas. Au niveau du projet s'y ajoutent
les frais de chantier des jours de retard. Le retard et les aleas coutent :
c'est exactement ce que l'indicateur doit montrer. Le budget ne comporte pas
de provision pour aleas ; l'ajouter serait la suite naturelle, a documenter
comme limite dans le memoire.

#### Ecarts par rapport au plan

| Ecart | Raison |
|---|---|
| Pas de `react-hook-form` | Le formulaire tient en un etat simple converti par une fonction pure testee ; la bibliotheque n'aurait rien ajoute |
| Photos ajoutables a un releve deja valide | Une photo documente la journee sans modifier ce que le releve engage |
| `experimental.useOffline` de Next non retenu | Il rejoue une requete en memoire, perdue a la fermeture de l'onglet. La file IndexedDB survit au redemarrage du telephone |

#### Matiere pour le memoire produite a ce sprint

- Le gel par declencheur, et son test : la base refuse une modification que
  l'application aurait pu oublier d'interdire.
- L'idempotence par identifiant genere dans le navigateur, et le piege du
  cache qui l'aurait cassee.
- Le classement des issues d'envoi en trois categories, base de toute file
  hors ligne honnete.
- Le double comptage des aleas, trouve par un test d'integration de la
  saisie et non par une relecture.


### Entre les sprints 5 et 6 — corrections

| Correction | Effet |
|---|---|
| Le CPI compare le cout reel au cout budgete, voir la section du sprint 5 | CPI du projet de 1,034 a 0,892, lecture causale de la derive de cout |
| La tache nocturne compte reellement la meteo completee | Le rapport annoncait toujours zero, faute de clause `returning` |
| Les pages passent par le client applicatif `db()` | Plus de connexion directe par rendu, qui aurait contourne le pooler en production |
| Libelles accentues dans toute l'interface et dans le jeu de demonstration | Conformite a la regle de langue ; l'empreinte metier du jeu change en consequence |

Les accents ont ete poses par un outil qui s'appuie sur l'arbre syntaxique de
TypeScript : seuls les litteraux de chaine, les gabarits hors expressions et
les textes JSX sont touches, jamais un identifiant, une requete SQL, une
classe CSS ou une cle. Les cas que seul le sens tranche, « a » ou « à »,
« equipe » ou « équipé », « relevé d’étanchéité », ont ete corriges a la main.


### Sprint 6 — Planning, Gantt et simulation : termine

Critere d'achevement atteint :

- le chemin critique affiche est conforme au calcul manuel du sprint 2 : un
  test de rendu du Gantt sur le reseau de reference retrouve exactement
  A-B-D-F-G-I-J, et un parcours Playwright verifie sur le projet de
  demonstration que les barres critiques affichees sont celles de la base ;
- une simulation produit une date de fin et une penalite verifiables a la
  main : dix jours de glissement sur le beton de proprete des fondations
  donnent une fin au 27 avril 2027 et une penalite de 11 561 412 FCFA, soit
  10 x 0,001 x 1 156 141 200, calcul ecrit en tete du test.

`npm run verifier` passe avec 567 tests, `npm run test:e2e` avec 17 parcours.
Le rendu de deux cents taches prend 42 ms, pour une cible de 500.

#### Ce qui a ete produit

| Fichier | Role |
|---|---|
| `src/db/compute/gantt.ts` | Geometrie du Gantt : paliers et centrage, graduations, WBS repliable, virtualisation, liaisons orthogonales, repartition des couloirs, journees grisees |
| `src/db/compute/planning.ts` | Recalage par le calcul au plus tot, dates des noeuds, controle d'une liaison candidate |
| `src/db/mutations/planning.ts` | Edition transactionnelle : duree, contrainte de debut, liaisons, scenarios |
| `src/db/queries/planning.ts` | Lecture unique du planning pour le Gantt, l'edition et la simulation |
| `src/lib/gantt-donnees.ts` | Donnees serialisables du Gantt, et Gantt simule |
| `src/components/planning/` | Gantt en SVG, ecran du planning avec panneau d'edition, ecran de simulation |
| `drizzle/0004`, `drizzle/0005` | Contrainte de debut, scenarios, audit des liaisons |

#### Decisions prises a ce sprint

| Decision | Motif |
|---|---|
| Les dates prevues sont une projection du reseau, jamais saisies une a une | Une date saisie a la main contredirait tot ou tard ses liaisons. Modifier une duree ou une liaison recale tout le planning par le calcul au plus tot |
| Une date de debut fixee a la main devient une contrainte « pas avant », stockee a part | Le recalage suivant la respecte au lieu de l'effacer. Plus precoce que les predecesseurs, elle est enregistree et signalee sans effet |
| Le planning du jeu est un point fixe du recalage, et un test le garantit | Sinon la premiere edition aurait deplace tout le chantier |
| Les jalons contractuels gardent leur date, les jalons internes suivent leur tache | La date contractuelle est celle contre laquelle on mesure un retard |
| La simulation tourne dans le navigateur | Moteur pur, reseau de quelques kilooctets : resultat instantane a chaque frappe, sans aller-retour serveur |
| Un scenario enregistre ne conserve que ses hypotheses | Le resultat est un calcul a la volee (section 11.5 de la conception) ; il est refait sur le planning du moment |
| Le glisser-deposer ouvre la simulation, sans ecrire | Exigence du plan : rien n'est modifie avant confirmation |
| La simulation est reservee aux roles qui voient les donnees internes | Elle chiffre des penalites et expose la strategie de l'entreprise |
| Les liaisons entrent au journal d'audit | Les modifier deplace la valeur planifiee et les penalites projetees |

#### Un test faux, corrige apres analyse

Un test supposait qu'allonger une tache critique retarde forcement la fin du
chantier. La tache retenue, 03.1.2, n'a qu'un successeur lie debut-debut :
son DEBUT est critique, sa FIN ne l'est pas, et l'allonger ne retarde rien.
La marge totale retenue est la plus petite des deux, selon la convention
usuelle des logiciels de planification. Le cas est conserve comme test a
part ; c'est une subtilite des liaisons autres que fin-debut qui merite
d'etre exposee dans le memoire.

#### Defauts trouves en chemin

| Defaut | Correction |
|---|---|
| La cellule de grille du Gantt s'elargissait a la largeur de son contenu, 5 496 pixels : le conteneur ne defilait jamais | `min-w-0` sur la cellule |
| Le centrage initial sur la date du jour s'executait pendant que la page, arrivee en flux, etait encore masquee | Centrage differe a la premiere frame ou le conteneur a des dimensions |
| Apres le retour du reseau, une synchronisation interrompue ou demandee pendant un passage n'etait relancee qu'une minute plus tard | Relance d'une demande arrivee en cours de passage, nouvel essai a 5, 10 puis 20 secondes |
| Le controle d'audit de `db:check` comptait tous les declencheurs, gel compris : il serait passe avec un audit manquant | Controle par table et par fonction, et controle separe du gel |

#### Limites assumees

- La simulation porte sur le planning de reference, pas sur la situation
  constatee : elle mesure l'effet d'un alea sur le reseau. Simuler a partir
  de l'avancement reel demanderait de re-planifier le reste a faire, ce qui
  releve d'un module de replanification hors perimetre.
- La securite de niveau ligne de PostgreSQL, prevue en refus general par la
  conception, n'est pas encore posee : elle releve de la mise en ligne,
  sprint 8.

#### Matiere pour le memoire produite a ce sprint

- Le Gantt sur mesure : geometrie en fonctions pures testees, composant qui
  ne fait que dessiner, et la mesure de 42 ms pour deux cents taches.
- Le recalage par le reseau, et le point fixe qui le rend sur.
- La tache critique par son seul debut, et la convention de marge totale.
- La simulation chiffree a la main, du glissement a la penalite en FCFA.

### Sprint 7 — Tableau de bord et analyses : termine

Critere d'achevement atteint :

- les treize indicateurs de la methode de la valeur acquise (VP, VA, CR,
  ecart de cout, ecart de delai en valeur, CPI, SPI, EAC, ETC, VAC, duree
  projetee, retard estime, penalite prevue), plus l'avancement et l'ecart de
  delai lu horizontalement, concordent avec le calcul de reference au
  tableur aux 15 mai, 31 juillet et 27 septembre 2026 : au franc pres pour
  les montants, a 1e-9 pour les indices, au jour pres pour les durees ;
- le tableau de bord se charge en 667 ms sur la construction de production,
  mesure faite par le parcours Playwright, pour une cible d'une seconde.

`npm run verifier` passe avec 651 tests, `npm run test:e2e` avec 26 parcours.

#### Le calcul de reference au tableur

`scripts/reference/tableur.py` extrait de la base les seules donnees
sources — quantitatif, dates prevues, methodes, releves valides, moyens,
aleas, equipes affectees —, sans lire aucune valeur derivee. Il ecrit un
classeur dont chaque grandeur est une formule de tableur redigee d'apres
les sections 4.1 a 4.3 de la conception, et non d'apres le code : avancement
selon la methode de chaque tache, valeur planifiee lineaire, debourse
previsionnel jour par jour et par lot, cout reel, puis les indicateurs. La
lecture horizontale de la courbe en S y est faite par `EQUIV` sur la courbe
planifiee journaliere. LibreOffice recalcule le classeur sans interface ;
`docs/reference/indicateurs-reference.xlsx` est le classeur recalcule,
`docs/reference/indicateurs.json` ses resultats.

Le test d'integration rejoue le chemin complet de l'application a chaque
date — recalcul du cache, lecture des instantanes par la requete du tableau
de bord, synthese par le noyau — et confronte. La troisieme date est la
derniere journee entierement validee du jeu : les releves posterieurs sont
en attente, et d'autres suites d'integration les valident.

#### Ce qui a ete produit

| Fichier | Role |
|---|---|
| `src/db/compute/tableau.ts` | Indicateurs a une date, tendances sur trente jours, courbe planifiee prolongee et projection, projection du reseau, prochains jalons, cinq regles d'alerte |
| `src/db/compute/analyses.ts` | Effectifs et charge prevue, consommation des materiaux cles, rendements par nature, aleas, jours perdus, arrets par cause |
| `src/db/queries/tableau.ts`, `src/db/queries/analyses.ts` | Lectures des deux ecrans, selection des colonnes selon le role |
| `src/lib/tableau-donnees.ts` | Branchement du noyau pour la page |
| `src/components/tableau/` | Panneau d'alertes, prochains jalons |
| `src/components/graphiques/analyses.tsx` | Histogramme, consommations, barres horizontales, jours perdus, vue tableau |
| `drizzle/0006` | Debourse previsionnel porte par les instantanes |
| `scripts/reference/tableur.py`, `docs/reference/` | Calcul de reference au tableur |

#### Decisions prises a ce sprint

| Decision | Motif |
|---|---|
| Le tableau de bord recalcule les indicateurs depuis VP, VA et CR des instantanes, plutot que de relire CPI et SPI stockes | Une seule formule, celle du noyau, pour l'ecran et pour le test de concordance |
| Le debourse previsionnel est stocke dans chaque instantane | EAC et VAC s'expriment au cout ; le relire evite de recharger les affectations a chaque affichage |
| La projection de la courbe en S part de la lecture horizontale et deroule le planning au rythme du SPI ; le cout suit au CPI | La courbe part exactement de la valeur acquise du jour, et le cout aboutit exactement a l'EAC |
| Un jalon est menace si sa tache declenchante, rejouee depuis la situation, finit apres la date | Le planning prevu ignore le retard constate : les dates prevues ne menacent jamais rien. Le reseau est rejoue avec le reste a faire de chaque tache entamee, au rythme prevu, et aucune tache non commencee avant le lendemain |
| Une tache critique est en retard des une journee d'ecart entre avancement prevu et reel, convertie par sa duree | Un ecart en pourcentage ne dit pas l'effet sur la fin du chantier ; en jours, il le dit |
| Les seuils des regles sont nommes, et le panneau les enonce tels qu'ils sont appliques | Une alerte dont on ne connait pas la regle n'est pas actionnable |
| Rendement : l'effectif d'un lot est reparti entre ses taches productives au prorata des equipes prevues, et compare au prevu de sa nature | Le releve porte l'effectif du lot, pas celui de chaque tache. L'indice sans unite rend comparables des natures mesurees en m3, m2 ou unites |
| Effectifs et rendements ne sont lus que pour les roles internes | Ce sont des donnees de l'entreprise, comme le cout reel |
| L'ecran d'analyses n'emploie que les deux premieres teintes de la palette, et une seule par graphique a une serie | Elles passent les cinq controles du validateur en clair et en sombre, contraste compris ; les teintes 3 a 5 sont sous 3:1 en clair |

#### Defauts trouves en chemin

| Defaut | Correction |
|---|---|
| Deux recalculs successifs differaient d'un franc, par intermittence : les lectures du contexte n'etaient pas ordonnees, et une somme flottante tombant sur un demi-franc s'arrondissait selon l'ordre arbitraire des lignes | Toutes les lectures du contexte sont ordonnees, sur une cle metier stable |
| Le bouton de theme rendait une icone differente au serveur et au client en theme sombre : React regenerait l'arbre | Icone du theme rendue une fois la page montee |
| La navigation marquait actif le tableau de bord sur tous les ecrans, sa route etant leur prefixe | L'entree active est la plus specifique |

#### Limites assumees

- La projection est une extrapolation au rythme constate, comme l'EAC : elle
  est pessimiste si les difficultes sont derriere le chantier. Elle differe
  de la duree projetee par le SPI, qui ne regarde que le rapport global ;
  les deux sont affichees avec leur hypothese.
- Le rendement attribue l'effectif au prorata des equipes prevues : une
  equipe reaffectee en cours de journee echappe a la mesure. Le releve par
  tache leverait cette limite, au prix d'une saisie plus lourde.

#### Matiere pour le memoire produite a ce sprint

- La concordance avec un calcul de tableur independant, et ce qu'elle
  prouve : une meme regle, ecrite deux fois par deux voies differentes,
  donne le meme chiffre.
- Le franc d'ecart intermittent : l'arithmetique flottante et l'ordre des
  lignes d'une requete SQL.
- La projection du reseau depuis la situation, et pourquoi les dates
  prevues ne suffisent pas a dire qu'un jalon est menace.
