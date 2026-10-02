/**
 * Contenu calcule du rapport hebdomadaire : periode et faits marquants.
 *
 * Les faits marquants sont ecrits par l'application a partir des donnees, et
 * non saisis : ce qui a commence, ce qui s'est acheve, les jalons franchis,
 * les aleas, et le mouvement de l'avancement. Le conducteur de travaux les
 * complete de vive voix en reunion ; le rapport ne les invente pas.
 */

import { dateApres, jourDepuis } from '@/db/compute/tableau'

export type Periode = { debut: string; fin: string }

/** Semaine de sept jours se terminant a la date donnee, bornes incluses. */
export function semaineFinissantLe(fin: string): Periode {
  return { debut: dateApres(fin, -6), fin }
}

export function dansPeriode(date: string | null, p: Periode): boolean {
  return date !== null && date >= p.debut && date <= p.fin
}

export type EntreeFaits = {
  periode: Periode
  taches: readonly {
    codeWbs: string
    nom: string
    debutReel: string | null
    finReelle: string | null
  }[]
  jalonsAtteints: readonly {
    nom: string
    dateReelle: string
    datePrevue: string
    contractuel: boolean
  }[]
  aleas: readonly { gravite: number }[]
  /** Avancement reel en debut et en fin de periode, fractions. */
  avancementDebut: number
  avancementFin: number
  avancementPrevuFin: number
  journeesNonTravaillees: number
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) =>
  `${n} ${n > 1 ? motPluriel : mot}`
const pts = (f: number) => `${(f * 100).toFixed(1).replace('.', ',')} points`

/** Faits marquants de la periode, du plus structurant au plus courant. */
export function faitsMarquants(e: EntreeFaits): string[] {
  const faits: string[] = []
  const gain = e.avancementFin - e.avancementDebut
  const ecart = e.avancementFin - e.avancementPrevuFin
  faits.push(
    `L’avancement passe de ${pts(e.avancementDebut).replace(' points', ' %')} à ${pts(e.avancementFin).replace(' points', ' %')}, soit ${gain >= 0 ? '+' : ''}${pts(gain)} sur la semaine ; ${
      ecart < 0 ? `${pts(-ecart)} de retard` : `${pts(ecart)} d’avance`
    } sur le planning.`,
  )

  for (const j of e.jalonsAtteints) {
    const ecartJ = jourDepuis(j.datePrevue, j.dateReelle)
    faits.push(
      `Jalon ${j.contractuel ? 'contractuel ' : ''}atteint : ${j.nom}${
        ecartJ > 0 ? `, ${pluriel(ecartJ, 'jour')} après la date prévue` : ', dans les délais'
      }.`,
    )
  }

  const achevees = e.taches.filter((t) => dansPeriode(t.finReelle, e.periode))
  if (achevees.length > 0) {
    faits.push(
      `${pluriel(achevees.length, 'tâche achevée', 'tâches achevées')} : ${achevees
        .map((t) => `${t.codeWbs} ${t.nom}`)
        .join(', ')}.`,
    )
  }
  const commencees = e.taches.filter((t) => dansPeriode(t.debutReel, e.periode))
  if (commencees.length > 0) {
    faits.push(
      `${pluriel(commencees.length, 'tâche commencée', 'tâches commencées')} : ${commencees
        .map((t) => `${t.codeWbs} ${t.nom}`)
        .join(', ')}.`,
    )
  }

  if (e.aleas.length > 0) {
    const graves = e.aleas.filter((a) => a.gravite >= 3).length
    faits.push(
      `${pluriel(e.aleas.length, 'aléa déclaré', 'aléas déclarés')}${
        graves > 0 ? `, dont ${pluriel(graves, 'majeur ou bloquant', 'majeurs ou bloquants')}` : ''
      }.`,
    )
  } else {
    faits.push('Aucun aléa déclaré sur la période.')
  }

  if (e.journeesNonTravaillees > 0) {
    faits.push(
      `${pluriel(e.journeesNonTravaillees, 'journée non travaillée', 'journées non travaillées')} sur au moins un lot.`,
    )
  }
  return faits
}
