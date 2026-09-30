/**
 * Calcul de l'avancement physique et de son agregation.
 *
 * Point de conception central du projet, et sujet a defendre en soutenance :
 * l'avancement d'un ensemble est pondere par le BUDGET de ses composants, et
 * non par leur duree.
 *
 * Une semaine de terrassement et une semaine de fondations speciales occupent
 * le meme temps mais ne representent pas la meme part de l'ouvrage. Ponderer
 * par la duree, comme le font la plupart des outils de gestion de projet
 * generalistes, produit un avancement qui ne correspond a rien de mesurable.
 * Ponderer par le budget donne un avancement qui coincide exactement avec la
 * valeur acquise, laquelle est un fait comptable.
 *
 * Le contre-exemple chiffre est dans `avancement.test.ts`, section
 * « contre-exemple ».
 */

import type { LigneAvancement, ResultatAvancement, TacheAvancement } from '@/db/compute/types'

/** Tolerance d'egalite sur les quantites, au millieme d'unite. */
const EPSILON = 1e-6

const VIDE: ResultatAvancement = {
  avancement: 0,
  budget: 0,
  valeurAcquise: 0,
  depassementXof: 0,
}

/* -------------------------------------------------------------------------- */
/* Avancement d'une tache                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Avancement d'une tache feuille a la date d'analyse.
 *
 * `jourAnalyse` n'est utilise que par la methode PROPORTION_DUREE ; les autres
 * methodes lisent uniquement les quantites cumulees, qui portent deja
 * l'information de date.
 */
export function avancementTache(t: TacheAvancement, jourAnalyse: number): ResultatAvancement {
  const budget = t.lignes.reduce((total, l) => total + montant(l), 0)
  const depassementXof = t.lignes.reduce(
    (total, l) => total + Math.max(0, l.quantiteRealisee - l.quantitePrevue) * l.prixUnitaireXof,
    0,
  )

  const avancement = fraction(t, jourAnalyse, budget)
  const borne = Math.min(1, Math.max(0, avancement))

  return {
    avancement: borne,
    budget: Math.round(budget),
    valeurAcquise: Math.round(borne * budget),
    depassementXof: Math.round(depassementXof),
  }
}

function fraction(t: TacheAvancement, jourAnalyse: number, budget: number): number {
  switch (t.methode) {
    /**
     * Methode des unites physiques. La reference.
     *
     * Le `min` plafonne chaque ligne a sa quantite prevue : une quantite
     * realisee au-dela du marche n'est pas un exces d'avancement mais un
     * ecart de quantitatif, a traiter par avenant. Elle est chiffree a part
     * dans `depassementXof`.
     */
    case 'UNITES_PHYSIQUES': {
      if (budget <= 0) return 0
      const acquis = t.lignes.reduce(
        (total, l) => total + Math.min(l.quantiteRealisee, l.quantitePrevue) * l.prixUnitaireXof,
        0,
      )
      return acquis / budget
    }

    /**
     * Methode des jalons ponderes. Pour les taches non mesurables en quantite
     * continue : montage de grue, installation de base vie, essais.
     *
     * Chaque ligne de quantitatif fait office de palier, tout ou rien, pondere
     * par sa valeur. Une ligne entamee mais non achevee ne compte pas : c'est
     * le propre d'un palier.
     */
    case 'JALONS_PONDERES': {
      if (budget <= 0) return 0
      const acquis = t.lignes.reduce((total, l) => total + (achevee(l) ? montant(l) : 0), 0)
      return acquis / budget
    }

    /**
     * Progression lineaire sur la duree planifiee.
     *
     * Reservee aux taches support, dont la consommation suit le temps et non
     * un ouvrage mesurable : encadrement, gardiennage, location d'installation.
     * A ne jamais employer pour une tache d'ouvrage, sous peine d'annoncer un
     * avancement que rien ne constate sur le terrain.
     */
    case 'PROPORTION_DUREE':
      return avancementPrevu({ debut: t.debut, duree: t.duree }, jourAnalyse)

    /**
     * Tout ou rien. Pour les taches courtes dont un avancement partiel
     * n'aurait pas de sens.
     */
    case 'ZERO_CENT':
      return t.lignes.length > 0 && t.lignes.every(achevee) ? 1 : 0
  }
}

function montant(l: LigneAvancement): number {
  return l.quantitePrevue * l.prixUnitaireXof
}

function achevee(l: LigneAvancement): boolean {
  return l.quantiteRealisee >= l.quantitePrevue - EPSILON
}

/* -------------------------------------------------------------------------- */
/* Agregation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Agrege des avancements en ponderant par le budget.
 *
 *   avancement = somme(avancement_i x budget_i) / somme(budget_i)
 *
 * Ce qui revient exactement a :
 *
 *   avancement = somme(valeur acquise_i) / somme(budget_i)
 *
 * L'egalite entre ces deux ecritures n'est pas fortuite : c'est ce qui rend
 * l'avancement et la valeur acquise coherents a tous les niveaux de la WBS.
 */
export function agreger(enfants: readonly ResultatAvancement[]): ResultatAvancement {
  if (enfants.length === 0) return VIDE

  const budget = enfants.reduce((total, e) => total + e.budget, 0)
  const valeurAcquise = enfants.reduce((total, e) => total + e.valeurAcquise, 0)
  const depassementXof = enfants.reduce((total, e) => total + e.depassementXof, 0)

  return {
    avancement: budget > 0 ? valeurAcquise / budget : 0,
    budget,
    valeurAcquise,
    depassementXof,
  }
}

/**
 * Ponderation par la duree. N'est PAS utilisee par l'application.
 *
 * Elle n'existe que pour produire le contre-exemple chiffre du memoire, en
 * montrant ce qu'annoncerait un outil qui pondere par le temps plutot que par
 * la valeur. La conserver dans le code, testee, vaut mieux que de refaire le
 * calcul a la main dans le rapport.
 */
export function ponderationParDuree(
  taches: readonly { avancement: number; duree: number }[],
): number {
  const duree = taches.reduce((total, t) => total + t.duree, 0)
  if (duree <= 0) return 0
  return taches.reduce((total, t) => total + t.avancement * t.duree, 0) / duree
}

/* -------------------------------------------------------------------------- */
/* Avancement planifie                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Avancement qu'une tache DEVRAIT avoir a une date donnee, si elle progressait
 * regulierement sur sa duree planifiee.
 *
 * Sert au calcul de la valeur planifiee. La progression lineaire est une
 * approximation : une tache de betonnage ne consomme pas sa valeur de facon
 * uniforme. Elle est retenue faute de courbe de consommation par nature
 * d'ouvrage, et parce qu'elle est celle qu'emploient les references de
 * l'Earned Value Management pour une tache elementaire.
 *
 * Bornes incluses : une tache de duree 1 demarrant au jour 4 est achevee le
 * jour 4.
 */
export function avancementPrevu(t: { debut: number; duree: number }, jourAnalyse: number): number {
  if (jourAnalyse < t.debut) return 0
  if (t.duree <= 0) return 1
  const ecoules = jourAnalyse - t.debut + 1
  return Math.min(1, ecoules / t.duree)
}
