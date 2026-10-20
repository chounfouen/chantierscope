'use client'

/**
 * Formulaires de la sous-traitance et du registre de securite. Chaque envoi
 * passe par une Server Action gardee.
 */

import { useState } from 'react'
import {
  demanderAgrementAction,
  statuerAgrementAction,
} from '@/app/(app)/projet/[id]/sous-traitants/actions'
import { consignerEvenementAction } from '@/app/(app)/projet/[id]/securite/actions'
import { useEnvoi } from '@/components/formulaires/use-envoi'
import { Button } from '@/components/ui/button'
import type { TypeEvenementSecurite } from '@/db/schema'
import { lireNombre } from '@/lib/releve'
import { LIBELLE_EVENEMENT, TYPES_EVENEMENT } from '@/lib/securite'

const CHAMP = 'champ champ-compact'
type LotChoix = { id: string; code: string; nom: string; pris: boolean }

export function FormulaireDemandeAgrement({
  projetId,
  aujourdhui,
  lots,
}: {
  projetId: string
  aujourdhui: string
  lots: LotChoix[]
}) {
  const { enCours, envoyer } = useEnvoi()
  const vide = {
    raisonSociale: '',
    specialite: '',
    montant: '',
    paiementDirect: true,
    demandeLe: aujourdhui,
    lotIds: [] as string[],
  }
  const [f, setF] = useState(vide)
  const basculer = (id: string) =>
    setF({
      ...f,
      lotIds: f.lotIds.includes(id) ? f.lotIds.filter((x) => x !== id) : [...f.lotIds, id],
    })

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(
          () =>
            demanderAgrementAction({
              projetId,
              raisonSociale: f.raisonSociale,
              specialite: f.specialite,
              montantXof: Math.round(lireNombre(f.montant) ?? 0),
              paiementDirect: f.paiementDirect,
              demandeLe: f.demandeLe,
              lotIds: f.lotIds,
            }),
          () => setF(vide),
        )
      }}
    >
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Raison sociale</span>
        <input
          className={CHAMP}
          value={f.raisonSociale}
          onChange={(e) => setF({ ...f, raisonSociale: e.target.value })}
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Spécialité</span>
        <input
          className={CHAMP}
          value={f.specialite}
          onChange={(e) => setF({ ...f, specialite: e.target.value })}
          placeholder="Étanchéité, électricité…"
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Montant sous-traité, hors taxes, en FCFA</span>
        <input
          className={CHAMP}
          inputMode="numeric"
          value={f.montant}
          onChange={(e) => setF({ ...f, montant: e.target.value })}
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Date de la demande</span>
        <input
          type="date"
          className={CHAMP}
          value={f.demandeLe}
          max={aujourdhui}
          onChange={(e) => setF({ ...f, demandeLe: e.target.value })}
          required
        />
      </label>
      <fieldset className="grid gap-1.5 text-sm sm:col-span-2">
        <legend className="libelle-champ mb-1 text-xs">Lots confiés</legend>
        <div className="flex flex-wrap gap-2">
          {lots.map((l) => (
            <label
              key={l.id}
              className="border-input has-[:checked]:border-marque has-[:checked]:bg-marque-douce flex items-center gap-2 rounded-lg border px-3 py-2 has-[:disabled]:opacity-50"
            >
              <input
                type="checkbox"
                className="size-4"
                checked={f.lotIds.includes(l.id)}
                disabled={l.pris}
                onChange={() => basculer(l.id)}
              />
              <span className="font-mono text-xs">{l.code}</span> {l.nom}
              {l.pris && <span className="text-muted-foreground text-xs">(déjà confié)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="size-5"
          checked={f.paiementDirect}
          onChange={(e) => setF({ ...f, paiementDirect: e.target.checked })}
        />
        Paiement direct par le maître d’ouvrage
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10" disabled={enCours}>
          Demander l’agrément
        </Button>
      </div>
    </form>
  )
}

export function DecisionAgrement({
  projetId,
  sousTraitantId,
  aujourdhui,
}: {
  projetId: string
  sousTraitantId: string
  aujourdhui: string
}) {
  const { enCours, envoyer } = useEnvoi()
  const statuer = (decision: 'AGREE' | 'REFUSE') =>
    envoyer(() => statuerAgrementAction({ projetId, sousTraitantId, decision, date: aujourdhui }))
  return (
    <span className="flex gap-2">
      <Button size="sm" disabled={enCours} onClick={() => statuer('AGREE')}>
        Agréer
      </Button>
      <Button size="sm" variant="outline" disabled={enCours} onClick={() => statuer('REFUSE')}>
        Refuser
      </Button>
    </span>
  )
}

export function FormulaireEvenement({
  projetId,
  aujourdhui,
  lots,
  sousTraitants,
}: {
  projetId: string
  aujourdhui: string
  lots: { id: string; nom: string }[]
  sousTraitants: { id: string; raisonSociale: string }[]
}) {
  const { enCours, envoyer } = useEnvoi()
  const vide = {
    date: aujourdhui,
    type: 'CAUSERIE' as TypeEvenementSecurite,
    lotId: '',
    sousTraitantId: '',
    description: '',
    joursArret: '1',
    participants: '',
  }
  const [f, setF] = useState(vide)

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(
          () =>
            consignerEvenementAction({
              projetId,
              date: f.date,
              type: f.type,
              lotId: f.lotId || null,
              sousTraitantId: f.sousTraitantId || null,
              description: f.description,
              joursArret:
                f.type === 'ACCIDENT_AVEC_ARRET' ? Math.round(lireNombre(f.joursArret) ?? 0) : 0,
              participants:
                f.type === 'CAUSERIE' && f.participants.trim() !== ''
                  ? Math.round(lireNombre(f.participants) ?? 0)
                  : null,
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
          onChange={(e) => setF({ ...f, type: e.target.value as TypeEvenementSecurite })}
        >
          {TYPES_EVENEMENT.map((t) => (
            <option key={t} value={t}>
              {LIBELLE_EVENEMENT[t]}
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
        <span className="libelle-champ">
          {f.type === 'CAUSERIE' ? 'Thème de la causerie' : 'Description et circonstances'}
        </span>
        <textarea
          className={`${CHAMP} h-auto py-2`}
          rows={3}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Lot concerné (facultatif)</span>
        <select
          className={CHAMP}
          value={f.lotId}
          onChange={(e) => setF({ ...f, lotId: e.target.value })}
        >
          <option value="">Tout le chantier</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Entreprise (facultatif)</span>
        <select
          className={CHAMP}
          value={f.sousTraitantId}
          onChange={(e) => setF({ ...f, sousTraitantId: e.target.value })}
        >
          <option value="">Titulaire</option>
          {sousTraitants.map((s) => (
            <option key={s.id} value={s.id}>
              {s.raisonSociale}
            </option>
          ))}
        </select>
      </label>
      {f.type === 'ACCIDENT_AVEC_ARRET' && (
        <label className="grid gap-1.5 text-xs">
          <span className="libelle-champ">Jours d’arrêt de travail</span>
          <input
            className={CHAMP}
            inputMode="numeric"
            value={f.joursArret}
            onChange={(e) => setF({ ...f, joursArret: e.target.value })}
          />
        </label>
      )}
      {f.type === 'CAUSERIE' && (
        <label className="grid gap-1.5 text-xs">
          <span className="libelle-champ">Participants</span>
          <input
            className={CHAMP}
            inputMode="numeric"
            value={f.participants}
            onChange={(e) => setF({ ...f, participants: e.target.value })}
          />
        </label>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" className="h-10" disabled={enCours}>
          Consigner au registre
        </Button>
      </div>
    </form>
  )
}
