/**
 * Earned Value Management : mesure croisee de l'avancement, du delai et du
 * cout.
 *
 * La methode repond a la seule question qui interesse un conducteur de
 * travaux : suis-je en retard, combien cela coute, et quand vais-je finir.
 * Elle repose sur trois grandeurs mesurees a une date d'analyse :
 *
 *   VP  valeur planifiee   ce qui aurait du etre execute, en valeur
 *   VA  valeur acquise     ce qui est execute, valorise au prix du marche
 *   CR  cout reel          ce que cette execution a effectivement coute
 *
 * Toutes les grandeurs sont en entiers de FCFA. Les indices sont sans unite.
 *
 * Les indices sont rendus NULS et non infinis quand leur denominateur est
 * nul. Un chantier qui n'a rien depense n'a pas un CPI infini : il n'a pas de
 * CPI. Renvoyer `Infinity` propagerait une valeur absurde jusqu'a l'affichage.
 */

/* -------------------------------------------------------------------------- */
/* Indicateurs                                                                */
/* -------------------------------------------------------------------------- */

export type EntreeEvm = {
  /** Budget a l'achevement : somme des budgets de taches. */
  bac: number
  valeurPlanifiee: number
  valeurAcquise: number
  coutReel: number
  dureeContractuelleJ: number
  montantMarcheXof: number
  /** Fraction du marche due par jour calendaire de retard. */
  tauxPenaliteJournaliere: number
}

export type IndicateursEvm = {
  bac: number
  vp: number
  va: number
  cr: number
  /** Valeur acquise moins cout reel. Negatif : derive de cout. */
  ecartCout: number
  /** Valeur acquise moins valeur planifiee. Negatif : retard. */
  ecartDelaiValeur: number
  /** Valeur acquise sur cout reel. Sous un : on paie plus cher que prevu. */
  cpi: number | null
  /** Valeur acquise sur valeur planifiee. Sous un : on avance moins vite. */
  spi: number | null
  /** Cout estime a l'achevement, par extrapolation de la performance. */
  eac: number | null
  /** Reste a depenser. */
  etc: number | null
  /** Ecart final previsible entre budget et cout estime. */
  vac: number | null
  dureeProjeteeJ: number | null
  /** Jours de retard projetes a l'achevement. Jamais negatif. */
  retardJ: number | null
  penaliteXof: number
}

export function indicateurs(e: EntreeEvm): IndicateursEvm {
  const { bac, valeurPlanifiee: vp, valeurAcquise: va, coutReel: cr } = e

  const cpi = cr > 0 ? va / cr : null
  const spi = vp > 0 ? va / vp : null

  /**
   * Extrapolation du cout final par la performance constatee.
   *
   * Formule EAC = BAC / CPI, qui suppose que la derive de cout observee se
   * poursuivra au meme rythme jusqu'a l'achevement. C'est l'hypothese la plus
   * couramment retenue ; elle est pessimiste sur un chantier dont les
   * difficultes sont derriere lui, optimiste sur un chantier dont les lots
   * les plus risques restent a venir.
   */
  const eac = cpi !== null && cpi > 0 ? Math.round(bac / cpi) : null
  const etc = eac === null ? null : eac - cr
  const vac = eac === null ? null : bac - eac

  /**
   * Extrapolation de la duree par la performance de delai.
   *
   * Approximation grossiere mais lisible : elle suppose que le rythme
   * constate se maintiendra. L'ecart de delai lu horizontalement sur la
   * courbe en S, par `ecartDelaiJours`, est une mesure plus fine de la
   * situation A LA DATE D'ANALYSE ; celle-ci est une PROJECTION a
   * l'achevement. Les deux ne mesurent pas la meme chose et n'ont aucune
   * raison de coincider.
   */
  const dureeProjeteeJ = spi !== null && spi > 0 ? Math.round(e.dureeContractuelleJ / spi) : null
  const retardJ =
    dureeProjeteeJ === null ? null : Math.max(0, dureeProjeteeJ - e.dureeContractuelleJ)

  return {
    bac,
    vp,
    va,
    cr,
    ecartCout: va - cr,
    ecartDelaiValeur: va - vp,
    cpi,
    spi,
    eac,
    etc,
    vac,
    dureeProjeteeJ,
    retardJ,
    penaliteXof: penaliteXof(retardJ ?? 0, e.tauxPenaliteJournaliere, e.montantMarcheXof),
  }
}

/* -------------------------------------------------------------------------- */
/* Ecart de delai en jours                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Ecart de delai a la date d'analyse, par lecture HORIZONTALE de la courbe
 * en S.
 *
 * On cherche la date a laquelle la valeur planifiee valait ce que la valeur
 * acquise vaut aujourd'hui. L'ecart entre cette date et la date d'analyse est
 * le retard, exprime en jours.
 *
 * C'est la seule lecture de la courbe en S qui donne un retard en JOURS. Le
 * SPI, lui, donne un rapport sans unite : un SPI de 0,9 ne signifie pas dix
 * pour cent de la duree en retard, et la confusion entre les deux est une
 * erreur classique.
 *
 * @param courbeVp Valeur planifiee cumulee, indexee par jour depuis l'origine.
 * @param valeurAcquise Valeur acquise a la date d'analyse.
 * @param jourAnalyse Indice du jour d'analyse dans la courbe.
 * @returns Nombre de jours de retard. Negatif en cas d'avance.
 */
export function ecartDelaiJours(
  courbeVp: readonly number[],
  valeurAcquise: number,
  jourAnalyse: number,
): number {
  if (courbeVp.length === 0) return 0

  const dernier = Math.min(jourAnalyse, courbeVp.length - 1)

  // Cas de l'avance : la valeur acquise depasse tout le planifie connu.
  const vpFinale = courbeVp[dernier] ?? 0
  if (valeurAcquise > vpFinale) {
    // On prolonge vers l'avant tant que la courbe reste sous la valeur acquise.
    let j = dernier
    while (j + 1 < courbeVp.length && (courbeVp[j + 1] ?? 0) <= valeurAcquise) j++
    if (j + 1 < courbeVp.length) {
      const bas = courbeVp[j] ?? 0
      const haut = courbeVp[j + 1] ?? 0
      const pente = haut - bas
      const fraction = pente > 0 ? (valeurAcquise - bas) / pente : 0
      return jourAnalyse - (j + fraction)
    }
    return jourAnalyse - j
  }

  // Cas general : on recule jusqu'a la derniere journee ou le planifie etait
  // inferieur ou egal a la valeur acquise.
  let j = dernier
  while (j > 0 && (courbeVp[j] ?? 0) > valeurAcquise) j--

  if ((courbeVp[j] ?? 0) === valeurAcquise) return jourAnalyse - j

  // Interpolation lineaire entre la journee j et la suivante.
  const bas = courbeVp[j] ?? 0
  const haut = courbeVp[j + 1] ?? bas
  const pente = haut - bas
  const fraction = pente > 0 ? (valeurAcquise - bas) / pente : 0
  return jourAnalyse - (j + fraction)
}

/* -------------------------------------------------------------------------- */
/* Penalite                                                                   */
/* -------------------------------------------------------------------------- */

/** Penalite de retard, arrondie a l'entier de FCFA. Nulle en cas d'avance. */
export function penaliteXof(
  retardJ: number,
  tauxJournalier: number,
  montantMarcheXof: number,
): number {
  if (retardJ <= 0) return 0
  return Math.round(retardJ * tauxJournalier * montantMarcheXof)
}

/* -------------------------------------------------------------------------- */
/* Modele de cout reel                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Parametres du modele de cout.
 *
 * AVERTISSEMENT — limite assumee du projet, a enoncer dans le memoire.
 *
 * Le cout reel d'un chantier est une donnee COMPTABLE : il se lit dans la
 * comptabilite analytique de l'entreprise, pas dans un modele. L'application
 * ne dispose pas de cette source. Elle reconstitue donc le cout a partir de
 * ce que le chantier declare : heures ouvriers relevees, journees
 * d'encadrement, quantites mises en oeuvre, et cout des aleas.
 *
 * Les quatre parametres ci-dessous sont des ordres de grandeur du marche
 * ivoirien. Ils sont exacts a quelques pour cent pres, ce qui suffit a rendre
 * le CPI significatif en tendance, mais ne remplace pas une comptabilite.
 *
 * Une mise en service reelle remplacerait ce modele par un import des
 * situations de depenses.
 */
export const COUT = {
  /** Cout horaire moyen d'un ouvrier, charges comprises. */
  tauxHoraireOuvrier: 1_400,
  /** Cout journalier d'un encadrant, charges comprises. */
  coutJourEncadrement: 42_000,
  /**
   * Part du prix unitaire correspondant au debourse materiaux et
   * sous-traitance. Le complement couvre la main d'oeuvre, deja comptee a
   * part, les frais de chantier et la marge.
   */
  partMateriaux: 0.58,
  /**
   * Frais de chantier par jour calendaire : location d'installation, grue,
   * gardiennage, encadrement general. Independants de l'activite du jour.
   */
  fraisChantierJour: 300_000,
} as const

export type EntreeCoutReel = {
  /** Cumul des heures ouvriers relevees depuis l'ordre de service. */
  heuresOuvrier: number
  /** Cumul des journees d'encadrement relevees. */
  journeesEncadrement: number
  /** Valeur acquise a la date d'analyse, base du debourse materiaux. */
  valeurAcquiseXof: number
  /** Jours calendaires ecoules depuis l'ordre de service. */
  joursEcoules: number
  /** Cumul des impacts de cout des aleas survenus. */
  coutAleasXof: number
}

/**
 * Cout reel reconstitue a la date d'analyse.
 *
 * La performance de cout apparait par la main d'oeuvre : une productivite
 * degradee consomme plus d'heures pour la meme valeur acquise, ce qui fait
 * mecaniquement descendre le CPI. C'est le comportement attendu, et c'est ce
 * qui rend l'indicateur utile malgre le caractere approche du modele.
 */
export function coutReel(e: EntreeCoutReel): number {
  return Math.round(
    e.heuresOuvrier * COUT.tauxHoraireOuvrier +
      e.journeesEncadrement * COUT.coutJourEncadrement +
      e.valeurAcquiseXof * COUT.partMateriaux +
      e.joursEcoules * COUT.fraisChantierJour +
      e.coutAleasXof,
  )
}
