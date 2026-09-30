# ChantierScope — Dossier de conception

Application web de suivi de l'evolution d'un chantier de genie civil.
Projet de fin d'etudes — ecole d'ingenieurs de conception, genie civil.

Devise : Franc CFA (XOF). Iconographie : Lucide React (SVG), aucun emoji.

---

## 1. Objet et parti pris

ChantierScope est un jumeau numerique leger du suivi d'avancement. Il ne se
limite pas a une liste de taches : il relie trois dimensions de l'avancement
et en deduit une prevision.

1. Avancement **physique** : quantites reellement mises en oeuvre.
2. Avancement **planifie** : ce qui aurait du etre fait a la date du jour.
3. Avancement **financier** : valeur acquise et cout reel.

De la confrontation des trois on tire les indicateurs de l'Earned Value
Management, qui repondent a la seule question qui compte pour un conducteur de
travaux : suis-je en retard, combien cela coute, et quand vais-je finir.

### Ce que l'application apporte de plus qu'un tableur

- Agregation automatique de l'avancement du releve journalier jusqu'au projet,
  ponderee par le poids budgetaire et non par la duree.
- Calcul du chemin critique et des marges par l'algorithme CPM.
- Detection des journees non travaillables a partir des donnees meteo et
  repercussion sur le planning.
- Projection de la date de fin par extrapolation de la performance constatee.
- Simulation d'alea : impact d'un glissement sur les jalons contractuels.
- Tracabilite photographique horodatee et geolocalisee.

---

## 2. Utilisateurs, roles et droits

| Role | Profil | Droits |
|---|---|---|
| `CHEF_CHANTIER` | Chef de chantier, chef d'equipe | Cree et modifie les releves journaliers de son lot, televerse des photos, declare un alea. Lecture du planning. |
| `CONDUCTEUR` | Conducteur de travaux | Tout du precedent, sur tous les lots. Valide les releves, modifie le planning et le quantitatif, lance les simulations, genere les rapports. |
| `MOE` | Maitrise d'oeuvre, bureau de controle | Lecture complete. Peut ouvrir et lever une non-conformite. Commente. |
| `MOA` | Maitre d'ouvrage, client | Lecture de la synthese : tableau de bord, jalons, courbe en S, timeline photo, rapports. Ne voit pas les couts internes ni les effectifs. |
| `ADMIN` | Administrateur | Gestion des projets, des comptes et des referentiels. |

Regle de gel : un releve journalier valide par le conducteur devient non
modifiable. Toute correction passe par un releve rectificatif trace, ce qui
preserve l'auditabilite du dossier d'ouvrage execute.

---

## 3. Modele de donnees

### 3.1 Vue d'ensemble

```
Projet
 |- Lot (corps d'etat)
 |   '- Tache  (noeud de la WBS, arborescente)
 |       |- LigneQuantitatif  (unite, quantite prevue, prix unitaire)
 |       |   '- ReleveQuantite  (rattache a un ReleveJournalier)
 |       |- Liaison (predecesseur / successeur, type, decalage)
 |       '- Affectation -> Ressource
 |- Jalon
 |- ReleveJournalier  (date, meteo, effectif, observations, statut)
 |   '- Photo
 |- Alea  (intemperie, incident, non-conformite, avenant, panne)
 |- Zone  (decoupage geometrique du plan, SVG)
 '- SnapshotAvancement  (table de precalcul, une ligne par jour et par lot)
```

### 3.2 Tables

**projet**
| Colonne | Type | Remarque |
|---|---|---|
| id | uuid | |
| code | text | ex. `LOG-24-ABJ` |
| nom | text | |
| maitre_ouvrage | text | |
| maitre_oeuvre | text | |
| entreprise | text | |
| lieu | text | |
| date_ordre_service | date | point de depart contractuel |
| duree_contractuelle_j | integer | en jours calendaires |
| date_fin_contractuelle | date | calculee, stockee pour figer le contrat |
| montant_marche_xof | bigint | en FCFA entiers |
| taux_penalite_journaliere | numeric(6,5) | fraction du marche par jour de retard |
| devise | text | `XOF`, fixe |

**lot** : `id`, `projet_id`, `code` (ex. `02-GO`), `nom`, `ordre`,
`budget_xof` (bigint), `couleur` (teinte pour le Gantt et le plan).

**tache** : `id`, `lot_id`, `parent_id` (WBS arborescente), `code_wbs`
(ex. `2.3.1`), `nom`, `date_debut_prevue`, `date_fin_prevue`, `duree_prevue_j`,
`date_debut_reelle`, `date_fin_reelle`, `methode_avancement`
(`UNITES_PHYSIQUES` | `JALONS_PONDERES` | `PROPORTION_DUREE` | `ZERO_CENT`),
`poids_budgetaire_xof` (bigint, somme des lignes de quantitatif),
`avancement_pct` (numeric, denormalise, recalcule),
`marge_libre_j`, `marge_totale_j`, `critique` (boolean) — les trois derniers
issus du CPM.

**liaison** : `id`, `tache_amont_id`, `tache_aval_id`,
`type` (`FD` fin-debut, `DD` debut-debut, `FF` fin-fin, `DF` debut-fin),
`decalage_j` (integer, peut etre negatif).

**ligne_quantitatif** : `id`, `tache_id`, `designation`,
`unite` (`M3` | `M2` | `ML` | `KG` | `T` | `U` | `ENS` | `FORFAIT`),
`quantite_prevue` (numeric(14,3)), `prix_unitaire_xof` (bigint),
`montant_xof` (bigint, genere : quantite x prix unitaire).

**releve_journalier** : `id`, `projet_id`, `lot_id`, `date`, `auteur_id`,
`effectif_ouvriers`, `effectif_encadrement`, `heures_travaillees`,
`meteo_code`, `temperature_c`, `precipitations_mm`,
`journee_travaillee` (boolean), `motif_arret`, `observations`,
`statut` (`BROUILLON` | `SOUMIS` | `VALIDE` | `RECTIFIE`),
`valide_par_id`, `valide_le`.
Contrainte d'unicite sur (`lot_id`, `date`, `statut != RECTIFIE`).

**releve_quantite** : `id`, `releve_journalier_id`, `ligne_quantitatif_id`,
`quantite_realisee` (numeric(14,3)), `commentaire`.

**photo** : `id`, `releve_journalier_id`, `tache_id` (nullable),
`zone_id` (nullable), `url`, `url_vignette`, `prise_le` (timestamptz),
`latitude`, `longitude`, `cap_degres` (orientation, pour les comparaisons
d'un meme point de vue), `point_de_vue_id` (nullable, regroupe les photos
d'un meme cadrage), `legende`.

**point_de_vue** : `id`, `projet_id`, `nom` (ex. `Facade nord depuis la rue`),
`latitude`, `longitude`, `cap_degres`. Sert la timeline comparative.

**jalon** : `id`, `projet_id`, `nom`, `date_prevue`, `date_reelle`,
`contractuel` (boolean), `tache_declenchante_id`, `penalite_xof` (bigint).

**alea** : `id`, `projet_id`, `lot_id`, `date`,
`type` (`INTEMPERIE` | `INCIDENT` | `NON_CONFORMITE` | `AVENANT` |
`PANNE_ENGIN` | `RUPTURE_APPROVISIONNEMENT` | `ADMINISTRATIF`),
`gravite` (1 a 4), `description`, `impact_delai_j`, `impact_cout_xof` (bigint),
`statut` (`OUVERT` | `EN_TRAITEMENT` | `SOLDE`), `resolu_le`.

**ressource** : `id`, `projet_id`, `type` (`EQUIPE` | `ENGIN` | `MATERIEL` |
`MATERIAU`), `nom`, `capacite`, `cout_unitaire_xof` (bigint),
`unite_cout` (`JOUR` | `HEURE` | `UNITE`).

**affectation** : `id`, `tache_id`, `ressource_id`, `quantite`,
`date_debut`, `date_fin`.

**zone** : `id`, `projet_id`, `nom` (ex. `Bat A - Niveau 2`), `niveau`,
`path_svg` (text, le contour dans le plan), `tache_ids` (uuid[]).
Permet de colorer le plan selon l'avancement des taches rattachees.

**snapshot_avancement** : `id`, `projet_id`, `lot_id` (nullable = global),
`date`, `avancement_pct`, `valeur_planifiee_xof`, `valeur_acquise_xof`,
`cout_reel_xof`, `spi`, `cpi`, `date_fin_projetee`.
Table de precalcul, alimentee par le cron et a chaque validation de releve.
Index sur (`projet_id`, `lot_id`, `date`).

**utilisateur** : `id`, `email`, `nom`, `role`, `projet_ids` (uuid[]),
`mot_de_passe_hash`, `actif`, `cree_le`.

**journal_audit** : `id`, `utilisateur_id`, `action`, `entite`, `entite_id`,
`avant` (jsonb), `apres` (jsonb), `horodatage`.

### 3.3 Conventions

- Tous les montants sont des **entiers de FCFA** en `bigint`. Pas de centimes,
  pas de flottant : aucun arrondi ne se propage dans les cumuls. Le FCFA n'a
  pas de subdivision en usage, la contrainte est donc naturelle.
- Les quantites sont en `numeric(14,3)`, precision au litre pour le beton et
  au kilogramme pour l'acier.
- Toutes les dates de planning sont en jours calendaires ; le calendrier
  ouvrable est une table de configuration separee.

---

## 4. Regles de calcul

### 4.1 Avancement physique d'une tache

Methode des unites physiques, ponderee par la valeur de chaque ligne :

```
avancement(tache) = somme( min(qte_realisee_cumul, qte_prevue) x prix_unitaire )
                    / somme( qte_prevue x prix_unitaire )
```

Le `min` empeche qu'un depassement de quantite fasse depasser 100 %.
Un depassement est signale comme ecart de quantitatif, pas comme avancement.

Les autres methodes disponibles :
- `JALONS_PONDERES` : paliers fixes (ex. 30 % a la fin du coffrage, 60 % au
  ferraillage, 100 % au coulage). Adapte aux taches non mesurables en quantite.
- `PROPORTION_DUREE` : avancement lineaire sur la duree. Reserve aux taches
  support (installation de chantier, encadrement).
- `ZERO_CENT` : 0 % jusqu'a l'achevement, puis 100 %. Pour les taches courtes.

### 4.2 Agregation

```
avancement(noeud) = somme( avancement(enfant) x poids_budgetaire(enfant) )
                    / somme( poids_budgetaire(enfant) )
```

Ponderation par le **budget** et non par la duree : une semaine de terrassement
et une semaine de fondations speciales ne pesent pas le meme poids dans
l'avancement reel d'un chantier. C'est le point de conception a defendre.

### 4.3 Earned Value Management

A la date d'analyse `t` :

| Indicateur | Formule | Lecture |
|---|---|---|
| `BAC` budget a l'achevement | somme des budgets de taches | reference |
| `VP` valeur planifiee | somme( avancement_prevu(t) x budget ) | ce qui devait etre fait |
| `VA` valeur acquise | somme( avancement_reel(t) x budget ) | ce qui est fait, en valeur |
| `CR` cout reel | depenses constatees (main d'oeuvre, engins, materiaux, aleas) | ce que ca a coute |
| `EC` ecart de cout | `VA - CR` | negatif = derive de cout |
| `ED` ecart de delai | `VA - VP` | negatif = retard |
| `CPI` | `VA / CR` | < 1 = on paie plus cher que prevu |
| `SPI` | `VA / VP` | < 1 = on avance moins vite que prevu |
| `EAC` cout estime final | `BAC / CPI` | projection budgetaire |
| `ETC` reste a depenser | `EAC - CR` | |
| `VAC` ecart final | `BAC - EAC` | |
| duree projetee | `duree_contractuelle / SPI` | projection de delai |
| retard estime | `duree_projetee - duree_contractuelle` | en jours |
| penalite prevue | `retard x taux_penalite x montant_marche` | en FCFA |

L'ecart de delai en jours s'obtient plus finement par lecture horizontale de la
courbe en S : on cherche la date `t'` a laquelle `VP(t') = VA(t)`, le retard
vaut `t - t'`.

### 4.4 Chemin critique (CPM)

Sur le graphe oriente acyclique des taches et liaisons :

1. Passe avant, par tri topologique : dates au plus tot
   `ES = max(EF des predecesseurs, ajuste du type de liaison et du decalage)`,
   `EF = ES + duree`.
2. Passe arriere : dates au plus tard `LF`, `LS = LF - duree`.
3. `marge_totale = LS - ES`. Une tache est **critique** si sa marge totale est
   nulle.
4. `marge_libre = min(ES des successeurs) - EF`.
5. Detection de cycle : si le tri topologique ne consomme pas tous les noeuds,
   la saisie est refusee avec la liste des taches en boucle.

Complexite lineaire en nombre de taches et de liaisons. Recalcule a chaque
modification du planning, et memorise dans `tache.marge_totale_j` et
`tache.critique`.

### 4.5 Meteo et journees non travaillables

Source : Open-Meteo, gratuite et sans cle d'API, historique et prevision.

Regles configurables par type de tache :

| Condition | Taches bloquees |
|---|---|
| precipitations > 10 mm sur 24 h | terrassement, VRD, enrobes |
| precipitations > 25 mm sur 24 h | tout travail exterieur |
| temperature < 5 degres | betonnage, enduits |
| temperature > 40 degres | betonnage sans cure renforcee |
| rafales > 50 km/h | levage a la grue |
| rafales > 72 km/h | arret de grue obligatoire |

Une journee non travaillable detectee cree un `alea` de type `INTEMPERIE`
propose au conducteur, qui le confirme. Confirme, il decale les taches
concernees et le CPM est relance. Cela alimente aussi les demandes de
prolongation de delai, qui sont un enjeu contractuel reel.

### 4.6 Simulation d'alea

Le conducteur choisit une tache et un glissement en jours. Le moteur clone en
memoire le graphe, applique le decalage, relance le CPM et restitue :
nouvelle date de fin, jalons contractuels menaces, penalite estimee en FCFA,
liste des taches devenues critiques. Aucune ecriture en base : la simulation
est un calcul pur, donc instantane et sans risque.

---

## 5. Ecrans

### 5.1 Tableau de bord (`/projet/[id]`)

- Bandeau de quatre indicateurs : avancement global en pourcentage, ecart de
  delai en jours, `SPI`, `CPI`. Chacun avec sa tendance sur 30 jours.
- Ligne budgetaire : montant du marche, valeur acquise, cout reel, cout estime
  final, tous en FCFA.
- Courbe en S : valeur planifiee, valeur acquise, cout reel, et projection en
  pointille au-dela de la date du jour.
- Avancement par lot : barres horizontales, prevu en trame claire, realise en
  teinte pleine, ecart chiffre a droite.
- Panneau d'alertes trie par criticite : taches critiques en retard, jalons
  contractuels menaces, non-conformites ouvertes, releves non valides,
  depassements de quantitatif.
- Prochains jalons, avec nombre de jours restants.

### 5.2 Planning (`/projet/[id]/planning`)

Gantt rendu en SVG, developpe sur mesure. Arborescence WBS repliable a gauche,
echelle de temps zoomable (jour, semaine, mois, trimestre) a droite.

- Barre prevue en fond, barre d'avancement reel superposee et plus fine.
- Chemin critique souligne, marge totale representee en trait fin.
- Liaisons tracees en polylignes orthogonales.
- Jalons en losanges, contractuels en plein, internes en contour.
- Ligne verticale du jour, et lignes verticales grisees sur les journees
  non travaillables.
- Survol : infobulle avec dates au plus tot et au plus tard, marges,
  avancement, budget et valeur acquise.
- Glisser-deposer d'une barre : ouvre la simulation avant toute ecriture.

### 5.3 Saisie journaliere (`/projet/[id]/releve`)

L'ecran le plus utilise, concu pour le telephone, en une colonne, gros champs.

Etapes : date et lot, puis meteo prechargee depuis l'API avec possibilite de
correction, puis effectif et heures, puis les quantites du jour ligne par
ligne avec rappel de la quantite prevue et du cumul deja realise, puis les
photos, puis les observations, puis la declaration eventuelle d'un alea, enfin
soumission.

Fonctionnement hors ligne : application web progressive, les releves sont mis
en file dans IndexedDB et synchronises au retour du reseau. Indispensable, la
couverture reseau en fond de chantier est aleatoire.

### 5.4 Quantitatif par lot (`/projet/[id]/lot/[lotId]`)

Tableau dense : designation, unite, quantite prevue, quantite realisee, reste a
faire, avancement, prix unitaire en FCFA, montant, valeur acquise. Totaux par
tache et par lot. Export tableur.

### 5.5 Plan interactif (`/projet/[id]/plan`)

Plan masse et plans de niveau en SVG. Chaque zone est coloree selon son
avancement : gris pour non commence, ambre pour en cours, vert pour acheve,
rouge pour en retard sur une tache critique. Selecteur de niveau, curseur
temporel pour rejouer l'avancement dans le temps. Le clic sur une zone ouvre
le detail des taches rattachees.

### 5.6 Timeline photographique (`/projet/[id]/photos`)

Regroupement par point de vue. Pour un point de vue donne, curseur temporel ou
comparateur a volet coulissant entre deux dates. Vue en grille par date pour le
reste. Filtres par lot, tache, zone, presence de non-conformite.

### 5.7 Analyses (`/projet/[id]/analyses`)

- Courbe en S detaillee, avec lecture de l'ecart horizontal en jours.
- Histogramme des effectifs jour par jour, courbe de charge prevue superposee.
- Consommation cumulee des materiaux cles : beton en metres cubes, acier en
  tonnes, coffrage en metres carres, prevu contre realise.
- Rendements : quantite par ouvrier et par jour, par type de tache. Detecte les
  baisses de productivite avant qu'elles ne se traduisent en retard.
- Repartition des aleas par type et par gravite, et jours perdus cumules.
- Histogramme des journees non travaillables par cause.

### 5.8 Simulation (`/projet/[id]/simulation`)

Formulaire de scenario, resultat compare a la reference, superposition des deux
Gantt, tableau des jalons impactes avec la penalite en FCFA. Possibilite
d'enregistrer un scenario pour le presenter en reunion de chantier.

### 5.9 Rapports (`/projet/[id]/rapports`)

Generation d'un rapport hebdomadaire ou mensuel en PDF : page de garde,
synthese des indicateurs, avancement par lot, faits marquants, aleas de la
periode, meteo, effectifs, planche photographique, jalons a venir. Rendu en
React puis converti en PDF cote serveur.

---

## 6. Pile technique

| Couche | Choix | Justification |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Monolithe full-stack : le rendu et l'acces aux donnees sont colocalises, ce qui supprime la latence des appels API depuis le navigateur. |
| Interface | Tailwind CSS 4 + shadcn/ui | Composants accessibles, sans dependance lourde. |
| Icones | Lucide React | SVG, aucune image, aucun emoji. |
| Graphiques | Recharts pour les courbes, SVG sur mesure pour le Gantt et le plan | Le Gantt maison est le morceau technique a valoriser. |
| ORM | Drizzle ORM | Requetes typees, tres leger, adapte au serverless, permet d'ecrire du SQL brut pour les agregats. |
| Base | PostgreSQL managee Supabase, region `eu-central-1` | Gratuit et durable, pooler de connexions inclus, stockage de fichiers integre. |
| Fichiers | Supabase Storage | Photos et vignettes, URL signees. |
| Authentification | Auth.js v5, identifiants et sessions JWT | Cinq roles, controle d'acces cote serveur. |
| Validation | Zod, partagee client et serveur | Un seul schema pour le formulaire et l'API. |
| Graphe | Implementation CPM maison en TypeScript | Environ 150 lignes, testable unitairement, aucune dependance. |
| PDF | React PDF ou Puppeteer sur fonction serverless | Rapports. |
| Hors ligne | Service worker + IndexedDB via Dexie | Saisie de chantier sans reseau. |
| Meteo | Open-Meteo | Gratuit, sans cle, historique et prevision. |
| Tests | Vitest pour les calculs, Playwright pour les parcours | Les formules EVM et le CPM doivent etre couverts. |
| Hebergement | Vercel, region `fra1` | Pas de mise en veille, meme region que la base. |
| Taches planifiees | Vercel Cron | Recalcul nocturne des instantanes, releve meteo. |

### Alternative performance maximale

Cloudflare Workers et D1, avec Hono et Drizzle. Les Workers demarrent en
quelques millisecondes et Cloudflare dispose de points de presence a Abidjan,
Accra, Dakar, Lagos et Johannesburg : le code s'executerait a une dizaine de
millisecondes de l'utilisateur. Limites : D1 est une base SQLite dont les
ecritures restent mono-region, et l'outillage est moins standard. A retenir si
la reactivite depuis l'Afrique de l'Ouest devient le critere principal.

### Pourquoi pas un back separe

Un service Node ou FastAPI deploye a part sur une offre gratuite cumule trois
handicaps : mise en veille apres quinze minutes avec un reveil de trente a
soixante secondes, un dixieme de coeur partage, et surtout une chaine de
latence navigateur vers back vers base dont chaque maillon est paye a chaque
appel. Le monolithe a rendu serveur supprime le maillon le plus couteux.

---

## 7. Regles de performance a tenir

1. Fonctions et base dans la meme region : `fra1` et `eu-central-1`.
2. Connexion par le pooler Supabase, port 6543, mode transaction. Obligatoire
   en serverless, sous peine d'epuiser les connexions Postgres.
3. Les indicateurs sont calcules en une seule requete SQL agregee. Jamais de
   boucle applicative emettant une requete par tache.
4. Les instantanes journaliers sont precalcules dans `snapshot_avancement`. Le
   tableau de bord et la courbe en S sont alors une simple lecture indexee.
5. Server Components par defaut. `"use client"` reserve au Gantt, aux
   formulaires et au comparateur de photos.
6. Photos compressees en WebP dans le navigateur avant envoi, vignettes servies
   par `next/image`. Une photo de telephone brute pese cinq megaoctets, la
   version utile en pese cent kilooctets.
7. Cache par etiquette avec invalidation a la validation d'un releve.
8. Un cron quotidien reveille la base, recupere la meteo et recalcule les
   instantanes.

Objectifs mesurables : premier rendu utile sous 1,5 seconde en 4G,
navigation entre ecrans sous 400 millisecondes, soumission d'un releve sous
1 seconde.

---

## 8. Jeu de donnees de demonstration

Chantier plausible et de taille maitrisable, pour ne pas passer le projet a
saisir des donnees.

- Operation : 24 logements, R+3, un seul batiment, Abidjan.
- Montant du marche : 2 100 000 000 FCFA.
- Duree contractuelle : 14 mois, ordre de service au 6 janvier 2025.
- Penalite de retard : un millieme du montant du marche par jour calendaire.
- 8 lots : installation de chantier, terrassement et VRD, fondations,
  gros oeuvre, charpente et couverture, second oeuvre, lots techniques,
  finitions et amenagements exterieurs.
- Environ 60 taches, 80 liaisons, 6 jalons dont 4 contractuels.
- 6 mois d'historique de releves journaliers, meteo reelle recuperee via
  Open-Meteo pour Abidjan.
- Une derive volontaire de 12 jours sur le gros oeuvre, causee par deux aleas :
  une serie d'intemperies en juin et une rupture d'approvisionnement en acier.
  Cette derive est ce qui permet de demontrer les alertes, la projection de
  date de fin, le calcul de penalite et la simulation.
- 4 points de vue photographiques, 8 dates de prise de vue chacun.

Un script de peuplement genere l'ensemble de facon deterministe, pour que la
demonstration soit reproductible.

---

## 9. Deroulement du projet

| Sprint | Contenu | Livrable verifiable |
|---|---|---|
| 1 | Initialisation, schema Drizzle, migrations, script de peuplement | Base peuplee, requetes de lecture fonctionnelles |
| 2 | Authentification, roles, mise en page, navigation, vue lot et quantitatif | Parcours de lecture complet |
| 3 | Saisie journaliere, calcul et agregation de l'avancement, validation | Un releve saisi fait bouger l'avancement du projet |
| 4 | Moteur CPM, Gantt SVG, jalons, marges | Chemin critique affiche et juste, valide par tests |
| 5 | EVM, courbe en S, tableau de bord, alertes | Indicateurs conformes au calcul manuel de reference |
| 6 | Meteo, aleas, simulation | Un scenario produit une date de fin et une penalite |
| 7 | Photos, timeline, plan interactif | Comparaison visuelle sur un point de vue |
| 8 | Rapports PDF, mode hors ligne, tests, deploiement, optimisation | Application en ligne, rapport hebdomadaire genere |

Les sprints 7 et 8 sont reductibles si le temps manque : le coeur soutenable
d'un memoire de genie civil est constitue des sprints 1 a 6.

---

## 10. Points a documenter dans le memoire

- Justification de la ponderation budgetaire de l'avancement, avec un
  contre-exemple chiffre montrant ce que donnerait une ponderation par duree.
- Demonstration de l'algorithme CPM sur un sous-graphe de dix taches, calcule
  a la main puis compare a la sortie de l'application.
- Verification des indicateurs EVM sur une date donnee, calcul manuel contre
  calcul applicatif.
- Choix d'architecture : mesure de la latence avant et apres suppression du
  back separe, avec captures de l'onglet reseau.
- Limites : la saisie des quantites reste declarative, l'application ne mesure
  rien physiquement. Pistes d'evolution vers un releve par scan ou par
  rapprochement avec les bons de livraison.

---

## 11. Gestion de la base de donnees

### 11.1 Principe directeur

Le schema est du code, la base n'est qu'une consequence. Aucune modification
de structure n'est faite depuis l'interface Supabase. Le cycle est toujours :
modifier `src/db/schema.ts`, generer la migration SQL, la relire, l'appliquer,
la versionner dans Git. Sans cette discipline, la base locale et la base en
ligne divergent et la derive devient impossible a rattraper.

### 11.2 Deux environnements

| | Developpement | Production |
|---|---|---|
| Base | PostgreSQL 16 en Docker, machine locale | Supabase, `eu-central-1` |
| Latence | nulle | ~5 ms depuis la fonction Vercel |
| Photos | dossier `public/uploads` | Supabase Storage |
| Destruction | libre | jamais |
| Peuplement | `npm run db:seed` a volonte | une seule fois |

Le developpement se fait entierement hors ligne, ce qui rend supportable la
mise au point des formules EVM : reinitialiser, repeupler, verifier.

### 11.3 Les deux URL de connexion

Supabase expose deux points d'entree et les deux sont necessaires.

- `DATABASE_URL`, pooler pgBouncer, port 6543, mode transaction : utilise par
  l'application a l'execution. Indispensable en serverless, ou chaque
  invocation ouvre sa propre connexion et saturerait les soixante connexions
  de l'offre gratuite.
- `DIRECT_URL`, connexion directe, port 5432 : utilise uniquement par les
  migrations. pgBouncer en mode transaction ne supporte ni les requetes
  preparees ni le DDL transactionnel.

Le client doit etre configure avec `prepare: false` et `max: 1`. Sans ces deux
options, l'application fonctionne en local et echoue en production.

### 11.4 Cycle de vie d'une migration

1. Modification de `src/db/schema.ts`.
2. `drizzle-kit generate --name=...` produit un fichier SQL horodate.
3. Relecture systematique du SQL genere.
4. `drizzle-kit migrate` applique en local.
5. Le schema et la migration sont commites ensemble.

En production la migration s'applique au deploiement, via le `buildCommand`
de Vercel : `drizzle-kit migrate && next build`. Si la migration echoue, le
deploiement echoue et la version precedente reste en ligne.

Deux regles strictes :
- `drizzle-kit push` ne touche jamais la production. Cette commande synchronise
  sans ecrire de migration ; elle est reservee a la base Docker jetable.
- Une migration appliquee ne se modifie plus. Une erreur se corrige par une
  nouvelle migration.

### 11.5 Donnees derivees

Trois categories a ne jamais confondre.

| Categorie | Exemples | Regle |
|---|---|---|
| Source de verite | quantites relevees, dates prevues, prix unitaires, liaisons | saisie humaine, sauvegardee, auditee |
| Cache recalculable | `tache.avancement_pct`, marges, `critique`, `snapshot_avancement` | peut etre detruit et reconstruit integralement |
| Calcul a la volee | resultats de simulation | jamais ecrit en base |

Invariant a preserver : il existe une fonction `recompute(projetId)` qui
reconstruit tout le cache a partir de la seule source de verite. Aucune
incoherence n'est alors definitive.

Le recalcul est declenche a la validation d'un releve, dans la meme
transaction, a toute modification du planning, et chaque nuit par le cron.

Les mutations sont idempotentes : la validation ne s'applique qu'a un releve
dont le statut est `SOUMIS`, ce qui neutralise un double envoi.

### 11.6 Integrite deleguee a Postgres

Toute regle que la base peut garantir est exprimee en contrainte, et non
seulement en validation applicative.

- Index unique partiel : un seul releve actif par lot et par jour, en excluant
  le statut `RECTIFIE`.
- Contraintes de verification : quantites et prix positifs, date de fin
  posterieure a la date de debut, pas de liaison d'une tache vers elle-meme.
- Suppressions en cascade choisies explicitement : `cascade` de projet vers lot
  et tache, `cascade` de releve vers ses lignes de quantite, `restrict` de
  tache vers releve de quantite pour refuser la suppression d'une tache deja
  realisee, `set null` sur l'auteur d'un releve pour qu'un compte supprime
  n'efface pas l'historique.

La detection de cycle dans le graphe des liaisons n'est pas exprimable en
contrainte simple : elle reste dans le moteur CPM, qui refuse la saisie et
nomme les taches en boucle.

### 11.7 Audit par declencheur

Un declencheur PL/pgSQL alimente `journal_audit` avec l'operation, la table,
l'identifiant, et les etats avant et apres en JSONB. Pose sur
`releve_journalier`, `releve_quantite`, `tache` et `ligne_quantitatif`.
L'identite de l'utilisateur est transmise par `SET LOCAL app.user_id` en debut
de transaction.

Un declencheur ne s'oublie pas, contrairement a un appel applicatif. La
tracabilite du dossier des ouvrages executes etant une exigence contractuelle
reelle, ce choix est directement defendable dans le memoire.

### 11.8 Securite

La Row Level Security de Supabase repond au cas ou le navigateur parle
directement a Postgres. Ce n'est pas notre architecture : toutes les lectures
passent par des Server Components et toutes les ecritures par des Server
Actions.

Choix retenu : RLS activee avec une politique de refus general sur toutes les
tables, acces exclusivement par la cle de service cote serveur. La RLS devient
un filet de securite, et l'autorisation reelle est controlee dans la couche
applicative, ou elle est testable.

Une fonction garde unique, appelee en tete de chaque Server Action, verifie la
session, le role et l'appartenance au projet.

Le filtrage des donnees reservees, notamment le masquage des couts internes et
des effectifs pour le role `MOA`, se fait par selection explicite des colonnes
dans la requete. Une donnee qui ne doit pas etre vue ne quitte pas le serveur.

### 11.9 Typage : deux points de vigilance

**Montants.** Colonnes `bigint`, declarees en mode numerique dans Drizzle, car
le pilote renvoie sinon des chaines de caracteres. La precision exacte d'un
nombre JavaScript s'etend jusqu'a 9 007 199 254 740 991, soit neuf millions de
milliards de FCFA, pour un marche de 2,1 milliards : la marge est de six ordres
de grandeur.

**Dates.** Deux types, deux usages, jamais melanges. Le type `date` pour les
dates de planning et la date d'un releve, car une journee de chantier n'a ni
heure ni fuseau. Le type `timestamptz` pour les instants reels : validation,
prise de vue, audit. La Cote d'Ivoire etant a UTC+0, l'erreur reste invisible
en developpement local et apparait des que le serveur raisonne en UTC ; elle se
previent par le typage, pas par des correctifs.

### 11.10 Fichiers

Aucun binaire en base. La table `photo` ne contient qu'un chemin ; le fichier
vit dans Supabase Storage.

Chaine de traitement : compression WebP dans le navigateur, longueur maximale
1600 pixels, qualite 0,8, ce qui ramene une photo de telephone de cinq
megaoctets a environ cent vingt kilooctets ; envoi direct vers Storage par URL
signee, sans transiter par la fonction serverless ; generation d'une vignette
de 400 pixels ; ecriture du chemin en base.

### 11.11 Index

Crees des la premiere migration, et non apres avoir constate la lenteur.

| Index | Colonnes | Usage |
|---|---|---|
| `idx_snapshot` | projet, lot, date | tableau de bord, courbe en S |
| `idx_releve_projet_date` | projet, date | journal de chantier |
| `idx_rq_ligne` | ligne de quantitatif | cumuls de quantites |
| `idx_tache_lot` | lot | vue par lot |
| `idx_liaison_amont` | tache amont | parcours du graphe CPM |
| `idx_liaison_aval` | tache aval | parcours du graphe CPM |
| `idx_photo_pdv_date` | point de vue, prise le | timeline comparative |

### 11.12 Sauvegardes

L'offre gratuite Supabase n'inclut aucune sauvegarde automatique ni
restauration a un instant donne. C'est le risque principal du projet.

Dispositif : une action GitHub quotidienne a trois heures execute `pg_dump` par
la connexion directe, compresse le resultat et le conserve trente jours comme
artefact. Le declenchement manuel est active pour permettre une sauvegarde
avant chaque migration en production.

Deux obligations : une sauvegarde manuelle et une copie locale hors GitHub la
veille de la soutenance ; et une restauration testee au moins une fois sur la
base Docker, une sauvegarde jamais restauree n'etant pas une sauvegarde.

### 11.13 Limites de l'offre gratuite

| Ressource | Plafond | Consommation estimee |
|---|---|---|
| Taille de la base | 500 Mo | ~15 Mo avec le jeu de demonstration |
| Stockage de fichiers | 1 Go | ~40 Mo de photos compressees |
| Bande passante | 5 Go par mois | tres large |
| Mise en pause | 7 jours sans requete | neutralisee par le cron quotidien |

La mise en pause est le seul piege reel. Le cron quotidien maintient la base
eveillee, mais l'etat de la base doit etre verifie plusieurs jours avant la
soutenance et non le matin meme.

### 11.14 Organisation des fichiers

```
src/db/
  schema.ts          tables, enums, index, contraintes — source de verite
  index.ts           client Drizzle, configuration du pooler
  queries/           lectures : dashboard, gantt, quantitatif
  mutations/         ecritures, transactionnelles
  compute/           avancement, evm, cpm — logique pure, testee unitairement
  seed/              projet, planning, releves, meteo
drizzle/             migrations SQL versionnees, jamais editees
  meta/
```

Commandes : `db:up` demarre Docker, `db:generate` produit une migration,
`db:migrate` l'applique, `db:seed` peuple, `db:reset` enchaine les trois en
local, `db:studio` ouvre l'explorateur, `db:dump` sauvegarde manuellement.

Le peuplement utilise un generateur pseudo-aleatoire a graine fixe : les memes
donnees a chaque execution, donc une demonstration reproductible et des tests
dont les valeurs attendues ne bougent pas.
