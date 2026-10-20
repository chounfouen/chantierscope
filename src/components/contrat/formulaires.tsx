'use client'

/**
 * Formulaires du cadre contractuel : avenant, ordre de service, decision sur
 * une intemperie. Chaque envoi passe par une Server Action gardee ; le
 * formulaire ne fait que recueillir et afficher la reponse.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ajouterAvenantAction,
  ajouterOrdreServiceAction,
  statuerIntemperieAction,
  type ResultatContrat,
} from '@/app/(app)/projet/[id]/contrat/actions'
import { Button } from '@/components/ui/button'
// Import de type seulement : le schema de base n'a rien a faire dans le code du navigateur.
import type { TypeOrdreService } from '@/db/schema'
import { LIBELLE_ORDRE } from '@/lib/contrat'
import { lireNombre } from '@/lib/releve'

const CHAMP = 'champ champ-compact'

function useEnvoi() {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  function envoyer(action: () => Promise<ResultatContrat>, apres?: () => void) {
    demarrer(async () => {
      const r = await action()
      if (r.ok) {
        toast.success(r.message)
        apres?.()
        router.refresh()
      } else toast.error(r.message)
    })
  }
  return { enCours, envoyer }
}

export function FormulaireAvenant({
  projetId,
  aujourdhui,
}: {
  projetId: string
  aujourdhui: string
}) {
  const { enCours, envoyer } = useEnvoi()
  const vide = { date: aujourdhui, objet: '', montant: '', delai: '0', figer: true }
  const [f, setF] = useState(vide)

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(
          () =>
            ajouterAvenantAction({
              projetId,
              date: f.date,
              objet: f.objet,
              montantXof: Math.round(lireNombre(f.montant) ?? 0),
              delaiJ: Math.round(lireNombre(f.delai) ?? 0),
              figerReference: f.figer,
            }),
          () => setF(vide),
        )
      }}
    >
      <label className="grid gap-1.5 text-xs sm:col-span-2">
        <span className="libelle-champ">Objet</span>
        <input
          className={CHAMP}
          value={f.objet}
          onChange={(e) => setF({ ...f, objet: e.target.value })}
          placeholder="Travaux supplémentaires de clôture, renforcement…"
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Date de notification</span>
        <input
          type="date"
          className={CHAMP}
          value={f.date}
          max={aujourdhui}
          onChange={(e) => setF({ ...f, date: e.target.value })}
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">
          Montant hors taxes, en FCFA (négatif pour une moins-value)
        </span>
        <input
          className={CHAMP}
          inputMode="numeric"
          value={f.montant}
          onChange={(e) => setF({ ...f, montant: e.target.value })}
          placeholder="0"
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Délai supplémentaire, en jours calendaires</span>
        <input
          className={CHAMP}
          inputMode="numeric"
          value={f.delai}
          onChange={(e) => setF({ ...f, delai: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 self-end text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={f.figer}
          onChange={(e) => setF({ ...f, figer: e.target.checked })}
        />
        Figer le planning courant comme nouvelle référence
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10" disabled={enCours}>
          Enregistrer l’avenant
        </Button>
      </div>
    </form>
  )
}

export function FormulaireOrdreService({
  projetId,
  aujourdhui,
}: {
  projetId: string
  aujourdhui: string
}) {
  const { enCours, envoyer } = useEnvoi()
  const vide = { date: aujourdhui, type: 'ARRET' as TypeOrdreService, objet: '', delai: '0' }
  const [f, setF] = useState(vide)

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(
          () =>
            ajouterOrdreServiceAction({
              projetId,
              date: f.date,
              type: f.type,
              objet: f.objet,
              delaiJ: f.type === 'PROLONGATION' ? Math.round(lireNombre(f.delai) ?? 0) : 0,
            }),
          () => setF(vide),
        )
      }}
    >
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Nature</span>
        <select
          className={CHAMP}
          value={f.type}
          onChange={(e) => setF({ ...f, type: e.target.value as TypeOrdreService })}
        >
          {(Object.keys(LIBELLE_ORDRE) as TypeOrdreService[]).map((t) => (
            <option key={t} value={t}>
              {LIBELLE_ORDRE[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Date</span>
        <input
          type="date"
          className={CHAMP}
          value={f.date}
          max={aujourdhui}
          onChange={(e) => setF({ ...f, date: e.target.value })}
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs sm:col-span-2">
        <span className="libelle-champ">Objet</span>
        <input
          className={CHAMP}
          value={f.objet}
          onChange={(e) => setF({ ...f, objet: e.target.value })}
          placeholder="Arrêt dans l’attente des plans d’exécution révisés…"
          required
        />
      </label>
      {f.type === 'PROLONGATION' && (
        <label className="grid gap-1.5 text-xs">
          <span className="libelle-champ">Jours de prolongation</span>
          <input
            className={CHAMP}
            inputMode="numeric"
            value={f.delai}
            onChange={(e) => setF({ ...f, delai: e.target.value })}
          />
        </label>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10" disabled={enCours}>
          Enregistrer l’ordre de service
        </Button>
      </div>
    </form>
  )
}

export function DecisionIntemperie({ projetId, aleaId }: { projetId: string; aleaId: string }) {
  const { enCours, envoyer } = useEnvoi()
  const statuer = (decision: 'RECONNUE' | 'REJETEE') =>
    envoyer(() => statuerIntemperieAction({ projetId, aleaId, decision }))
  return (
    <span className="flex gap-2">
      <Button className="h-9" disabled={enCours} onClick={() => statuer('RECONNUE')}>
        Reconnaître
      </Button>
      <Button
        variant="outline"
        className="h-9"
        disabled={enCours}
        onClick={() => statuer('REJETEE')}
      >
        Rejeter
      </Button>
    </span>
  )
}
