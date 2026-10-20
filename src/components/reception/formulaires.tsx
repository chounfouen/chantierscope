'use client'

/** Formulaires de la reception : constat et levee d'une reserve, prononce. */

import { useState } from 'react'
import {
  constaterReserveAction,
  leverReserveAction,
  prononcerReceptionAction,
} from '@/app/(app)/projet/[id]/reserves/actions'
import { useEnvoi } from '@/components/formulaires/use-envoi'
import { Button } from '@/components/ui/button'
import type { PhaseReserve } from '@/db/schema'
import { LIBELLE_PHASE, PHASES } from '@/lib/reception'

const CHAMP = 'champ champ-compact'

export function FormulaireReserve({
  projetId,
  aujourdhui,
  zones,
  lots,
  receptionPrononcee,
  zoneInitiale,
}: {
  projetId: string
  aujourdhui: string
  zones: { id: string; nom: string }[]
  lots: { id: string; nom: string }[]
  receptionPrononcee: boolean
  zoneInitiale: string | null
}) {
  const { enCours, envoyer } = useEnvoi()
  const vide = {
    phase: (receptionPrononcee ? 'PARFAIT_ACHEVEMENT' : 'OPR') as PhaseReserve,
    zoneId: zoneInitiale ?? '',
    lotId: '',
    description: '',
    constateeLe: aujourdhui,
    echeance: '',
  }
  const [f, setF] = useState(vide)
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(
          () =>
            constaterReserveAction({
              projetId,
              phase: f.phase,
              zoneId: f.zoneId || null,
              lotId: f.lotId || null,
              description: f.description,
              constateeLe: f.constateeLe,
              echeance: f.echeance || null,
            }),
          () => setF({ ...vide, zoneId: f.zoneId, lotId: f.lotId }),
        )
      }}
    >
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Phase</span>
        <select
          className={CHAMP}
          value={f.phase}
          onChange={(e) => setF({ ...f, phase: e.target.value as PhaseReserve })}
        >
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {LIBELLE_PHASE[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Zone du plan</span>
        <select
          className={CHAMP}
          value={f.zoneId}
          onChange={(e) => setF({ ...f, zoneId: e.target.value })}
        >
          <option value="">Non localisée</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Lot responsable</span>
        <select
          className={CHAMP}
          value={f.lotId}
          onChange={(e) => setF({ ...f, lotId: e.target.value })}
        >
          <option value="">À déterminer</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs sm:col-span-3">
        <span className="libelle-champ">Réserve</span>
        <textarea
          className={`${CHAMP} h-auto py-2`}
          rows={2}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="Éclat d’enduit en angle de la cage d’escalier, porte palière qui frotte…"
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Constatée le</span>
        <input
          type="date"
          className={CHAMP}
          value={f.constateeLe}
          max={aujourdhui}
          onChange={(e) => setF({ ...f, constateeLe: e.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">À lever avant le</span>
        <input
          type="date"
          className={CHAMP}
          value={f.echeance}
          min={f.constateeLe}
          onChange={(e) => setF({ ...f, echeance: e.target.value })}
        />
      </label>
      <div className="self-end">
        <Button type="submit" className="h-10" disabled={enCours}>
          Consigner la réserve
        </Button>
      </div>
    </form>
  )
}

export function LeveeReserve({
  projetId,
  reserveId,
  aujourdhui,
}: {
  projetId: string
  reserveId: string
  aujourdhui: string
}) {
  const { enCours, envoyer } = useEnvoi()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={enCours}
      onClick={() => envoyer(() => leverReserveAction({ projetId, reserveId, date: aujourdhui }))}
    >
      Lever
    </Button>
  )
}

export function PrononceReception({
  projetId,
  aujourdhui,
  reservesOuvertes,
}: {
  projetId: string
  aujourdhui: string
  reservesOuvertes: number
}) {
  const { enCours, envoyer } = useEnvoi()
  const [date, setDate] = useState(aujourdhui)
  const [confirmation, setConfirmation] = useState(false)
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Date d’effet</span>
        <input
          type="date"
          className={CHAMP}
          value={date}
          max={aujourdhui}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {confirmation ? (
        <>
          <span className="text-sm">
            {reservesOuvertes > 0
              ? `Réception avec ${reservesOuvertes} réserve${reservesOuvertes > 1 ? 's' : ''} : elle ne se défait pas.`
              : 'Réception sans réserve : elle ne se défait pas.'}
          </span>
          <Button
            className="h-10"
            disabled={enCours}
            onClick={() => envoyer(() => prononcerReceptionAction({ projetId, date }))}
          >
            Confirmer
          </Button>
          <Button variant="outline" className="h-10" onClick={() => setConfirmation(false)}>
            Annuler
          </Button>
        </>
      ) : (
        <Button className="h-10" onClick={() => setConfirmation(true)}>
          Prononcer la réception
        </Button>
      )}
    </div>
  )
}
