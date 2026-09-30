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
| Depot Git | a initialiser (sprint 0) |

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
