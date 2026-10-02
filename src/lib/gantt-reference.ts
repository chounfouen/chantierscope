/**
 * Planning de reference pour le Gantt : le reseau de dix taches calcule a la
 * main au sprint 2, habille en planning d'un lot unique.
 *
 * Sert aux tests du Gantt : le chemin critique AFFICHE doit etre celui du
 * calcul manuel, A-B-D-F-G-I-J. Partage entre les tests de donnees et le test
 * de rendu.
 */

import { addDays, formatISO, parseISO } from 'date-fns'
import { recaler } from '@/db/compute/planning'
import { RESEAU_REFERENCE } from '@/db/compute/reference'
import type { Planning } from '@/db/queries/planning'

export const ORIGINE_REFERENCE = '2026-03-02'

export function planningReference(): Planning {
  const { dates, resultat } = recaler(RESEAU_REFERENCE)
  const date = (j: number) =>
    formatISO(addDays(parseISO(ORIGINE_REFERENCE), j), { representation: 'date' })
  return {
    projet: {
      id: 'projet',
      code: 'REF',
      nom: 'Reseau de reference',
      dateOrdreService: ORIGINE_REFERENCE,
      dateFinContractuelle: date(34),
      dureeContractuelleJ: 35,
      montantMarcheXof: 10_000_000,
      tauxPenaliteJournaliere: 0.001,
    },
    lots: [{ id: 'lot', code: '01', nom: 'Lot unique', rangCouleur: 0 }],
    taches: [
      {
        id: 'racine',
        lotId: 'lot',
        parentId: null,
        codeWbs: '01.1',
        nom: 'Ouvrage',
        feuille: false,
        dateDebutPrevue: date(0),
        dateFinPrevue: date(34),
        dureePrevueJ: 35,
        debutImpose: null,
        dateDebutReelle: null,
        dateFinReelle: null,
        avancement: 0,
        budgetXof: 0,
        margeTotaleJ: null,
        margeLibreJ: null,
        critique: false,
      },
      ...RESEAU_REFERENCE.taches.map((t, i) => {
        const d = dates.get(t.id) ?? { debut: 0, fin: 0 }
        const r = resultat.dates.get(t.id)
        return {
          id: t.id,
          lotId: 'lot',
          parentId: 'racine',
          codeWbs: `01.1.${i + 1}`,
          nom: `Tache ${t.id}`,
          feuille: true,
          dateDebutPrevue: date(d.debut),
          dateFinPrevue: date(d.fin),
          dureePrevueJ: t.duree,
          debutImpose: null,
          dateDebutReelle: null,
          dateFinReelle: null,
          avancement: 0,
          budgetXof: 1_000_000,
          margeTotaleJ: r?.margeTotale ?? null,
          margeLibreJ: r?.margeLibre ?? null,
          critique: r?.critique ?? false,
        }
      }),
    ],
    liaisons: RESEAU_REFERENCE.liaisons.map((l, i) => ({
      id: `l${i}`,
      amontId: l.amont,
      avalId: l.aval,
      type: l.type,
      decalageJ: l.decalage,
    })),
    jalons: [
      {
        id: 'j1',
        nom: 'Fin du reseau',
        contractuel: true,
        datePrevue: date(34),
        dateReelle: null,
        tacheDeclenchanteId: 'J',
      },
    ],
    arrets: [],
  }
}
