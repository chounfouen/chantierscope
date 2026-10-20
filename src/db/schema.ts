/**
 * Schema relationnel de ChantierScope.
 *
 * Source de verite unique de la structure de la base. Toute modification passe
 * par ce fichier, puis par `npm run db:generate`, jamais par une interface
 * graphique ni par `drizzle-kit push` hors base locale jetable.
 *
 * Conventions
 * -----------
 * - Montants : `bigint` en mode numerique, en ENTIERS de FCFA. Le franc CFA n'a
 *   pas de subdivision en usage. Un nombre JavaScript est exact jusqu'a
 *   9 007 199 254 740 991, soit six ordres de grandeur au-dessus du montant du
 *   marche : aucun risque d'arrondi sur les cumuls.
 * - Quantites : `numeric(14,3)` en mode numerique. Precision au litre pour le
 *   beton, au kilogramme pour l'acier. Les valeurs restent inferieures au
 *   million, donc tres loin des limites de la representation flottante.
 * - Dates de planning : type `date`, sans heure ni fuseau. Une journee de
 *   chantier n'a pas de fuseau ; `timestamptz` provoquerait des decalages d'un
 *   jour. Elles circulent en chaine `AAAA-MM-JJ`.
 * - Instants reels : `timestamptz`. Validation, prise de vue, audit.
 * - Nommage : camelCase en TypeScript, snake_case en base, converti par
 *   `casing: 'snake_case'`.
 *
 * Tout ce que PostgreSQL peut garantir est exprime en contrainte, et non
 * seulement en validation applicative : une regle verifiee uniquement en
 * JavaScript sera contournee un jour par un script ou une correction manuelle.
 */

import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/* ========================================================================== */
/* Enumerations                                                              */
/* ========================================================================== */

export const roleUtilisateur = pgEnum('role_utilisateur', [
  'CHEF_CHANTIER',
  'CONDUCTEUR',
  'MOE',
  'MOA',
  'ADMIN',
])

export const uniteMesure = pgEnum('unite_mesure', [
  'M3',
  'M2',
  'ML',
  'KG',
  'T',
  'U',
  'ENS',
  'FORFAIT',
])

/**
 * Nature d'ouvrage. Ne sert pas au classement mais aux regles meteo : c'est
 * elle qui determine si une journee de pluie bloque la tache.
 */
export const natureTache = pgEnum('nature_tache', [
  'TERRASSEMENT',
  'VRD',
  'ENROBES',
  'FONDATION',
  'BETONNAGE',
  'LEVAGE',
  'MACONNERIE',
  'CHARPENTE',
  'ETANCHEITE',
  'ENDUIT',
  'INTERIEUR',
  'SUPPORT',
])

export const methodeAvancement = pgEnum('methode_avancement', [
  /** Quantites realisees sur quantites prevues, ponderees par la valeur. */
  'UNITES_PHYSIQUES',
  /** Paliers fixes, pour les taches non mesurables en quantite. */
  'JALONS_PONDERES',
  /** Lineaire sur la duree. Reserve aux taches support. */
  'PROPORTION_DUREE',
  /** Zero jusqu'a l'achevement, puis cent. Pour les taches courtes. */
  'ZERO_CENT',
])

export const typeLiaison = pgEnum('type_liaison', ['FD', 'DD', 'FF', 'DF'])

export const statutReleve = pgEnum('statut_releve', ['BROUILLON', 'SOUMIS', 'VALIDE', 'RECTIFIE'])

export const typeAlea = pgEnum('type_alea', [
  'INTEMPERIE',
  'INCIDENT',
  'NON_CONFORMITE',
  'AVENANT',
  'PANNE_ENGIN',
  'RUPTURE_APPROVISIONNEMENT',
  'ADMINISTRATIF',
])

export const statutAlea = pgEnum('statut_alea', ['OUVERT', 'EN_TRAITEMENT', 'SOLDE'])

/**
 * Sort d'une journee d'intemperie au sens contractuel. Une journee non
 * travaillee pour cause de meteo est PROPOSEE a partir du journal ; elle
 * n'ouvre droit a prolongation qu'une fois RECONNUE contradictoirement par le
 * maitre d'oeuvre ou le conducteur, et seulement au-dela du nombre de
 * journees reputees previsibles fixe au CCAP.
 */
export const decisionIntemperie = pgEnum('decision_intemperie', ['PROPOSEE', 'RECONNUE', 'REJETEE'])

export const typeOrdreService = pgEnum('type_ordre_service', [
  'DEMARRAGE',
  'ARRET',
  'REPRISE',
  'PROLONGATION',
  'AUTRE',
])

export const typeRessource = pgEnum('type_ressource', ['EQUIPE', 'ENGIN', 'MATERIEL', 'MATERIAU'])

export const uniteCout = pgEnum('unite_cout', ['JOUR', 'HEURE', 'UNITE'])

/** Familles d'ouvrages d'une maquette, regroupant les classes IFC. Voir src/lib/maquette/regles.ts. */
export const familleOuvrage = pgEnum('famille_ouvrage', [
  'MURS',
  'POTEAUX',
  'POUTRES',
  'DALLES',
  'FONDATIONS',
  'ESCALIERS',
  'TOITURE',
  'MENUISERIES',
  'GARDE_CORPS',
  'REVETEMENTS',
  'EQUIPEMENTS',
  'AUTRES',
])

/** Format du fichier importe comme fond de plan, avant conversion en image. */
export const formatPlan = pgEnum('format_plan', ['DXF', 'PDF', 'SVG', 'IMAGE'])

/* ========================================================================== */
/* Utilisateurs et acces                                                     */
/* ========================================================================== */

export const utilisateur = pgTable(
  'utilisateur',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    nom: text().notNull(),
    role: roleUtilisateur().notNull(),
    motDePasseHash: text().notNull(),
    actif: boolean().notNull().default(true),
    /**
     * Les sessions ouvertes avant cet instant sont refusees. Pose au
     * changement de mot de passe : un jeton derobe ne survit pas au
     * changement que son vol a motive.
     */
    sessionsValidesApres: timestamp({ withTimezone: true }).notNull().defaultNow(),
    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('utilisateur_email_unique').on(sql`lower(${t.email})`)],
).enableRLS()

/**
 * Tentatives de connexion, pour limiter les essais de mot de passe.
 *
 * Sans limite, la force brute en ligne est libre. Cinq echecs en quinze
 * minutes bloquent l'adresse, vingt bloquent l'adresse IP : de quoi gener un
 * attaquant sans enfermer dehors un chef de chantier qui se trompe deux fois.
 * La table est purgee chaque nuit au-dela de vingt-quatre heures.
 */
export const tentativeConnexion = pgTable(
  'tentative_connexion',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    email: text().notNull(),
    ip: text(),
    reussie: boolean().notNull(),
    le: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tentative_email_le_idx').on(sql`lower(${t.email})`, t.le),
    index('tentative_ip_le_idx').on(t.ip, t.le),
  ],
).enableRLS()

/**
 * Acces d'un utilisateur a un projet.
 *
 * La conception initiale portait une colonne tableau `projet_ids` sur
 * l'utilisateur. Une table de liaison lui est preferee : elle est indexable,
 * elle porte l'integrite referentielle, et elle survit a un projet supprime.
 */
export const accesProjet = pgTable(
  'acces_projet',
  {
    utilisateurId: uuid()
      .notNull()
      .references(() => utilisateur.id, { onDelete: 'cascade' }),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.utilisateurId, t.projetId] }),
    index('acces_projet_projet_idx').on(t.projetId),
  ],
).enableRLS()

/* ========================================================================== */
/* Projet, lots, taches                                                      */
/* ========================================================================== */

export const projet = pgTable(
  'projet',
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    nom: text().notNull(),
    maitreOuvrage: text().notNull(),
    maitreOeuvre: text().notNull(),
    entreprise: text().notNull(),
    lieu: text().notNull(),

    /** Coordonnees du chantier, pour le releve meteo. */
    latitude: numeric({ precision: 9, scale: 6, mode: 'number' }).notNull(),
    longitude: numeric({ precision: 9, scale: 6, mode: 'number' }).notNull(),

    dateOrdreService: date().notNull(),
    dureeContractuelleJ: integer().notNull(),
    /** Figee a la signature : elle materialise l'engagement contractuel. */
    dateFinContractuelle: date().notNull(),

    montantMarcheXof: bigint({ mode: 'number' }).notNull(),
    /** Fraction du montant du marche due par jour calendaire de retard. */
    tauxPenaliteJournaliere: numeric({ precision: 8, scale: 7, mode: 'number' })
      .notNull()
      .default(0.001),
    /**
     * Plafond du cumul des penalites de retard, en fraction du montant du
     * marche. Le CCAG Travaux 2021 le fixe a 10 % du montant hors taxes
     * (article 19.2.2) ; le CCAP peut y deroger, d'ou une valeur par projet.
     */
    plafondPenalite: numeric({ precision: 5, scale: 4, mode: 'number' }).notNull().default(0.1),
    /**
     * Journees d'intemperie reputees previsibles, fixees au CCAP : seules
     * celles qui les depassent prolongent le delai d'execution.
     */
    intemperiesPrevisiblesJ: integer().notNull().default(0),
    /**
     * Clauses financieres du CCAP, qui fondent les situations mensuelles.
     * La retenue de garantie est une fraction des travaux executes, rendue a
     * la reception ; l'avance de demarrage une fraction du montant initial,
     * remboursee lineairement entre deux seuils d'execution du marche.
     */
    retenueGarantieTaux: numeric({ precision: 5, scale: 4, mode: 'number' })
      .notNull()
      .default(0.05),
    avanceDemarrageTaux: numeric({ precision: 5, scale: 4, mode: 'number' }).notNull().default(0),
    avanceRemboursementDebut: numeric({ precision: 5, scale: 4, mode: 'number' })
      .notNull()
      .default(0.65),
    avanceRemboursementFin: numeric({ precision: 5, scale: 4, mode: 'number' })
      .notNull()
      .default(0.8),

    devise: text().notNull().default('XOF'),
    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('projet_devise_xof', sql`${t.devise} = 'XOF'`),
    check('projet_duree_positive', sql`${t.dureeContractuelleJ} > 0`),
    check('projet_montant_positif', sql`${t.montantMarcheXof} > 0`),
    check(
      'projet_penalite_fraction',
      sql`${t.tauxPenaliteJournaliere} >= 0 and ${t.tauxPenaliteJournaliere} <= 1`,
    ),
    check(
      'projet_plafond_penalite_fraction',
      sql`${t.plafondPenalite} >= 0 and ${t.plafondPenalite} <= 1`,
    ),
    check('projet_fin_apres_debut', sql`${t.dateFinContractuelle} > ${t.dateOrdreService}`),
    check(
      'projet_clauses_financieres_fractions',
      sql`${t.retenueGarantieTaux} between 0 and 1 and ${t.avanceDemarrageTaux} between 0 and 1`,
    ),
    check(
      'projet_seuils_avance_ordonnes',
      sql`${t.avanceRemboursementDebut} >= 0 and ${t.avanceRemboursementDebut} < ${t.avanceRemboursementFin} and ${t.avanceRemboursementFin} <= 1`,
    ),
  ],
).enableRLS()

export const lot = pgTable(
  'lot',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    nom: text().notNull(),
    ordre: smallint().notNull(),
    budgetXof: bigint({ mode: 'number' }).notNull(),
    /**
     * Emplacement dans la palette categorielle, de 0 a 7.
     *
     * Stocke, et non derive de l'ordre d'affichage : la couleur suit l'entite,
     * jamais son rang. Un filtre qui masque trois lots ne doit pas repeindre
     * les cinq autres.
     */
    rangCouleur: smallint().notNull(),
  },
  (t) => [
    unique('lot_code_unique').on(t.projetId, t.code),
    /** Cible de la cle etrangere composite du releve : lot ET projet. */
    unique('lot_id_projet_unique').on(t.id, t.projetId),
    unique('lot_rang_couleur_unique').on(t.projetId, t.rangCouleur),
    check('lot_budget_positif', sql`${t.budgetXof} >= 0`),
    check('lot_rang_couleur_borne', sql`${t.rangCouleur} between 0 and 7`),
  ],
).enableRLS()

export const tache = pgTable(
  'tache',
  {
    id: uuid().primaryKey().defaultRandom(),
    lotId: uuid()
      .notNull()
      .references(() => lot.id, { onDelete: 'cascade' }),
    /** Hierarchie de la WBS. Nul pour un noeud de premier niveau du lot. */
    parentId: uuid().references((): AnyPgColumn => tache.id, { onDelete: 'cascade' }),

    codeWbs: text().notNull(),
    nom: text().notNull(),
    nature: natureTache().notNull(),
    methodeAvancement: methodeAvancement().notNull().default('UNITES_PHYSIQUES'),

    dateDebutPrevue: date().notNull(),
    dateFinPrevue: date().notNull(),
    dureePrevueJ: integer().notNull(),
    dateDebutReelle: date(),
    dateFinReelle: date(),
    /**
     * Contrainte « pas avant » posee par le conducteur de travaux. Source de
     * verite : le recalage du planning la respecte au lieu de l'effacer. Les
     * dates prevues en decoulent, par le calcul au plus tot du reseau.
     */
    debutImpose: date(),

    /* --- Cache recalculable. Reconstructible par recompute(). --------------- */

    /** Somme des montants des lignes de quantitatif. */
    poidsBudgetaireXof: bigint({ mode: 'number' }).notNull().default(0),
    /** Fraction entre 0 et 1. */
    avancementPct: numeric({ precision: 7, scale: 6, mode: 'number' }).notNull().default(0),
    margeLibreJ: integer(),
    margeTotaleJ: integer(),
    critique: boolean().notNull().default(false),
  },
  (t) => [
    unique('tache_code_wbs_unique').on(t.lotId, t.codeWbs),
    index('tache_lot_idx').on(t.lotId),
    index('tache_parent_idx').on(t.parentId),
    check('tache_duree_positive', sql`${t.dureePrevueJ} > 0`),
    check('tache_fin_apres_debut', sql`${t.dateFinPrevue} >= ${t.dateDebutPrevue}`),
    check(
      'tache_fin_reelle_apres_debut',
      sql`${t.dateFinReelle} is null or ${t.dateDebutReelle} is null or ${t.dateFinReelle} >= ${t.dateDebutReelle}`,
    ),
    check('tache_avancement_fraction', sql`${t.avancementPct} between 0 and 1`),
    check('tache_pas_son_propre_parent', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
).enableRLS()

/**
 * Liaison entre deux taches du reseau.
 *
 * La detection de cycle n'est pas exprimable en contrainte SQL simple : elle
 * reste dans le moteur CPM, qui refuse la saisie et nomme les taches en boucle.
 * La contrainte ci-dessous n'ecarte que la boucle immediate.
 */
export const liaison = pgTable(
  'liaison',
  {
    id: uuid().primaryKey().defaultRandom(),
    tacheAmontId: uuid()
      .notNull()
      .references(() => tache.id, { onDelete: 'cascade' }),
    tacheAvalId: uuid()
      .notNull()
      .references(() => tache.id, { onDelete: 'cascade' }),
    type: typeLiaison().notNull().default('FD'),
    /** Decalage en jours calendaires. Peut etre negatif (recouvrement). */
    decalageJ: integer().notNull().default(0),
  },
  (t) => [
    unique('liaison_unique').on(t.tacheAmontId, t.tacheAvalId, t.type),
    index('liaison_amont_idx').on(t.tacheAmontId),
    index('liaison_aval_idx').on(t.tacheAvalId),
    check('liaison_pas_reflexive', sql`${t.tacheAmontId} <> ${t.tacheAvalId}`),
  ],
).enableRLS()

export const ligneQuantitatif = pgTable(
  'ligne_quantitatif',
  {
    id: uuid().primaryKey().defaultRandom(),
    tacheId: uuid()
      .notNull()
      .references(() => tache.id, { onDelete: 'cascade' }),
    designation: text().notNull(),
    unite: uniteMesure().notNull(),
    quantitePrevue: numeric({ precision: 14, scale: 3, mode: 'number' }).notNull(),
    prixUnitaireXof: bigint({ mode: 'number' }).notNull(),
    /**
     * Colonne generee : le montant ne peut pas diverger du produit.
     * Arrondi a l'entier de FCFA, la devise n'ayant pas de subdivision.
     */
    montantXof: bigint({ mode: 'number' }).generatedAlwaysAs(
      sql`round(quantite_prevue * prix_unitaire_xof)::bigint`,
    ),
  },
  (t) => [
    index('ligne_quantitatif_tache_idx').on(t.tacheId),
    check('ligne_quantite_positive', sql`${t.quantitePrevue} > 0`),
    check('ligne_prix_positif', sql`${t.prixUnitaireXof} >= 0`),
  ],
).enableRLS()

/* ========================================================================== */
/* Releves journaliers                                                       */
/* ========================================================================== */

export const releveJournalier = pgTable(
  'releve_journalier',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    lotId: uuid()
      .notNull()
      .references(() => lot.id, { onDelete: 'cascade' }),
    date: date().notNull(),
    /** Un compte supprime n'efface pas l'historique du chantier. */
    auteurId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),

    effectifOuvriers: smallint().notNull().default(0),
    effectifEncadrement: smallint().notNull().default(0),
    heuresTravaillees: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull().default(0),

    /** Code meteo WMO, tel que renvoye par Open-Meteo. */
    meteoCode: smallint(),
    temperatureC: numeric({ precision: 4, scale: 1, mode: 'number' }),
    precipitationsMm: numeric({ precision: 6, scale: 2, mode: 'number' }),
    rafalesKmh: numeric({ precision: 5, scale: 1, mode: 'number' }),
    /**
     * Vrai si le chef de chantier a corrige la meteo prechargee. Une
     * observation de terrain prime sur le modele : la tache nocturne ne la
     * remplace jamais.
     */
    meteoCorrigee: boolean().notNull().default(false),

    journeeTravaillee: boolean().notNull().default(true),
    motifArret: text(),
    observations: text(),

    statut: statutReleve().notNull().default('BROUILLON'),
    valideParId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
    valideLe: timestamp({ withTimezone: true }),
    /** Releve rectificatif qui remplace celui-ci, le cas echeant. */
    remplacePar: uuid().references((): AnyPgColumn => releveJournalier.id, {
      onDelete: 'set null',
    }),

    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
    modifieLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /**
     * Revision de la saisie, horodatee par le telephone a chaque envoi. Une
     * version plus ancienne qui arrive apres une plus recente — file hors
     * ligne rejouee pendant que le chef renvoie en direct — est ignoree au
     * lieu d'ecraser la recente.
     */
    revision: bigint({ mode: 'number' }).notNull().default(0),
  },
  (t) => [
    /**
     * Un seul releve ACTIF par lot et par jour. Les releves rectifies sortent
     * de la contrainte : ils restent en base comme trace, sans bloquer le
     * releve qui les remplace.
     */
    uniqueIndex('releve_actif_unique')
      .on(t.lotId, t.date)
      .where(sql`statut <> 'RECTIFIE'`),
    /**
     * Le lot d'un releve appartient au projet du releve. Sans cette cle
     * composite, rien n'interdisait en base un releve du projet B rattache a
     * un lot du projet A : la regle ne vivait que dans le code applicatif.
     */
    foreignKey({
      name: 'releve_lot_meme_projet',
      columns: [t.lotId, t.projetId],
      foreignColumns: [lot.id, lot.projetId],
    }).onDelete('cascade'),
    index('releve_projet_date_idx').on(t.projetId, t.date),
    index('releve_statut_idx').on(t.statut),
    check(
      'releve_effectifs_positifs',
      sql`${t.effectifOuvriers} >= 0 and ${t.effectifEncadrement} >= 0`,
    ),
    check('releve_heures_positives', sql`${t.heuresTravaillees} >= 0`),
    /** Une journee declaree non travaillee doit porter sa cause. */
    check('releve_arret_motive', sql`${t.journeeTravaillee} or ${t.motifArret} is not null`),
    /** Un releve valide porte toujours son validateur et son horodatage. */
    check(
      'releve_validation_complete',
      sql`${t.statut} <> 'VALIDE' or (${t.valideParId} is not null and ${t.valideLe} is not null)`,
    ),
  ],
).enableRLS()

export const releveQuantite = pgTable(
  'releve_quantite',
  {
    id: uuid().primaryKey().defaultRandom(),
    releveJournalierId: uuid()
      .notNull()
      .references(() => releveJournalier.id, { onDelete: 'cascade' }),
    /** Refuse de supprimer une ligne de quantitatif deja realisee. */
    ligneQuantitatifId: uuid()
      .notNull()
      .references(() => ligneQuantitatif.id, { onDelete: 'restrict' }),
    quantiteRealisee: numeric({ precision: 14, scale: 3, mode: 'number' }).notNull(),
    commentaire: text(),
  },
  (t) => [
    unique('releve_quantite_unique').on(t.releveJournalierId, t.ligneQuantitatifId),
    index('releve_quantite_ligne_idx').on(t.ligneQuantitatifId),
    check('releve_quantite_positive', sql`${t.quantiteRealisee} >= 0`),
  ],
).enableRLS()

/**
 * Journal de chantier d'un releve : les coulages de beton et les livraisons
 * de la journee. Ce ne sont pas des quantites du marche mais des faits
 * traces : un coulage fonde la tracabilite du beton en place (classe,
 * volume, bon de livraison de la centrale, essai d'affaissement au cone,
 * eprouvettes prelevees) ; une livraison, la reception des materiaux et ses
 * reserves. Geles avec le releve, comme ses quantites.
 */
export const releveCoulage = pgTable(
  'releve_coulage',
  {
    id: uuid().primaryKey().defaultRandom(),
    releveJournalierId: uuid()
      .notNull()
      .references(() => releveJournalier.id, { onDelete: 'cascade' }),
    /** Ordre de saisie dans le releve. */
    rang: smallint().notNull().default(0),
    /** Element coule et sa position : « Voiles R+2, files A a C ». */
    ouvrage: text().notNull(),
    /** Classe de resistance, au format de la norme NF EN 206 : C25/30. */
    classeBeton: text().notNull(),
    volumeM3: numeric('volume_m3', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    bonLivraison: text(),
    /** Affaissement au cone d'Abrams, en millimetres (NF EN 12350-2). */
    affaissementMm: smallint(),
    eprouvettes: smallint().notNull().default(0),
  },
  (t) => [
    index('releve_coulage_releve_idx').on(t.releveJournalierId),
    check('releve_coulage_volume', sql`${t.volumeM3} > 0 and ${t.volumeM3} <= 2000`),
    check(
      'releve_coulage_affaissement',
      sql`${t.affaissementMm} is null or ${t.affaissementMm} between 0 and 300`,
    ),
    check('releve_coulage_eprouvettes', sql`${t.eprouvettes} between 0 and 60`),
  ],
).enableRLS()

export const releveLivraison = pgTable(
  'releve_livraison',
  {
    id: uuid().primaryKey().defaultRandom(),
    releveJournalierId: uuid()
      .notNull()
      .references(() => releveJournalier.id, { onDelete: 'cascade' }),
    /** Ordre de saisie dans le releve. */
    rang: smallint().notNull().default(0),
    designation: text().notNull(),
    fournisseur: text(),
    quantite: numeric({ precision: 14, scale: 3, mode: 'number' }).notNull(),
    unite: uniteMesure().notNull(),
    bonLivraison: text(),
    /** Faux pour une livraison acceptee sous reserve, ou refusee. */
    conforme: boolean().notNull().default(true),
    reserve: text(),
  },
  (t) => [
    index('releve_livraison_releve_idx').on(t.releveJournalierId),
    check('releve_livraison_quantite', sql`${t.quantite} > 0`),
    check('releve_livraison_reserve', sql`${t.conforme} or ${t.reserve} is not null`),
  ],
).enableRLS()

/* ========================================================================== */
/* Zones, photos, jalons, aleas, ressources                                  */
/* ========================================================================== */

export const zone = pgTable(
  'zone',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    nom: text().notNull(),
    niveau: smallint().notNull(),
    /** Contour de la zone dans le plan, en coordonnees du SVG. */
    pathSvg: text().notNull(),
  },
  (t) => [
    unique('zone_unique').on(t.projetId, t.nom),
    index('zone_niveau_idx').on(t.projetId, t.niveau),
  ],
).enableRLS()

/**
 * Fond de plan d'un niveau, importe par le conducteur de travaux : un export
 * DXF d'AutoCAD, un PDF, un SVG ou une image, converti dans le navigateur en
 * une image WebP deposee dans le magasin de fichiers. Les contours des zones
 * du niveau sont exprimes dans le repere de cette image, en pixels.
 */
export const planNiveau = pgTable(
  'plan_niveau',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    niveau: smallint().notNull(),
    /** Chemin de l'image dans le magasin de fichiers. Aucun binaire en base. */
    chemin: text().notNull(),
    largeur: integer().notNull(),
    hauteur: integer().notNull(),
    octets: integer().notNull(),
    formatSource: formatPlan().notNull(),
    nomFichier: text().notNull(),
    importeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
    importePar: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('plan_niveau_unique').on(t.projetId, t.niveau),
    check(
      'plan_niveau_dimensions',
      sql`${t.largeur} between 1 and 8192 and ${t.hauteur} between 1 and 8192`,
    ),
    check('plan_niveau_octets_positif', sql`${t.octets} > 0`),
    check('plan_niveau_borne', sql`${t.niveau} between -9 and 199`),
  ],
).enableRLS()

/**
 * Maquette numerique du batiment, une par projet : un export IFC (Revit,
 * ArchiCAD, Tekla...) converti dans le navigateur en un fichier GLB depose
 * dans le magasin de fichiers. Les etages, peu nombreux et toujours lus
 * ensemble, sont gardes avec elle.
 */
export const maquette = pgTable(
  'maquette',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .unique('maquette_projet_unique')
      .references(() => projet.id, { onDelete: 'cascade' }),
    /** Chemin du GLB dans le magasin de fichiers. Aucun binaire en base. */
    chemin: text().notNull(),
    octets: integer().notNull(),
    nomFichier: text().notNull(),
    schemaIfc: text().notNull(),
    /** Etages, du plus bas au plus haut : nom, altitude en metres, niveau. */
    etages: jsonb().$type<{ nom: string; altitude: number; niveau: number }[]>().notNull(),
    importeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
    importePar: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
  },
  (t) => [check('maquette_octets_positif', sql`${t.octets} > 0`)],
).enableRLS()

/** Inventaire des elements de la maquette, cle par leur GlobalId IFC. */
export const elementMaquette = pgTable(
  'element_maquette',
  {
    maquetteId: uuid()
      .notNull()
      .references(() => maquette.id, { onDelete: 'cascade' }),
    globalId: text().notNull(),
    classe: text().notNull(),
    nom: text(),
    etage: text(),
  },
  (t) => [primaryKey({ columns: [t.maquetteId, t.globalId] })],
).enableRLS()

/**
 * Regle de rattachement d'une tache a des elements de la maquette : une
 * famille d'ouvrages, un niveau d'etage, un mot du nom. Attachee au projet,
 * et non a la maquette : elle survit au remplacement de la maquette.
 */
export const regleMaquette = pgTable(
  'regle_maquette',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    tacheId: uuid()
      .notNull()
      .references(() => tache.id, { onDelete: 'cascade' }),
    famille: familleOuvrage().notNull(),
    /** Null : tous les etages. */
    niveau: smallint(),
    /** Null : tous les elements de la famille. */
    nomContient: text(),
    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('regle_maquette_unique')
      .on(t.tacheId, t.famille, t.niveau, t.nomContient)
      .nullsNotDistinct(),
    index('regle_maquette_projet_idx').on(t.projetId),
  ],
).enableRLS()

/** Rattachement des taches aux zones du plan. Table de liaison. */
export const zoneTache = pgTable(
  'zone_tache',
  {
    zoneId: uuid()
      .notNull()
      .references(() => zone.id, { onDelete: 'cascade' }),
    tacheId: uuid()
      .notNull()
      .references(() => tache.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.zoneId, t.tacheId] }),
    index('zone_tache_tache_idx').on(t.tacheId),
  ],
).enableRLS()

/**
 * Planning de reference : la version figee du planning contre laquelle se
 * mesure la valeur planifiee.
 *
 * Sans reference, modifier le planning reecrivait la valeur planifiee de tout
 * l'historique : allonger aujourd'hui une tache du gros oeuvre changeait le
 * SPI publie dans le rapport du mois dernier, et la courbe en S n'etait plus
 * opposable. La reference ne change que par une decision tracee — avenant,
 * ordre de service — qui en fige une nouvelle version ; le planning courant,
 * lui, se recale librement et sert a la projection.
 */
export const referencePlanning = pgTable(
  'reference_planning',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    numero: smallint().notNull(),
    motif: text().notNull(),
    geleLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
    geleParId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
    /** Une seule reference active par projet : celle qui porte la VP. */
    active: boolean().notNull().default(true),
  },
  (t) => [
    unique('reference_numero_unique').on(t.projetId, t.numero),
    uniqueIndex('reference_active_unique')
      .on(t.projetId)
      .where(sql`active`),
  ],
).enableRLS()

/** Dates figees de chaque tache feuille dans une version de reference. */
export const referenceTache = pgTable(
  'reference_tache',
  {
    referenceId: uuid()
      .notNull()
      .references(() => referencePlanning.id, { onDelete: 'cascade' }),
    tacheId: uuid()
      .notNull()
      .references(() => tache.id, { onDelete: 'cascade' }),
    dateDebut: date().notNull(),
    dureeJ: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.referenceId, t.tacheId] }),
    check('reference_tache_duree_positive', sql`${t.dureeJ} > 0`),
  ],
).enableRLS()

/**
 * Cadrage photographique de reference.
 *
 * Deux photos du meme point de vue a deux dates sont comparables : c'est ce
 * qui rend la timeline lisible. Sans cet ancrage, la comparaison n'a pas de
 * sens.
 */
export const pointDeVue = pgTable(
  'point_de_vue',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    nom: text().notNull(),
    latitude: numeric({ precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric({ precision: 9, scale: 6, mode: 'number' }),
    /** Orientation de la prise de vue, en degres depuis le nord. */
    capDegres: smallint(),
  },
  (t) => [
    unique('point_de_vue_unique').on(t.projetId, t.nom),
    check(
      'point_de_vue_cap_borne',
      sql`${t.capDegres} is null or ${t.capDegres} between 0 and 359`,
    ),
  ],
).enableRLS()

export const photo = pgTable(
  'photo',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    releveJournalierId: uuid().references(() => releveJournalier.id, { onDelete: 'set null' }),
    tacheId: uuid().references(() => tache.id, { onDelete: 'set null' }),
    zoneId: uuid().references(() => zone.id, { onDelete: 'set null' }),
    pointDeVueId: uuid().references(() => pointDeVue.id, { onDelete: 'set null' }),

    /** Chemin dans le magasin de fichiers. Aucun binaire en base. */
    chemin: text().notNull(),
    cheminVignette: text().notNull(),
    largeur: smallint(),
    hauteur: smallint(),
    octets: integer(),

    priseLe: timestamp({ withTimezone: true }).notNull(),
    latitude: numeric({ precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric({ precision: 9, scale: 6, mode: 'number' }),
    capDegres: smallint(),
    legende: text(),
  },
  (t) => [
    index('photo_point_de_vue_idx').on(t.pointDeVueId, t.priseLe),
    index('photo_projet_idx').on(t.projetId, t.priseLe),
    check('photo_octets_positif', sql`${t.octets} is null or ${t.octets} > 0`),
  ],
).enableRLS()

export const jalon = pgTable(
  'jalon',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    nom: text().notNull(),
    datePrevue: date().notNull(),
    dateReelle: date(),
    /** Un jalon contractuel engage l'entreprise et porte une penalite. */
    contractuel: boolean().notNull().default(false),
    tacheDeclenchanteId: uuid().references(() => tache.id, { onDelete: 'set null' }),
    penaliteXof: bigint({ mode: 'number' }).notNull().default(0),
    ordre: smallint().notNull(),
  },
  (t) => [
    unique('jalon_unique').on(t.projetId, t.nom),
    index('jalon_date_idx').on(t.projetId, t.datePrevue),
    check('jalon_penalite_positive', sql`${t.penaliteXof} >= 0`),
  ],
).enableRLS()

export const alea = pgTable(
  'alea',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    lotId: uuid().references(() => lot.id, { onDelete: 'set null' }),
    tacheId: uuid().references(() => tache.id, { onDelete: 'set null' }),
    /**
     * Releve depuis lequel l'alea a ete declare, le cas echeant. Unique : un
     * releve renvoye apres une coupure reseau met a jour son alea au lieu
     * d'en creer un second.
     */
    releveJournalierId: uuid().references(() => releveJournalier.id, { onDelete: 'set null' }),
    date: date().notNull(),
    type: typeAlea().notNull(),
    /** De 1, mineur, a 4, bloquant. */
    gravite: smallint().notNull(),
    description: text().notNull(),
    impactDelaiJ: integer().notNull().default(0),
    impactCoutXof: bigint({ mode: 'number' }).notNull().default(0),
    statut: statutAlea().notNull().default('OUVERT'),
    /** Pour une intemperie seulement : proposee, reconnue ou rejetee. */
    decisionIntemperie: decisionIntemperie(),
    declareParId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
    resoluLe: date(),
    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('alea_projet_date_idx').on(t.projetId, t.date),
    uniqueIndex('alea_releve_unique').on(t.releveJournalierId),
    index('alea_statut_idx').on(t.statut),
    check('alea_gravite_borne', sql`${t.gravite} between 1 and 4`),
    check('alea_impact_delai_positif', sql`${t.impactDelaiJ} >= 0`),
    check('alea_resolution_coherente', sql`${t.statut} <> 'SOLDE' or ${t.resoluLe} is not null`),
    check('alea_resolution_apres_fait', sql`${t.resoluLe} is null or ${t.resoluLe} >= ${t.date}`),
    /** Une decision d'intemperie ne se pose que sur une intemperie, et toujours. */
    check(
      'alea_decision_intemperie_coherente',
      sql`(${t.type} = 'INTEMPERIE') = (${t.decisionIntemperie} is not null)`,
    ),
  ],
).enableRLS()

/**
 * Avenants au marche. Un avenant modifie le montant, le delai, ou les deux ;
 * il augmente le marche, et non le cout reel de l'entreprise. Le montant et
 * la fin contractuelle en vigueur se deduisent du marche initial et de ses
 * avenants : le marche initial, lui, reste fige.
 */
export const avenant = pgTable(
  'avenant',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    numero: smallint().notNull(),
    date: date().notNull(),
    objet: text().notNull(),
    /** Montant hors taxes, signe : un avenant peut aussi reduire le marche. */
    montantXof: bigint({ mode: 'number' }).notNull().default(0),
    delaiJ: integer().notNull().default(0),
    creeParId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('avenant_numero_unique').on(t.projetId, t.numero),
    check('avenant_delai_positif', sql`${t.delaiJ} >= 0`),
  ],
).enableRLS()

/**
 * Ordres de service. Un ordre d'arret suspend le delai jusqu'a l'ordre de
 * reprise qui le suit ; un ordre de prolongation l'allonge de son nombre de
 * jours. Les autres ordres sont consignes sans effet sur le delai.
 */
export const ordreService = pgTable(
  'ordre_service',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    numero: smallint().notNull(),
    date: date().notNull(),
    type: typeOrdreService().notNull(),
    objet: text().notNull(),
    /** Jours de prolongation, pour un ordre de type PROLONGATION. */
    delaiJ: integer().notNull().default(0),
    creeParId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('ordre_service_numero_unique').on(t.projetId, t.numero),
    check('ordre_service_delai_positif', sql`${t.delaiJ} >= 0`),
  ],
).enableRLS()

/**
 * Scenario de simulation enregistre, pour etre presente en reunion de
 * chantier. Seules les hypotheses sont conservees : le resultat est un
 * calcul a la volee, refait a chaque affichage sur le planning du moment,
 * et ne doit jamais etre ecrit en base.
 */
export const scenarioSimulation = pgTable(
  'scenario_simulation',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    nom: text().notNull(),
    description: text(),
    /** Liste de perturbations : tache, decalage et allongement en jours. */
    perturbations: jsonb().notNull(),
    creeParId: uuid().references(() => utilisateur.id, { onDelete: 'set null' }),
    creeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('scenario_projet_idx').on(t.projetId, t.creeLe),
    check('scenario_nom_non_vide', sql`length(trim(${t.nom})) > 0`),
  ],
).enableRLS()

export const ressource = pgTable(
  'ressource',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    type: typeRessource().notNull(),
    nom: text().notNull(),
    capacite: numeric({ precision: 10, scale: 2, mode: 'number' }),
    coutUnitaireXof: bigint({ mode: 'number' }).notNull().default(0),
    uniteCout: uniteCout().notNull().default('JOUR'),
  },
  (t) => [
    unique('ressource_unique').on(t.projetId, t.nom),
    check('ressource_cout_positif', sql`${t.coutUnitaireXof} >= 0`),
  ],
).enableRLS()

export const affectation = pgTable(
  'affectation',
  {
    id: uuid().primaryKey().defaultRandom(),
    tacheId: uuid()
      .notNull()
      .references(() => tache.id, { onDelete: 'cascade' }),
    ressourceId: uuid()
      .notNull()
      .references(() => ressource.id, { onDelete: 'cascade' }),
    quantite: numeric({ precision: 10, scale: 2, mode: 'number' }).notNull().default(1),
    dateDebut: date().notNull(),
    dateFin: date().notNull(),
  },
  (t) => [
    index('affectation_tache_idx').on(t.tacheId),
    index('affectation_ressource_idx').on(t.ressourceId, t.dateDebut),
    check('affectation_fin_apres_debut', sql`${t.dateFin} >= ${t.dateDebut}`),
    check('affectation_quantite_positive', sql`${t.quantite} > 0`),
  ],
).enableRLS()

/* ========================================================================== */
/* Cache de precalcul                                                        */
/* ========================================================================== */

/**
 * Instantane journalier d'avancement et de performance.
 *
 * Cache integralement recalculable par `recompute()` a partir de la seule
 * source de verite. Une ligne par jour et par lot, plus une ligne par jour
 * pour l'ensemble du projet, ou `lotId` est nul.
 *
 * Son existence est ce qui permet au tableau de bord et a la courbe en S
 * d'etre une lecture indexee plutot qu'une agregation complete a chaque
 * affichage.
 */
export const snapshotAvancement = pgTable(
  'snapshot_avancement',
  {
    id: uuid().primaryKey().defaultRandom(),
    projetId: uuid()
      .notNull()
      .references(() => projet.id, { onDelete: 'cascade' }),
    /** Nul pour l'instantane consolide du projet. */
    lotId: uuid().references(() => lot.id, { onDelete: 'cascade' }),
    date: date().notNull(),

    avancementPct: numeric({ precision: 7, scale: 6, mode: 'number' }).notNull(),
    valeurPlanifieeXof: bigint({ mode: 'number' }).notNull(),
    valeurAcquiseXof: bigint({ mode: 'number' }).notNull(),
    coutReelXof: bigint({ mode: 'number' }).notNull(),
    /** Nuls tant que la valeur planifiee ou le cout reel sont nuls. */
    spi: numeric({ precision: 10, scale: 6, mode: 'number' }),
    cpi: numeric({ precision: 10, scale: 6, mode: 'number' }),
    dateFinProjetee: date(),
    /**
     * Budget au cout, ou debourse previsionnel, du lot ou du projet. Constant
     * d'une date a l'autre tant que le planning ne change pas ; porte par
     * chaque instantane pour que le cout estime final se lise dans le cache
     * sans recharger les affectations.
     */
    budgetDebourseXof: bigint({ mode: 'number' }).notNull().default(0),

    calculeLe: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * PostgreSQL considere deux NULL comme distincts dans un index unique :
     * une seule contrainte sur (projet, lot, date) laisserait passer plusieurs
     * instantanes consolides pour le meme jour. D'ou deux index partiels.
     */
    uniqueIndex('snapshot_lot_unique')
      .on(t.projetId, t.lotId, t.date)
      .where(sql`lot_id is not null`),
    uniqueIndex('snapshot_projet_unique')
      .on(t.projetId, t.date)
      .where(sql`lot_id is null`),
    index('snapshot_lecture_idx').on(t.projetId, t.lotId, t.date),
    check('snapshot_avancement_fraction', sql`${t.avancementPct} between 0 and 1`),
    check(
      'snapshot_montants_positifs',
      sql`${t.valeurPlanifieeXof} >= 0 and ${t.valeurAcquiseXof} >= 0 and ${t.coutReelXof} >= 0`,
    ),
  ],
).enableRLS()

/* ========================================================================== */
/* Audit                                                                     */
/* ========================================================================== */

/**
 * Journal d'audit, alimente par un declencheur PostgreSQL et non par la couche
 * applicative : un declencheur ne s'oublie pas.
 *
 * L'identite de l'auteur provient de `app.user_id`, positionne par
 * `SET LOCAL` en tete de transaction. Elle est nulle pour les ecritures du
 * peuplement et des taches planifiees, ce qui est l'information exacte.
 *
 * La tracabilite du dossier des ouvrages executes est une exigence
 * contractuelle : ce journal en est le support.
 */
export const journalAudit = pgTable(
  'journal_audit',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    utilisateurId: uuid(),
    action: text().notNull(),
    entite: text().notNull(),
    entiteId: uuid(),
    avant: jsonb(),
    apres: jsonb(),
    horodatage: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_entite_idx').on(t.entite, t.entiteId),
    index('audit_horodatage_idx').on(t.horodatage),
    index('audit_utilisateur_idx').on(t.utilisateurId),
  ],
).enableRLS()

/* ========================================================================== */
/* Types deduits                                                             */
/* ========================================================================== */

export type Projet = typeof projet.$inferSelect
export type Lot = typeof lot.$inferSelect
export type Tache = typeof tache.$inferSelect
export type Liaison = typeof liaison.$inferSelect
export type LigneQuantitatif = typeof ligneQuantitatif.$inferSelect
export type ReleveJournalier = typeof releveJournalier.$inferSelect
export type ReleveQuantite = typeof releveQuantite.$inferSelect
export type Jalon = typeof jalon.$inferSelect
export type Alea = typeof alea.$inferSelect
export type Zone = typeof zone.$inferSelect
export type PlanNiveau = typeof planNiveau.$inferSelect
export type Maquette = typeof maquette.$inferSelect
export type RegleMaquette = typeof regleMaquette.$inferSelect
export type FamilleOuvrage = (typeof familleOuvrage.enumValues)[number]
export type FormatPlan = (typeof formatPlan.enumValues)[number]
export type Photo = typeof photo.$inferSelect
export type PointDeVue = typeof pointDeVue.$inferSelect
export type Ressource = typeof ressource.$inferSelect
export type Affectation = typeof affectation.$inferSelect
export type ScenarioSimulation = typeof scenarioSimulation.$inferSelect
export type SnapshotAvancement = typeof snapshotAvancement.$inferSelect
export type Utilisateur = typeof utilisateur.$inferSelect

export type Role = (typeof roleUtilisateur.enumValues)[number]
export type Unite = (typeof uniteMesure.enumValues)[number]
export type Nature = (typeof natureTache.enumValues)[number]
export type MethodeAvancement = (typeof methodeAvancement.enumValues)[number]
export type TypeLiaison = (typeof typeLiaison.enumValues)[number]
export type StatutReleve = (typeof statutReleve.enumValues)[number]
export type TypeAlea = (typeof typeAlea.enumValues)[number]
export type StatutAlea = (typeof statutAlea.enumValues)[number]
export type DecisionIntemperie = (typeof decisionIntemperie.enumValues)[number]
export type TypeOrdreService = (typeof typeOrdreService.enumValues)[number]
