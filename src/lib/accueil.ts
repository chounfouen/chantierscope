/**
 * Phrases d'accueil du tableau de bord.
 *
 * Le tableau de bord commence par dire la situation en francais courant,
 * avant de la chiffrer : un conducteur de travaux presse, ou un maitre
 * d'ouvrage qui ne lit pas les indices de la valeur acquise, doit comprendre
 * en une phrase ou en est le chantier. Fonctions pures, testees.
 */

/** Salutation selon l'heure du chantier, de 0 a 23. */
export function salutation(heure: number): string {
  return heure >= 18 || heure < 4 ? 'Bonsoir' : 'Bonjour'
}

/** Prenom d'affichage : le premier mot du nom, sans le nom de famille. */
export function prenom(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? ''
}

export type EntreeSituation = {
  /** Ecart de delai en jours, positif pour un retard. */
  ecartDelaiJ: number
  jalonsMenaces: number
  alertesCritiques: number
  avancement: number
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) =>
  `${n} ${n > 1 ? motPluriel : mot}`

/**
 * Titre de la situation : une phrase, du plus important au moins important.
 * Le seuil d'une semaine distingue un retard rattrapable d'une derive.
 */
export function titreSituation(e: EntreeSituation): string {
  const j = Math.round(e.ecartDelaiJ)
  if (e.avancement >= 0.999) return 'Le chantier est achevé.'
  if (j <= 0) return 'Le chantier avance au rythme prévu.'
  if (j <= 7) return `Le chantier avance, avec ${pluriel(j, 'jour')} de retard rattrapable.`
  return `Le chantier avance, mais accuse ${pluriel(j, 'jour')} de retard.`
}

/** Sous-titre : ce qui demande l'attention, ou une parole rassurante. */
export function sousTitreSituation(e: EntreeSituation): string {
  const parties: string[] = []
  if (e.jalonsMenaces > 0) {
    parties.push(
      `${pluriel(e.jalonsMenaces, 'jalon contractuel menacé', 'jalons contractuels menacés')}`,
    )
  }
  if (e.alertesCritiques > 0) {
    parties.push(`${pluriel(e.alertesCritiques, 'point critique', 'points critiques')} à traiter`)
  }
  if (parties.length === 0) return 'Rien d’urgent : aucune alerte critique à cette date.'
  return `${parties.join(' et ')}.`.replace(/^./, (c) => c.toUpperCase())
}

/* -------------------------------------------------------------------------- */
/* Accueil et raccourcis selon le role                                        */
/* -------------------------------------------------------------------------- */

type RoleAccueil = 'CHEF_CHANTIER' | 'CONDUCTEUR' | 'MOE' | 'MOA' | 'ADMIN'

/**
 * Premier ecran apres la connexion, selon le role.
 *
 * Le chef de chantier ouvre l'application pour saisir sa journee : il arrive
 * sur le formulaire, et non sur une courbe en S qu'il ne pilote pas. Les
 * autres roles arrivent sur le tableau de bord, ou les releves a valider
 * figurent parmi les alertes.
 */
export function pageAccueil(
  role: RoleAccueil,
  projetId: string,
  /** Ecran demande par un raccourci de l'application installee. */
  ecran?: string,
): string {
  const base = `/projet/${projetId}`
  const saisit = role === 'CHEF_CHANTIER' || role === 'CONDUCTEUR' || role === 'ADMIN'
  if (ecran === 'saisie' && saisit) return `${base}/releve/nouveau`
  return role === 'CHEF_CHANTIER' ? `${base}/releve/nouveau` : base
}

export type Raccourci = {
  libelle: string
  href: string
  icone: 'tableauBord' | 'planning' | 'releve' | 'photos' | 'ajouter'
}

/** Les trois onglets de la barre du telephone, selon le role. */
export function raccourcisMobiles(role: RoleAccueil, projetId: string): Raccourci[] {
  const base = `/projet/${projetId}`
  switch (role) {
    case 'CHEF_CHANTIER':
      return [
        { libelle: 'Saisir', href: `${base}/releve/nouveau`, icone: 'ajouter' },
        { libelle: 'Journal', href: `${base}/releve`, icone: 'releve' },
        { libelle: 'Photos', href: `${base}/photos`, icone: 'photos' },
      ]
    case 'CONDUCTEUR':
    case 'ADMIN':
      return [
        { libelle: 'Tableau', href: base, icone: 'tableauBord' },
        { libelle: 'Journal', href: `${base}/releve`, icone: 'releve' },
        { libelle: 'Planning', href: `${base}/planning`, icone: 'planning' },
      ]
    case 'MOE':
    case 'MOA':
      return [
        { libelle: 'Tableau', href: base, icone: 'tableauBord' },
        { libelle: 'Planning', href: `${base}/planning`, icone: 'planning' },
        { libelle: 'Photos', href: `${base}/photos`, icone: 'photos' },
      ]
  }
}
