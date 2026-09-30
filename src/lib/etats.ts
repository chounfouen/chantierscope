/**
 * Les six etats d'avancement, et leur representation.
 *
 * Chaque etat porte une couleur, une icone et un libelle. La couleur ne porte
 * jamais seule le sens : un etat s'affiche toujours avec son icone ou son
 * libelle, ce qui le rend lisible en vision des couleurs deficiente, en
 * impression et sous `forced-colors`.
 *
 * Ces couleurs viennent de la palette de statut, reservee : elles ne servent
 * jamais de teinte de serie, et aucune teinte de serie ne sert d'etat.
 */

import { Icone } from '@/lib/icones'
import type { LucideIcon } from 'lucide-react'

export const ETATS = [
  'NON_COMMENCE',
  'EN_COURS',
  'ACHEVE',
  'EN_RETARD',
  'CRITIQUE',
  'NON_TRAVAILLE',
] as const

export type Etat = (typeof ETATS)[number]

type DescriptionEtat = {
  libelle: string
  /** Variable CSS, pour un attribut `fill` ou `stroke` de SVG. */
  couleur: string
  /** Classe utilitaire Tailwind, pour un fond en HTML. */
  fond: string
  /** Classe utilitaire Tailwind, pour du texte ou une bordure. */
  teinte: string
  icone: LucideIcon
  /** Ce que l'etat signifie, affiche en infobulle. */
  definition: string
}

export const ETAT: Record<Etat, DescriptionEtat> = {
  NON_COMMENCE: {
    libelle: 'Non commence',
    couleur: 'var(--etat-neant)',
    fond: 'bg-etat-neant',
    teinte: 'text-etat-neant',
    icone: Icone.nonCommence,
    definition: 'Aucune quantite relevee a ce jour.',
  },
  EN_COURS: {
    libelle: 'En cours',
    couleur: 'var(--etat-cours)',
    fond: 'bg-etat-cours',
    teinte: 'text-etat-cours',
    icone: Icone.enCours,
    definition: 'Commence, pas encore acheve, dans les delais.',
  },
  ACHEVE: {
    libelle: 'Acheve',
    couleur: 'var(--etat-acheve)',
    fond: 'bg-etat-acheve',
    teinte: 'text-etat-acheve',
    icone: Icone.valide,
    definition: 'Toutes les quantites prevues sont realisees.',
  },
  EN_RETARD: {
    libelle: 'En retard',
    couleur: 'var(--etat-retard)',
    fond: 'bg-etat-retard',
    teinte: 'text-etat-retard',
    icone: Icone.alerte,
    definition: 'Avancement inferieur au prevu a la date du jour, marge encore disponible.',
  },
  CRITIQUE: {
    libelle: 'Critique',
    couleur: 'var(--etat-critique)',
    fond: 'bg-etat-critique',
    teinte: 'text-etat-critique',
    icone: Icone.nonConformite,
    definition: 'En retard sur le chemin critique : tout jour perdu decale la fin du chantier.',
  },
  NON_TRAVAILLE: {
    libelle: 'Non travaille',
    couleur: 'var(--etat-chome)',
    fond: 'hachure-chome',
    teinte: 'text-encre-discrete',
    icone: Icone.chome,
    definition: 'Journee sans activite : intemperie, ferie ou arret de chantier.',
  },
}
