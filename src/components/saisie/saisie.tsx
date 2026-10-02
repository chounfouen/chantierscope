'use client'

/**
 * Enveloppes du formulaire : elles fournissent la maniere d'envoyer.
 *
 * Une page serveur ne peut pas passer de fonction a un composant client, hors
 * Server Action. Ces deux enveloppes portent donc chacune son mode d'envoi :
 * la saisie directe, qui passe par le gestionnaire de route que la file hors
 * ligne sait rejouer, et la rectification, qui passe par une Server Action
 * puisqu'elle n'a de sens qu'en ligne.
 */

import { rectifierAction } from '@/app/(app)/projet/[id]/releve/actions'
import { FormulaireReleve, type ModeFormulaire } from '@/components/saisie/formulaire-releve'
import type { ReferentielSaisie } from '@/db/queries/saisie'
import { envoyerReleve, type IssueEnvoi } from '@/lib/hors-ligne/envoi'
import type { EtatFormulaire } from '@/lib/releve-formulaire'

type Communes = {
  referentiel: ReferentielSaisie
  initial: EtatFormulaire
  aujourdhui: string
}

export function SaisieDirecte(p: Communes & { mode: Exclude<ModeFormulaire, 'rectification'> }) {
  return (
    <FormulaireReleve {...p} envoyer={(releve) => envoyerReleve(p.referentiel.projet.id, releve)} />
  )
}

export function SaisieRectification(p: Communes & { ancienId: string }) {
  const { ancienId, ...reste } = p
  return (
    <FormulaireReleve
      {...reste}
      mode="rectification"
      envoyer={async (releve): Promise<IssueEnvoi> => {
        if (!navigator.onLine) {
          return {
            issue: 'refuse',
            message: 'Une rectification se fait en ligne : réessayer une fois le réseau revenu.',
          }
        }
        const r = await rectifierAction(ancienId, releve)
        return r.ok
          ? { issue: 'enregistre', releveId: r.releveId, statut: 'SOUMIS', cree: true }
          : { issue: 'refuse', message: r.message }
      }}
    />
  )
}
