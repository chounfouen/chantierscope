/**
 * Situation du chantier a une date, au format du memoire.
 *
 * Les chiffres cites dans le dossier de conception et dans le memoire ne se
 * recopient pas a la main depuis l'ecran : ils derivent a mesure que le code
 * evolue, et un jury qui compare le memoire a la demonstration le voit. Ce
 * script les calcule par le meme noyau que le tableau de bord, sans rien
 * ecrire en base, et imprime un tableau Markdown pret a coller.
 *
 *   npm run db:situation                 date d'etat : dernier releve valide
 *   npm run db:situation -- 2026-09-27   date d'etat imposee
 */

import { achevement, jourDepuis } from '@/db/compute/tableau'
import { dbScript } from '@/db/index'
import { chargerContexte, premierProjetId } from '@/db/queries/contexte'
import { chargerContrat } from '@/db/queries/contrat'
import { calculer, debourse } from '@/db/recompute'
import { fcfa, indice, pourcent } from '@/lib/format'

const { db, fermer } = dbScript()

try {
  const projetId = await premierProjetId(db)
  const contexte = await chargerContexte(db, projetId)
  const demandee = process.argv[2]
  const c = calculer(contexte, demandee ? { dateAnalyse: demandee } : {})
  const { projet } = contexte
  // Delai et montant EN VIGUEUR, a la date d'etat : avenants, ordres de
  // service et intemperies reconnues au-dela des previsibles.
  const { cadre } = await chargerContrat(db, projetId, c.dateAnalyse)

  const consolide = c.instantanes.filter((i) => i.lotId === null).at(-1)
  if (!consolide) throw new Error('Aucun instantané : la date précède l’ordre de service.')

  const jourAnalyse = jourDepuis(projet.dateOrdreService, c.dateAnalyse)
  const finProjeteeJ =
    consolide.dateFinProjetee === null
      ? jourAnalyse
      : jourDepuis(projet.dateOrdreService, consolide.dateFinProjetee)
  const dureePlanifieeJ = contexte.taches
    .filter((t) => t.feuille)
    .reduce(
      (m, t) =>
        Math.max(m, jourDepuis(projet.dateOrdreService, t.dateDebutPrevue) + t.dureePrevueJ),
      0,
    )
  const fin = achevement({
    origine: projet.dateOrdreService,
    fins: new Map([['reseau', finProjeteeJ]]),
    jourAnalyse,
    dureePlanifieeJ,
    dureeContractuelleJ: cadre.dureeJ,
    ecartDelaiJ: c.ecartDelaiJ,
    montantMarcheXof: cadre.montantXof,
    tauxPenaliteJournaliere: projet.tauxPenaliteJournaliere,
    plafondPenalite: projet.plafondPenalite,
  })
  const plafondXof = Math.round(projet.plafondPenalite * cadre.montantXof)

  const bac = c.globalFinal.budget
  const lignes: [string, string][] = [
    ['Date d’état', c.dateAnalyse],
    ['Jour', `${jourAnalyse + 1} sur ${cadre.dureeJ}`],
    ['Avancement planifié', pourcent(bac > 0 ? c.vpFinale / bac : 0)],
    ['Avancement réel', pourcent(c.globalFinal.avancement)],
    ['Valeur planifiée', fcfa(c.vpFinale)],
    ['Valeur acquise', fcfa(c.globalFinal.valeurAcquise)],
    ['Coût réel reconstitué', fcfa(c.crFinal)],
    ['Coefficient de déboursé', indice(debourse(contexte).projet)],
    ['SPI', c.spi === null ? '—' : indice(c.spi)],
    ['CPI', c.cpi === null ? '—' : indice(c.cpi)],
    ['Retard constaté (courbe en S)', `${c.ecartDelaiJ.toFixed(1).replace('.', ',')} jours`],
    ['Fin projetée (planning recalé)', fin.dateFinProjetee],
    [
      'Délai contractuel en vigueur',
      `${cadre.dureeJ} jours, fin le ${cadre.finContractuelle} (dont ${
        cadre.prolongations.intemperiesJ
      } j d’intempéries au-delà des ${cadre.intemperies.previsiblesJ} prévisibles)`,
    ],
    ['Retard projeté', `${fin.retardProjeteJ} jours`],
    [
      'Pénalité prévue',
      `${fcfa(fin.penaliteXof)}${fin.plafondAtteint ? ` (plafonnée à ${fcfa(plafondXof)})` : ''}`,
    ],
    [
      'Fourchette de retard',
      `${fin.fourchette.rythmePrevuJ} j au rythme prévu, ${
        fin.fourchette.rythmeConstateJ ?? '—'
      } j au rythme constaté`,
    ],
  ]

  console.log('| Indicateur | Valeur |')
  console.log('|---|---|')
  for (const [cle, valeur] of lignes) console.log(`| ${cle} | ${valeur} |`)
} finally {
  await fermer()
}
