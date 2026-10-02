/**
 * Catalogue du chantier de demonstration.
 *
 * Operation : 24 logements, R+3, un batiment, Abidjan Cocody.
 *
 * Toutes les donnees du chantier sont declarees ici. Les dates de planning ne
 * le sont pas : elles sont CALCULEES par passe avant a partir des durees et
 * des liaisons, dans `planning.ts`. Une date ecrite a la main finirait par
 * contredire le reseau de dependances.
 *
 * De meme, aucun budget n'est declare. Le budget d'une tache est la somme de
 * ses lignes de quantitatif, celui d'un lot la somme de ses taches, et le
 * montant du marche la somme des lots. C'est ainsi que se construit un DPGF,
 * et cela garantit la coherence sans verification.
 *
 * Prix unitaires : ordres de grandeur du marche ivoirien, en FCFA.
 */

import type { Nature, MethodeAvancement, TypeLiaison, Unite } from '@/db/schema'

/* -------------------------------------------------------------------------- */
/* Reperes temporels                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Ordre de service. Lundi 2 mars 2026.
 *
 * Cette date est choisie pour que le chantier soit a mi-parcours a la date
 * d'analyse ci-dessous, donc suffisamment avance pour que les indicateurs
 * soient parlants, et suffisamment loin de la fin pour que la projection ait
 * un sens. La decaler suffit a rajeunir toute la demonstration.
 */
export const DATE_ORDRE_SERVICE = '2026-03-02'

/**
 * Derniere journee relevee. Le peuplement s'arrete la.
 *
 * Volontairement fixe et non lue depuis l'horloge : le peuplement doit etre
 * reproductible. Voir `docs/PLAN.md` pour la procedure de recalage avant une
 * soutenance.
 */
export const DATE_ANALYSE = '2026-09-30'

/** Duree contractuelle en jours calendaires, soit quatorze mois. */
export const DUREE_CONTRACTUELLE_J = 426

export const PROJET = {
  code: 'LOG24-ABJ-2026',
  nom: 'Residence Les Palmiers — 24 logements R+3',
  maitreOuvrage: 'Societe Ivoirienne de Promotion Immobiliere',
  maitreOeuvre: 'Cabinet Kouadio Architectes et Associes',
  entreprise: 'Entreprise Generale du Littoral',
  lieu: 'Abidjan, Cocody Angre 7e Tranche',
  latitude: 5.3599,
  longitude: -3.9821,
  /** Un millieme du montant du marche par jour calendaire de retard. */
  tauxPenaliteJournaliere: 0.001,
} as const

/* -------------------------------------------------------------------------- */
/* Lots                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Le rang de couleur est STOCKE et non derive de l'ordre : la teinte suit le
 * lot, jamais son rang d'affichage. Un filtre ne repeint rien.
 */
export const LOTS = [
  { code: '01', nom: 'Installation de chantier', rangCouleur: 0 },
  { code: '02', nom: 'Terrassement et VRD', rangCouleur: 1 },
  { code: '03', nom: 'Fondations', rangCouleur: 2 },
  { code: '04', nom: 'Gros oeuvre', rangCouleur: 3 },
  { code: '05', nom: 'Charpente et couverture', rangCouleur: 4 },
  { code: '06', nom: 'Second oeuvre', rangCouleur: 5 },
  { code: '07', nom: 'Lots techniques', rangCouleur: 6 },
  { code: '08', nom: 'Finitions et amenagements exterieurs', rangCouleur: 7 },
] as const

/* -------------------------------------------------------------------------- */
/* Structure de la WBS                                                        */
/* -------------------------------------------------------------------------- */

export type LigneCatalogue = {
  designation: string
  unite: Unite
  quantite: number
  /** Prix unitaire en entiers de FCFA. */
  pu: number
}

export type TacheCatalogue = {
  code: string
  nom: string
  nature: Nature
  /** Duree en jours calendaires. */
  duree: number
  methode?: MethodeAvancement
  /** Codes des taches amont. Type FD et decalage nul par defaut. */
  apres?: readonly string[]
  /** Liaisons non triviales : autre type ou decalage non nul. */
  liaisons?: readonly { amont: string; type: TypeLiaison; decalage: number }[]
  lignes: readonly LigneCatalogue[]
}

export type NoeudCatalogue = {
  code: string
  nom: string
  enfants: readonly TacheCatalogue[]
}

/** Un noeud intermediaire de la WBS, rattache a un lot. */
export type GroupeCatalogue = {
  lot: string
  noeuds: readonly NoeudCatalogue[]
}

/* Prix unitaires recurrents, nommes pour rester coherents d'un lot a l'autre. */
const PU = {
  betonProprete: 75_000,
  beton350: 110_000,
  beton300: 98_000,
  coffrage: 9_000,
  acierHa: 900,
  agglos15: 9_500,
  agglos20: 11_500,
  enduitInterieur: 4_500,
  enduitExterieur: 5_800,
  chape: 6_500,
  carrelage: 18_000,
  faience: 21_000,
  peintureInterieure: 3_500,
  peintureExterieure: 4_800,
  menuiserieAlu: 85_000,
  porteBois: 145_000,
  gardeCorps: 48_000,
  etancheite: 22_000,
  bacAcier: 16_000,
  charpenteMetal: 2_200,
  pvc200: 18_000,
  pvc110: 9_000,
  pehd63: 12_000,
  fourreauTpc: 4_500,
  regard: 185_000,
  sanitaire: 185_000,
  pointLumineux: 42_000,
  priseCourant: 28_000,
  tableauDivisionnaire: 420_000,
  split12k: 385_000,
  voiriePavee: 32_000,
  espaceVert: 8_500,
  clotureDefinitive: 65_000,
  decapage: 1_200,
  fouillePleineMasse: 3_500,
  fouilleRigole: 5_500,
  remblaiCompacte: 6_500,
} as const

/* -------------------------------------------------------------------------- */
/* Le chantier                                                                */
/* -------------------------------------------------------------------------- */

export const CATALOGUE: readonly GroupeCatalogue[] = [
  /* --- 01 Installation de chantier -------------------------------------- */
  {
    lot: '01',
    noeuds: [
      {
        code: '01.1',
        nom: 'Installation et repli',
        enfants: [
          {
            code: '01.1.1',
            nom: 'Amenagement des acces et cloture de chantier',
            nature: 'SUPPORT',
            duree: 10,
            lignes: [
              {
                designation: 'Cloture de chantier en tole',
                unite: 'ML',
                quantite: 260,
                pu: 28_000,
              },
              { designation: 'Portail de chantier et acces', unite: 'U', quantite: 2, pu: 850_000 },
              {
                designation: 'Piste de circulation empierree',
                unite: 'M2',
                quantite: 640,
                pu: 14_000,
              },
            ],
          },
          {
            code: '01.1.2',
            nom: 'Base vie, bureaux et vestiaires',
            nature: 'SUPPORT',
            duree: 12,
            apres: ['01.1.1'],
            methode: 'JALONS_PONDERES',
            lignes: [
              {
                designation: 'Bungalows bureaux et reunion',
                unite: 'U',
                quantite: 4,
                pu: 1_850_000,
              },
              {
                designation: 'Vestiaires et sanitaires de chantier',
                unite: 'U',
                quantite: 3,
                pu: 1_200_000,
              },
              {
                designation: 'Aire de stockage et de ferraillage',
                unite: 'M2',
                quantite: 380,
                pu: 12_000,
              },
            ],
          },
          {
            code: '01.1.3',
            nom: 'Branchements provisoires eau et electricite',
            nature: 'SUPPORT',
            duree: 8,
            apres: ['01.1.2'],
            lignes: [
              {
                designation: 'Branchement electrique provisoire',
                unite: 'FORFAIT',
                quantite: 1,
                pu: 4_600_000,
              },
              {
                designation: 'Branchement eau provisoire',
                unite: 'FORFAIT',
                quantite: 1,
                pu: 1_900_000,
              },
            ],
          },
          {
            code: '01.1.4',
            nom: 'Montage et essais de la grue a tour',
            nature: 'LEVAGE',
            duree: 6,
            apres: ['01.1.2'],
            methode: 'ZERO_CENT',
            lignes: [
              {
                designation: 'Massif de fondation de grue',
                unite: 'M3',
                quantite: 42,
                pu: 145_000,
              },
              {
                designation: 'Montage, essais et reception de grue',
                unite: 'FORFAIT',
                quantite: 1,
                pu: 9_800_000,
              },
            ],
          },
          {
            code: '01.1.5',
            nom: 'Repli d installation et remise en etat',
            nature: 'SUPPORT',
            duree: 10,
            apres: ['08.2.3'],
            methode: 'ZERO_CENT',
            lignes: [
              {
                designation: 'Demontage grue et base vie',
                unite: 'FORFAIT',
                quantite: 1,
                pu: 6_400_000,
              },
              { designation: 'Remise en etat des abords', unite: 'M2', quantite: 640, pu: 5_500 },
            ],
          },
        ],
      },
    ],
  },

  /* --- 02 Terrassement et VRD ------------------------------------------- */
  {
    lot: '02',
    noeuds: [
      {
        code: '02.1',
        nom: 'Terrassements',
        enfants: [
          {
            code: '02.1.1',
            nom: 'Decapage de la terre vegetale',
            nature: 'TERRASSEMENT',
            duree: 8,
            apres: ['01.1.1'],
            lignes: [
              {
                designation: 'Decapage sur 30 cm et mise en depot',
                unite: 'M2',
                quantite: 2_850,
                pu: PU.decapage,
              },
              {
                designation: 'Evacuation des terres excedentaires',
                unite: 'M3',
                quantite: 620,
                pu: 7_800,
              },
            ],
          },
          {
            code: '02.1.2',
            nom: 'Fouilles en pleine masse',
            nature: 'TERRASSEMENT',
            duree: 18,
            apres: ['02.1.1'],
            lignes: [
              {
                designation: 'Fouille en pleine masse en terrain ordinaire',
                unite: 'M3',
                quantite: 3_240,
                pu: PU.fouillePleineMasse,
              },
              { designation: 'Evacuation des deblais', unite: 'M3', quantite: 2_600, pu: 7_800 },
            ],
          },
          {
            code: '02.1.3',
            nom: 'Fouilles en rigole et en puits',
            nature: 'TERRASSEMENT',
            duree: 14,
            apres: ['02.1.2'],
            lignes: [
              {
                designation: 'Fouille en rigole pour semelles filantes',
                unite: 'M3',
                quantite: 486,
                pu: PU.fouilleRigole,
              },
              {
                designation: 'Fouille en puits pour semelles isolees',
                unite: 'M3',
                quantite: 312,
                pu: 6_200,
              },
            ],
          },
          {
            code: '02.1.4',
            nom: 'Remblais compactes et plateforme',
            nature: 'TERRASSEMENT',
            duree: 12,
            apres: ['03.1.4'],
            lignes: [
              {
                designation: 'Remblai d apport compacte par couches',
                unite: 'M3',
                quantite: 1_180,
                pu: PU.remblaiCompacte,
              },
              {
                designation: 'Couche de forme en graveleux latteritique',
                unite: 'M3',
                quantite: 340,
                pu: 11_500,
              },
            ],
          },
        ],
      },
      {
        code: '02.2',
        nom: 'Reseaux enterres',
        enfants: [
          {
            code: '02.2.1',
            nom: 'Reseau d eaux usees',
            nature: 'VRD',
            duree: 15,
            apres: ['02.1.4'],
            lignes: [
              {
                designation: 'Canalisation PVC diametre 200',
                unite: 'ML',
                quantite: 186,
                pu: PU.pvc200,
              },
              { designation: 'Regard de visite beton', unite: 'U', quantite: 11, pu: PU.regard },
              { designation: 'Fosse septique et puisard', unite: 'U', quantite: 2, pu: 3_850_000 },
            ],
          },
          {
            code: '02.2.2',
            nom: 'Reseau d eaux pluviales',
            nature: 'VRD',
            duree: 12,
            apres: ['02.2.1'],
            liaisons: [{ amont: '02.2.1', type: 'DD', decalage: 5 }],
            lignes: [
              {
                designation: 'Canalisation PVC diametre 200',
                unite: 'ML',
                quantite: 214,
                pu: PU.pvc200,
              },
              {
                designation: 'Caniveau couvert en beton arme',
                unite: 'ML',
                quantite: 96,
                pu: 62_000,
              },
              { designation: 'Regard avaloir', unite: 'U', quantite: 8, pu: 165_000 },
            ],
          },
          {
            code: '02.2.3',
            nom: 'Reseau d adduction d eau potable',
            nature: 'VRD',
            duree: 10,
            liaisons: [{ amont: '02.2.1', type: 'DD', decalage: 10 }],
            lignes: [
              {
                designation: 'Conduite PEHD diametre 63',
                unite: 'ML',
                quantite: 168,
                pu: PU.pehd63,
              },
              {
                designation: 'Regard de comptage et robinetterie',
                unite: 'U',
                quantite: 4,
                pu: 480_000,
              },
            ],
          },
          {
            code: '02.2.4',
            nom: 'Fourreaux electriques et telecom',
            nature: 'VRD',
            duree: 10,
            apres: ['02.2.2'],
            lignes: [
              {
                designation: 'Fourreau TPC diametre 90 avec grillage',
                unite: 'ML',
                quantite: 232,
                pu: PU.fourreauTpc,
              },
              { designation: 'Chambre de tirage', unite: 'U', quantite: 6, pu: 285_000 },
            ],
          },
        ],
      },
    ],
  },

  /* --- 03 Fondations ----------------------------------------------------- */
  {
    lot: '03',
    noeuds: [
      {
        code: '03.1',
        nom: 'Fondations superficielles',
        enfants: [
          {
            code: '03.1.1',
            nom: 'Beton de proprete',
            nature: 'BETONNAGE',
            duree: 6,
            apres: ['02.1.3'],
            lignes: [
              {
                designation: 'Beton de proprete dose a 150',
                unite: 'M3',
                quantite: 58,
                pu: PU.betonProprete,
              },
            ],
          },
          {
            code: '03.1.2',
            nom: 'Semelles isolees sous poteaux',
            nature: 'FONDATION',
            duree: 20,
            apres: ['03.1.1'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour semelles',
                unite: 'M3',
                quantite: 168,
                pu: PU.beton350,
              },
              { designation: 'Coffrage de semelles', unite: 'M2', quantite: 284, pu: PU.coffrage },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 15_400,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '03.1.3',
            nom: 'Semelles filantes',
            nature: 'FONDATION',
            duree: 16,
            liaisons: [{ amont: '03.1.2', type: 'DD', decalage: 8 }],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour semelles filantes',
                unite: 'M3',
                quantite: 124,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de semelles filantes',
                unite: 'M2',
                quantite: 312,
                pu: PU.coffrage,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 10_900,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '03.1.4',
            nom: 'Longrines et amorces de poteaux',
            nature: 'FONDATION',
            duree: 18,
            apres: ['03.1.3'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour longrines',
                unite: 'M3',
                quantite: 96,
                pu: PU.beton350,
              },
              { designation: 'Coffrage de longrines', unite: 'M2', quantite: 512, pu: PU.coffrage },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 11_800,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '03.1.5',
            nom: 'Dallage sur terre-plein',
            nature: 'BETONNAGE',
            duree: 14,
            apres: ['02.1.4'],
            lignes: [
              {
                designation: 'Dallage beton arme de 15 cm sur film',
                unite: 'M2',
                quantite: 612,
                pu: 28_000,
              },
              { designation: 'Treillis soude ST 25', unite: 'M2', quantite: 640, pu: 4_200 },
            ],
          },
        ],
      },
    ],
  },

  /* --- 04 Gros oeuvre ---------------------------------------------------- */
  {
    lot: '04',
    noeuds: [
      {
        code: '04.1',
        nom: 'Niveau rez-de-chaussee',
        enfants: [
          {
            code: '04.1.1',
            nom: 'Poteaux du rez-de-chaussee',
            nature: 'BETONNAGE',
            duree: 12,
            apres: ['03.1.4'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour poteaux',
                unite: 'M3',
                quantite: 46,
                pu: PU.beton350,
              },
              { designation: 'Coffrage de poteaux', unite: 'M2', quantite: 392, pu: PU.coffrage },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 6_400,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.1.2',
            nom: 'Voiles et cage d escalier du rez-de-chaussee',
            nature: 'BETONNAGE',
            duree: 14,
            liaisons: [{ amont: '04.1.1', type: 'DD', decalage: 4 }],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour voiles',
                unite: 'M3',
                quantite: 62,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de voiles a l aide de banches',
                unite: 'M2',
                quantite: 496,
                pu: PU.coffrage,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 7_800,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.1.3',
            nom: 'Plancher haut du rez-de-chaussee',
            nature: 'BETONNAGE',
            duree: 18,
            apres: ['04.1.2'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour plancher',
                unite: 'M3',
                quantite: 112,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de plancher et etaiement',
                unite: 'M2',
                quantite: 578,
                pu: 11_500,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 11_200,
                pu: PU.acierHa,
              },
            ],
          },
        ],
      },
      {
        code: '04.2',
        nom: 'Niveau R+1',
        enfants: [
          {
            code: '04.2.1',
            nom: 'Poteaux du R+1',
            nature: 'BETONNAGE',
            duree: 12,
            apres: ['04.1.3'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour poteaux',
                unite: 'M3',
                quantite: 44,
                pu: PU.beton350,
              },
              { designation: 'Coffrage de poteaux', unite: 'M2', quantite: 376, pu: PU.coffrage },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 6_100,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.2.2',
            nom: 'Voiles et cage d escalier du R+1',
            nature: 'BETONNAGE',
            duree: 14,
            liaisons: [{ amont: '04.2.1', type: 'DD', decalage: 4 }],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour voiles',
                unite: 'M3',
                quantite: 60,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de voiles a l aide de banches',
                unite: 'M2',
                quantite: 482,
                pu: PU.coffrage,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 7_500,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.2.3',
            nom: 'Plancher haut du R+1',
            nature: 'BETONNAGE',
            duree: 18,
            apres: ['04.2.2'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour plancher',
                unite: 'M3',
                quantite: 110,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de plancher et etaiement',
                unite: 'M2',
                quantite: 566,
                pu: 11_500,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 11_000,
                pu: PU.acierHa,
              },
            ],
          },
        ],
      },
      {
        code: '04.3',
        nom: 'Niveau R+2',
        enfants: [
          {
            code: '04.3.1',
            nom: 'Poteaux du R+2',
            nature: 'BETONNAGE',
            duree: 12,
            apres: ['04.2.3'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour poteaux',
                unite: 'M3',
                quantite: 44,
                pu: PU.beton350,
              },
              { designation: 'Coffrage de poteaux', unite: 'M2', quantite: 376, pu: PU.coffrage },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 6_100,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.3.2',
            nom: 'Voiles et cage d escalier du R+2',
            nature: 'BETONNAGE',
            duree: 14,
            liaisons: [{ amont: '04.3.1', type: 'DD', decalage: 4 }],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour voiles',
                unite: 'M3',
                quantite: 60,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de voiles a l aide de banches',
                unite: 'M2',
                quantite: 482,
                pu: PU.coffrage,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 7_500,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.3.3',
            nom: 'Plancher haut du R+2',
            nature: 'BETONNAGE',
            duree: 18,
            apres: ['04.3.2'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour plancher',
                unite: 'M3',
                quantite: 110,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de plancher et etaiement',
                unite: 'M2',
                quantite: 566,
                pu: 11_500,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 11_000,
                pu: PU.acierHa,
              },
            ],
          },
        ],
      },
      {
        code: '04.4',
        nom: 'Niveau R+3',
        enfants: [
          {
            code: '04.4.1',
            nom: 'Poteaux du R+3',
            nature: 'BETONNAGE',
            duree: 12,
            apres: ['04.3.3'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour poteaux',
                unite: 'M3',
                quantite: 42,
                pu: PU.beton350,
              },
              { designation: 'Coffrage de poteaux', unite: 'M2', quantite: 358, pu: PU.coffrage },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 5_800,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.4.2',
            nom: 'Voiles et cage d escalier du R+3',
            nature: 'BETONNAGE',
            duree: 14,
            liaisons: [{ amont: '04.4.1', type: 'DD', decalage: 4 }],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour voiles',
                unite: 'M3',
                quantite: 58,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de voiles a l aide de banches',
                unite: 'M2',
                quantite: 464,
                pu: PU.coffrage,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 7_200,
                pu: PU.acierHa,
              },
            ],
          },
          {
            code: '04.4.3',
            nom: 'Plancher haut du R+3 et terrasse',
            nature: 'BETONNAGE',
            duree: 18,
            apres: ['04.4.2'],
            lignes: [
              {
                designation: 'Beton arme dose a 350 pour plancher',
                unite: 'M3',
                quantite: 108,
                pu: PU.beton350,
              },
              {
                designation: 'Coffrage de plancher et etaiement',
                unite: 'M2',
                quantite: 554,
                pu: 11_500,
              },
              {
                designation: 'Acier haute adherence',
                unite: 'KG',
                quantite: 10_800,
                pu: PU.acierHa,
              },
            ],
          },
        ],
      },
      {
        code: '04.5',
        nom: 'Maconnerie et ouvrages divers',
        enfants: [
          {
            code: '04.5.1',
            nom: 'Maconnerie d agglomeres',
            nature: 'MACONNERIE',
            duree: 46,
            liaisons: [{ amont: '04.2.3', type: 'DD', decalage: 0 }],
            lignes: [
              {
                designation: 'Maconnerie d agglos de 15 pour cloisons',
                unite: 'M2',
                quantite: 2_640,
                pu: PU.agglos15,
              },
              {
                designation: 'Maconnerie d agglos de 20 en facade',
                unite: 'M2',
                quantite: 1_480,
                pu: PU.agglos20,
              },
              { designation: 'Linteaux et chainages', unite: 'ML', quantite: 720, pu: 16_500 },
            ],
          },
          {
            code: '04.5.2',
            nom: 'Escaliers en beton arme',
            nature: 'BETONNAGE',
            duree: 20,
            apres: ['04.4.3'],
            lignes: [
              {
                designation: 'Volee d escalier en beton arme',
                unite: 'U',
                quantite: 8,
                pu: 1_240_000,
              },
              { designation: 'Palier intermediaire', unite: 'M2', quantite: 46, pu: 68_000 },
            ],
          },
          {
            code: '04.5.3',
            nom: 'Acroteres et couronnement',
            nature: 'BETONNAGE',
            duree: 12,
            apres: ['04.4.3'],
            lignes: [
              { designation: 'Acrotere en beton arme', unite: 'ML', quantite: 196, pu: 38_000 },
              {
                designation: 'Couvertine et relevee d etancheite',
                unite: 'ML',
                quantite: 196,
                pu: 14_500,
              },
            ],
          },
        ],
      },
    ],
  },

  /* --- 05 Charpente et couverture --------------------------------------- */
  {
    lot: '05',
    noeuds: [
      {
        code: '05.1',
        nom: 'Charpente, couverture et etancheite',
        enfants: [
          {
            code: '05.1.1',
            nom: 'Charpente metallique de la toiture',
            nature: 'CHARPENTE',
            duree: 20,
            apres: ['04.4.3'],
            lignes: [
              {
                designation: 'Charpente metallique galvanisee',
                unite: 'KG',
                quantite: 18_600,
                pu: PU.charpenteMetal,
              },
              {
                designation: 'Platines d ancrage et boulonnerie',
                unite: 'U',
                quantite: 96,
                pu: 42_000,
              },
            ],
          },
          {
            code: '05.1.2',
            nom: 'Couverture en bacs acier',
            nature: 'CHARPENTE',
            duree: 18,
            apres: ['05.1.1'],
            lignes: [
              {
                designation: 'Bac acier laque avec isolant',
                unite: 'M2',
                quantite: 742,
                pu: PU.bacAcier,
              },
              {
                designation: 'Faitiere, rive et accessoires',
                unite: 'ML',
                quantite: 164,
                pu: 12_500,
              },
            ],
          },
          {
            code: '05.1.3',
            nom: 'Etancheite des terrasses accessibles',
            nature: 'ETANCHEITE',
            duree: 15,
            apres: ['04.5.3'],
            lignes: [
              {
                designation: 'Complexe d etancheite bicouche',
                unite: 'M2',
                quantite: 386,
                pu: PU.etancheite,
              },
              {
                designation: 'Forme de pente en beton maigre',
                unite: 'M3',
                quantite: 24,
                pu: 82_000,
              },
            ],
          },
          {
            code: '05.1.4',
            nom: 'Descentes d eaux pluviales',
            nature: 'ETANCHEITE',
            duree: 10,
            apres: ['05.1.2'],
            lignes: [
              {
                designation: 'Descente EP en PVC diametre 110',
                unite: 'ML',
                quantite: 148,
                pu: PU.pvc110,
              },
              {
                designation: 'Gouttiere et dauphin en fonte',
                unite: 'ML',
                quantite: 96,
                pu: 18_500,
              },
            ],
          },
        ],
      },
    ],
  },

  /* --- 06 Second oeuvre --------------------------------------------------- */
  {
    lot: '06',
    noeuds: [
      {
        code: '06.1',
        nom: 'Revetements et enduits',
        enfants: [
          {
            code: '06.1.1',
            nom: 'Cloisons de distribution',
            nature: 'MACONNERIE',
            duree: 30,
            liaisons: [{ amont: '04.5.1', type: 'DD', decalage: 20 }],
            lignes: [
              { designation: 'Cloison en agglos de 10', unite: 'M2', quantite: 1_860, pu: 8_200 },
              {
                designation: 'Cloison legere en plaques de platre',
                unite: 'M2',
                quantite: 420,
                pu: 16_500,
              },
            ],
          },
          {
            code: '06.1.2',
            nom: 'Enduits interieurs',
            nature: 'ENDUIT',
            duree: 38,
            apres: ['06.1.1'],
            lignes: [
              {
                designation: 'Enduit de ciment interieur',
                unite: 'M2',
                quantite: 8_640,
                pu: PU.enduitInterieur,
              },
            ],
          },
          {
            code: '06.1.3',
            nom: 'Enduits exterieurs',
            nature: 'ENDUIT',
            duree: 32,
            apres: ['05.1.2'],
            lignes: [
              {
                designation: 'Enduit de ciment exterieur tyrolien',
                unite: 'M2',
                quantite: 2_960,
                pu: PU.enduitExterieur,
              },
            ],
          },
          {
            code: '06.1.4',
            nom: 'Chapes et formes de pente',
            nature: 'INTERIEUR',
            duree: 22,
            apres: ['06.1.2'],
            lignes: [
              { designation: 'Chape de ciment lissee', unite: 'M2', quantite: 2_180, pu: PU.chape },
            ],
          },
          {
            code: '06.1.5',
            nom: 'Carrelage et faience',
            nature: 'INTERIEUR',
            duree: 34,
            apres: ['06.1.4'],
            lignes: [
              {
                designation: 'Carrelage gres 40x40 pose collee',
                unite: 'M2',
                quantite: 2_040,
                pu: PU.carrelage,
              },
              {
                designation: 'Faience murale en pieces humides',
                unite: 'M2',
                quantite: 680,
                pu: PU.faience,
              },
              { designation: 'Plinthe assortie', unite: 'ML', quantite: 1_640, pu: 4_800 },
            ],
          },
        ],
      },
      {
        code: '06.2',
        nom: 'Menuiseries et serrurerie',
        enfants: [
          {
            code: '06.2.1',
            nom: 'Menuiseries exterieures en aluminium',
            nature: 'INTERIEUR',
            duree: 26,
            apres: ['06.1.3'],
            lignes: [
              {
                designation: 'Chassis coulissant aluminium vitre',
                unite: 'M2',
                quantite: 386,
                pu: PU.menuiserieAlu,
              },
              {
                designation: 'Porte d entree aluminium vitree',
                unite: 'U',
                quantite: 4,
                pu: 780_000,
              },
            ],
          },
          {
            code: '06.2.2',
            nom: 'Menuiseries interieures en bois',
            nature: 'INTERIEUR',
            duree: 22,
            apres: ['06.1.5'],
            lignes: [
              {
                designation: 'Bloc-porte isoplane avec huisserie',
                unite: 'U',
                quantite: 148,
                pu: PU.porteBois,
              },
              { designation: 'Placard amenage', unite: 'U', quantite: 48, pu: 285_000 },
            ],
          },
          {
            code: '06.2.3',
            nom: 'Serrurerie et garde-corps',
            nature: 'INTERIEUR',
            duree: 18,
            apres: ['04.5.2'],
            lignes: [
              {
                designation: 'Garde-corps metallique de balcon',
                unite: 'ML',
                quantite: 246,
                pu: PU.gardeCorps,
              },
              { designation: 'Main courante d escalier', unite: 'ML', quantite: 88, pu: 32_000 },
            ],
          },
        ],
      },
    ],
  },

  /* --- 07 Lots techniques ------------------------------------------------- */
  {
    lot: '07',
    noeuds: [
      {
        code: '07.1',
        nom: 'Plomberie sanitaire',
        enfants: [
          {
            code: '07.1.1',
            nom: 'Reseaux d alimentation encastres',
            nature: 'INTERIEUR',
            duree: 24,
            liaisons: [{ amont: '06.1.1', type: 'DD', decalage: 12 }],
            lignes: [
              { designation: 'Tuyauterie PPR encastree', unite: 'ML', quantite: 1_240, pu: 7_800 },
              { designation: 'Robinet d arret et nourrice', unite: 'U', quantite: 72, pu: 68_000 },
            ],
          },
          {
            code: '07.1.2',
            nom: 'Reseaux d evacuation',
            nature: 'INTERIEUR',
            duree: 20,
            apres: ['07.1.1'],
            lignes: [
              {
                designation: 'Evacuation PVC diametre 100',
                unite: 'ML',
                quantite: 428,
                pu: PU.pvc110,
              },
              { designation: 'Evacuation PVC diametre 50', unite: 'ML', quantite: 512, pu: 5_400 },
            ],
          },
          {
            code: '07.1.3',
            nom: 'Appareils sanitaires',
            nature: 'INTERIEUR',
            duree: 16,
            apres: ['06.1.5'],
            lignes: [
              {
                designation: 'Ensemble sanitaire complet par piece d eau',
                unite: 'U',
                quantite: 48,
                pu: PU.sanitaire,
              },
              {
                designation: 'Chauffe-eau electrique 100 litres',
                unite: 'U',
                quantite: 24,
                pu: 235_000,
              },
            ],
          },
        ],
      },
      {
        code: '07.2',
        nom: 'Electricite courants forts et faibles',
        enfants: [
          {
            code: '07.2.1',
            nom: 'Fourreaux et boitiers encastres',
            nature: 'INTERIEUR',
            duree: 26,
            liaisons: [{ amont: '06.1.1', type: 'DD', decalage: 8 }],
            lignes: [
              { designation: 'Fourreau ICTA encastre', unite: 'ML', quantite: 3_680, pu: 2_400 },
              { designation: 'Boitier d encastrement', unite: 'U', quantite: 1_120, pu: 1_800 },
            ],
          },
          {
            code: '07.2.2',
            nom: 'Cablage et tableaux divisionnaires',
            nature: 'INTERIEUR',
            duree: 24,
            apres: ['07.2.1'],
            lignes: [
              {
                designation: 'Cable U1000 R2V et fils H07',
                unite: 'ML',
                quantite: 6_400,
                pu: 1_650,
              },
              {
                designation: 'Tableau divisionnaire equipe',
                unite: 'U',
                quantite: 24,
                pu: PU.tableauDivisionnaire,
              },
              {
                designation: 'Tableau general basse tension',
                unite: 'U',
                quantite: 1,
                pu: 4_800_000,
              },
            ],
          },
          {
            code: '07.2.3',
            nom: 'Appareillage et luminaires',
            nature: 'INTERIEUR',
            duree: 18,
            apres: ['06.1.5'],
            lignes: [
              {
                designation: 'Point lumineux equipe',
                unite: 'U',
                quantite: 412,
                pu: PU.pointLumineux,
              },
              {
                designation: 'Prise de courant 16 A',
                unite: 'U',
                quantite: 486,
                pu: PU.priseCourant,
              },
            ],
          },
        ],
      },
      {
        code: '07.3',
        nom: 'Climatisation',
        enfants: [
          {
            code: '07.3.1',
            nom: 'Attentes, supports et liaisons frigorifiques',
            nature: 'INTERIEUR',
            duree: 18,
            apres: ['07.2.1'],
            lignes: [
              {
                designation: 'Liaison frigorifique pre-isolee',
                unite: 'ML',
                quantite: 620,
                pu: 14_500,
              },
              { designation: 'Support de groupe exterieur', unite: 'U', quantite: 72, pu: 48_000 },
            ],
          },
          {
            code: '07.3.2',
            nom: 'Groupes exterieurs et unites interieures',
            nature: 'INTERIEUR',
            duree: 14,
            apres: ['07.2.3'],
            lignes: [
              {
                designation: 'Split mural 12000 BTU pose',
                unite: 'U',
                quantite: 72,
                pu: PU.split12k,
              },
            ],
          },
        ],
      },
    ],
  },

  /* --- 08 Finitions et amenagements exterieurs ---------------------------- */
  {
    lot: '08',
    noeuds: [
      {
        code: '08.1',
        nom: 'Finitions',
        enfants: [
          {
            code: '08.1.1',
            nom: 'Peinture interieure',
            nature: 'INTERIEUR',
            duree: 30,
            apres: ['06.2.2'],
            lignes: [
              {
                designation: 'Peinture vinylique sur murs et plafonds',
                unite: 'M2',
                quantite: 8_640,
                pu: PU.peintureInterieure,
              },
            ],
          },
          {
            code: '08.1.2',
            nom: 'Peinture exterieure',
            nature: 'ENDUIT',
            duree: 22,
            apres: ['06.2.1'],
            lignes: [
              {
                designation: 'Peinture acrylique de facade',
                unite: 'M2',
                quantite: 2_960,
                pu: PU.peintureExterieure,
              },
            ],
          },
          {
            code: '08.1.3',
            nom: 'Nettoyage et reception',
            nature: 'INTERIEUR',
            duree: 12,
            apres: ['08.1.1', '07.3.2'],
            methode: 'ZERO_CENT',
            lignes: [
              { designation: 'Nettoyage de livraison', unite: 'M2', quantite: 2_240, pu: 2_800 },
              { designation: 'Levee des reserves', unite: 'FORFAIT', quantite: 1, pu: 5_200_000 },
            ],
          },
        ],
      },
      {
        code: '08.2',
        nom: 'Amenagements exterieurs',
        enfants: [
          {
            code: '08.2.1',
            nom: 'Voiries et parkings',
            nature: 'VRD',
            duree: 24,
            apres: ['08.1.2'],
            lignes: [
              {
                designation: 'Pave autobloquant sur lit de sable',
                unite: 'M2',
                quantite: 980,
                pu: PU.voiriePavee,
              },
              {
                designation: 'Bordure de trottoir prefabriquee',
                unite: 'ML',
                quantite: 286,
                pu: 22_000,
              },
            ],
          },
          {
            code: '08.2.2',
            nom: 'Espaces verts et plantations',
            nature: 'VRD',
            duree: 14,
            apres: ['08.2.1'],
            lignes: [
              {
                designation: 'Engazonnement et terre vegetale',
                unite: 'M2',
                quantite: 640,
                pu: PU.espaceVert,
              },
              { designation: 'Plantation d arbustes', unite: 'U', quantite: 68, pu: 32_000 },
            ],
          },
          {
            code: '08.2.3',
            nom: 'Cloture definitive et portail',
            nature: 'VRD',
            duree: 18,
            apres: ['08.2.1'],
            lignes: [
              {
                designation: 'Cloture en agglos avec couronnement',
                unite: 'ML',
                quantite: 248,
                pu: PU.clotureDefinitive,
              },
              {
                designation: 'Portail coulissant motorise',
                unite: 'U',
                quantite: 1,
                pu: 4_200_000,
              },
              { designation: 'Portillon pieton', unite: 'U', quantite: 2, pu: 680_000 },
            ],
          },
        ],
      },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* Jalons                                                                     */
/* -------------------------------------------------------------------------- */

export const JALONS = [
  { nom: 'Demarrage effectif des travaux', declencheur: '01.1.1', contractuel: true, ordre: 1 },
  { nom: 'Achevement des fondations', declencheur: '03.1.4', contractuel: true, ordre: 2 },
  { nom: 'Achevement du gros oeuvre', declencheur: '04.4.3', contractuel: true, ordre: 3 },
  { nom: 'Hors d eau', declencheur: '05.1.2', contractuel: true, ordre: 4 },
  { nom: 'Hors d air', declencheur: '06.2.1', contractuel: false, ordre: 5 },
  { nom: 'Reception provisoire', declencheur: '08.1.3', contractuel: true, ordre: 6 },
] as const

/* -------------------------------------------------------------------------- */
/* Ressources                                                                 */
/* -------------------------------------------------------------------------- */

export const RESSOURCES = [
  { type: 'EQUIPE', nom: 'Equipe terrassement', capacite: 8, cout: 145_000, unite: 'JOUR' },
  { type: 'EQUIPE', nom: 'Equipe coffrage', capacite: 12, cout: 230_000, unite: 'JOUR' },
  { type: 'EQUIPE', nom: 'Equipe ferraillage', capacite: 8, cout: 168_000, unite: 'JOUR' },
  { type: 'EQUIPE', nom: 'Equipe maconnerie', capacite: 10, cout: 175_000, unite: 'JOUR' },
  { type: 'EQUIPE', nom: 'Equipe finitions', capacite: 14, cout: 210_000, unite: 'JOUR' },
  { type: 'ENGIN', nom: 'Grue a tour 40 metres', capacite: 1, cout: 385_000, unite: 'JOUR' },
  { type: 'ENGIN', nom: 'Pelle hydraulique 20 tonnes', capacite: 1, cout: 265_000, unite: 'JOUR' },
  { type: 'ENGIN', nom: 'Camion benne 18 tonnes', capacite: 3, cout: 118_000, unite: 'JOUR' },
  {
    type: 'MATERIEL',
    nom: 'Jeu de banches metalliques',
    capacite: 240,
    cout: 42_000,
    unite: 'JOUR',
  },
  { type: 'MATERIEL', nom: 'Centrale a beton mobile', capacite: 1, cout: 320_000, unite: 'JOUR' },
] as const

/**
 * Equipe type de chaque nature d'ouvrage : ressource affectee et effectif.
 *
 * Source UNIQUE de l'effectif. Le planning en tire les affectations, dont
 * l'application deduit le budget de debourse ; la simulation d'execution en
 * tire l'effectif present sur le chantier. Deux tables distinctes avaient
 * diverge, et le budget comparait alors un effectif prevu a un autre.
 *
 * Le levage mobilise en plus la grue, sans effectif propre.
 */
export const EQUIPE_PAR_NATURE: Record<Nature, { ressource: string; ouvriers: number }> = {
  TERRASSEMENT: { ressource: 'Equipe terrassement', ouvriers: 8 },
  VRD: { ressource: 'Equipe terrassement', ouvriers: 6 },
  ENROBES: { ressource: 'Equipe terrassement', ouvriers: 8 },
  FONDATION: { ressource: 'Equipe ferraillage', ouvriers: 12 },
  BETONNAGE: { ressource: 'Equipe coffrage', ouvriers: 14 },
  LEVAGE: { ressource: 'Equipe coffrage', ouvriers: 4 },
  MACONNERIE: { ressource: 'Equipe maconnerie', ouvriers: 10 },
  CHARPENTE: { ressource: 'Equipe coffrage', ouvriers: 8 },
  ETANCHEITE: { ressource: 'Equipe finitions', ouvriers: 6 },
  ENDUIT: { ressource: 'Equipe finitions', ouvriers: 12 },
  INTERIEUR: { ressource: 'Equipe finitions', ouvriers: 10 },
  SUPPORT: { ressource: 'Equipe terrassement', ouvriers: 5 },
}

/* -------------------------------------------------------------------------- */
/* Zones du plan                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Decoupage geometrique simplifie : le batiment est represente en plan par
 * quatre niveaux de trois zones. Les contours sont des rectangles en
 * coordonnees du SVG, suffisants pour le plan interactif du sprint 8.
 */
export const ZONES = [
  {
    nom: 'RDC — Hall et circulations',
    niveau: 0,
    path: 'M 40 40 L 200 40 L 200 140 L 40 140 Z',
    taches: ['04.1.1', '04.1.2', '04.1.3'],
  },
  {
    nom: 'RDC — Logements nord',
    niveau: 0,
    path: 'M 200 40 L 400 40 L 400 140 L 200 140 Z',
    taches: ['04.1.3', '04.5.1'],
  },
  {
    nom: 'RDC — Logements sud',
    niveau: 0,
    path: 'M 40 140 L 400 140 L 400 240 L 40 240 Z',
    taches: ['04.1.3', '04.5.1'],
  },
  {
    nom: 'R+1 — Circulations',
    niveau: 1,
    path: 'M 40 40 L 200 40 L 200 140 L 40 140 Z',
    taches: ['04.2.1', '04.2.2', '04.2.3'],
  },
  {
    nom: 'R+1 — Logements nord',
    niveau: 1,
    path: 'M 200 40 L 400 40 L 400 140 L 200 140 Z',
    taches: ['04.2.3', '04.5.1', '06.1.1'],
  },
  {
    nom: 'R+1 — Logements sud',
    niveau: 1,
    path: 'M 40 140 L 400 140 L 400 240 L 40 240 Z',
    taches: ['04.2.3', '04.5.1', '06.1.1'],
  },
  {
    nom: 'R+2 — Circulations',
    niveau: 2,
    path: 'M 40 40 L 200 40 L 200 140 L 40 140 Z',
    taches: ['04.3.1', '04.3.2', '04.3.3'],
  },
  {
    nom: 'R+2 — Logements nord',
    niveau: 2,
    path: 'M 200 40 L 400 40 L 400 140 L 200 140 Z',
    taches: ['04.3.3', '04.5.1', '06.1.1'],
  },
  {
    nom: 'R+2 — Logements sud',
    niveau: 2,
    path: 'M 40 140 L 400 140 L 400 240 L 40 240 Z',
    taches: ['04.3.3', '04.5.1', '06.1.1'],
  },
  {
    nom: 'R+3 — Circulations',
    niveau: 3,
    path: 'M 40 40 L 200 40 L 200 140 L 40 140 Z',
    taches: ['04.4.1', '04.4.2', '04.4.3'],
  },
  {
    nom: 'R+3 — Logements nord',
    niveau: 3,
    path: 'M 200 40 L 400 40 L 400 140 L 200 140 Z',
    taches: ['04.4.3', '04.5.1'],
  },
  {
    nom: 'R+3 — Logements sud',
    niveau: 3,
    path: 'M 40 140 L 400 140 L 400 240 L 40 240 Z',
    taches: ['04.4.3', '04.5.1'],
  },
] as const

/* -------------------------------------------------------------------------- */
/* Points de vue photographiques                                              */
/* -------------------------------------------------------------------------- */

export const POINTS_DE_VUE = [
  { nom: 'Facade nord depuis la voie d acces', lat: 5.3603, lon: -3.9818, cap: 180 },
  { nom: 'Facade est depuis l angle de parcelle', lat: 5.3599, lon: -3.9815, cap: 270 },
  { nom: 'Vue generale depuis la grue', lat: 5.3599, lon: -3.9821, cap: 200 },
  { nom: 'Cage d escalier centrale', lat: 5.3599, lon: -3.982, cap: 90 },
] as const

/* -------------------------------------------------------------------------- */
/* Comptes de demonstration                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Les mots de passe sont des valeurs de developpement, hachees au peuplement.
 * Ils ne servent qu'a la demonstration locale et n'ouvrent aucun service reel.
 */
export const COMPTES = [
  { email: 'chef@chantierscope.test', nom: 'Adjoua Konan', role: 'CHEF_CHANTIER' },
  { email: 'conducteur@chantierscope.test', nom: 'Yao N Guessan', role: 'CONDUCTEUR' },
  { email: 'moe@chantierscope.test', nom: 'Cabinet Kouadio', role: 'MOE' },
  { email: 'moa@chantierscope.test', nom: 'SIPIM — Direction technique', role: 'MOA' },
  { email: 'admin@chantierscope.test', nom: 'Administration', role: 'ADMIN' },
] as const
