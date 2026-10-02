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
import { mettreEnFile } from '@/lib/hors-ligne/file'
import type { EtatFormulaire } from '@/lib/releve-formulaire'

type Communes = {
  referentiel: ReferentielSaisie
  initial: EtatFormulaire
  aujourdhui: string
}

/**
 * Saisie directe : envoi immediat si possible, sinon mise en file. Un releve
 * que le serveur n'a pas pu juger, faute de reseau ou de session, n'est
 * jamais perdu ; un releve qu'il a refuse n'est pas mis en file, puisque le
 * renvoyer ne changerait rien.
 */
export function SaisieDirecte(
  p: Communes & { mode: Exclude<ModeFormulaire, 'rectification'>; utilisateurId: string },
) {
  const { utilisateurId, ...reste } = p
  const projetId = p.referentiel.projet.id
  return (
    <FormulaireReleve
      {...reste}
      envoyer={async (releve): Promise<IssueEnvoi> => {
        const issue: IssueEnvoi = navigator.onLine
          ? await envoyerReleve(projetId, releve)
          : {
              issue: 'reporte',
              cause: 'reseau',
              message:
                'Hors ligne : le relevé est gardé sur ce téléphone et partira au retour du réseau.',
            }
        if (issue.issue !== 'reporte') return issue
        try {
          await mettreEnFile(projetId, utilisateurId, releve, issue.message)
        } catch {
          return {
            issue: 'refuse',
            message:
              'Envoi impossible et stockage local indisponible sur ce navigateur : réessayer avec du réseau.',
          }
        }
        return issue
      }}
    />
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
