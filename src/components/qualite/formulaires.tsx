'use client'

/**
 * Formulaires de la qualite : resultats d'essais, ouverture, traitement et
 * levee d'une fiche de non-conformite.
 */

import { useState } from 'react'
import {
  enregistrerEssaisAction,
  leverNonConformiteAction,
  ouvrirNonConformiteAction,
  traiterNonConformiteAction,
} from '@/app/(app)/projet/[id]/qualite/actions'
import { useEnvoi } from '@/components/formulaires/use-envoi'
import { Button } from '@/components/ui/button'
import { lireNombre } from '@/lib/releve'

const CHAMP = 'champ champ-compact'

export type CoulageAEssayer = { id: string; libelle: string; date: string }

function ajouterJours(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export function FormulaireEssais({
  projetId,
  aujourdhui,
  coulages,
}: {
  projetId: string
  aujourdhui: string
  coulages: CoulageAEssayer[]
}) {
  const { enCours, envoyer } = useEnvoi()
  const premier = coulages[0]
  const vide = {
    coulageId: premier?.id ?? '',
    prelevement: '1',
    ageJ: '28',
    dateEcrasement: premier ? ajouterJours(premier.date, 28) : aujourdhui,
    r1: '',
    r2: '',
    r3: '',
    laboratoire: '',
  }
  const [f, setF] = useState(vide)
  const coulage = coulages.find((c) => c.id === f.coulageId)
  const recaler = (coulageId: string, ageJ: string) => {
    const c = coulages.find((x) => x.id === coulageId)
    const a = Number(ageJ)
    setF({
      ...f,
      coulageId,
      ageJ,
      dateEcrasement: c && a > 0 ? ajouterJours(c.date, a) : f.dateEcrasement,
    })
  }

  if (coulages.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun coulage validé à essayer.</p>
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        const resistancesMpa = [f.r1, f.r2, f.r3]
          .filter((v) => v.trim() !== '')
          .map((v) => lireNombre(v) ?? Number.NaN)
        envoyer(
          () =>
            enregistrerEssaisAction({
              projetId,
              coulageId: f.coulageId,
              prelevement: Math.round(lireNombre(f.prelevement) ?? 1),
              ageJ: Math.round(lireNombre(f.ageJ) ?? 28),
              dateEcrasement: f.dateEcrasement,
              resistancesMpa,
              laboratoire: f.laboratoire.trim() === '' ? null : f.laboratoire.trim(),
            }),
          () => setF({ ...f, r1: '', r2: '', r3: '' }),
        )
      }}
    >
      <label className="grid gap-1.5 text-xs sm:col-span-4">
        <span className="libelle-champ">Coulage</span>
        <select
          className={CHAMP}
          value={f.coulageId}
          onChange={(e) => recaler(e.target.value, f.ageJ)}
        >
          {coulages.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelle}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Âge du béton</span>
        <select
          className={CHAMP}
          value={f.ageJ}
          onChange={(e) => recaler(f.coulageId, e.target.value)}
        >
          <option value="7">7 jours</option>
          <option value="28">28 jours</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Prélèvement n°</span>
        <input
          className={CHAMP}
          inputMode="numeric"
          value={f.prelevement}
          onChange={(e) => setF({ ...f, prelevement: e.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Écrasement le</span>
        <input
          type="date"
          className={CHAMP}
          value={f.dateEcrasement}
          min={coulage?.date}
          max={aujourdhui}
          onChange={(e) => setF({ ...f, dateEcrasement: e.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Laboratoire</span>
        <input
          className={CHAMP}
          value={f.laboratoire}
          onChange={(e) => setF({ ...f, laboratoire: e.target.value })}
        />
      </label>
      {(['r1', 'r2', 'r3'] as const).map((k, i) => (
        <label key={k} className="grid gap-1.5 text-xs">
          <span className="libelle-champ">Éprouvette {i + 1}, MPa</span>
          <input
            className={CHAMP}
            inputMode="decimal"
            value={f[k]}
            onChange={(e) => setF({ ...f, [k]: e.target.value })}
            required={i === 0}
          />
        </label>
      ))}
      <div className="self-end">
        <Button type="submit" className="h-10" disabled={enCours}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

export function FormulaireFiche({
  projetId,
  aujourdhui,
  lots,
}: {
  projetId: string
  aujourdhui: string
  lots: { id: string; nom: string }[]
}) {
  const { enCours, envoyer } = useEnvoi()
  const vide = { dateConstat: aujourdhui, lotId: '', titre: '', constat: '', gravite: '2' }
  const [f, setF] = useState(vide)
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(
          () =>
            ouvrirNonConformiteAction({
              projetId,
              dateConstat: f.dateConstat,
              lotId: f.lotId || null,
              titre: f.titre,
              constat: f.constat,
              gravite: Number(f.gravite),
            }),
          () => setF(vide),
        )
      }}
    >
      <label className="grid gap-1.5 text-xs sm:col-span-3">
        <span className="libelle-champ">Titre</span>
        <input
          className={CHAMP}
          value={f.titre}
          onChange={(e) => setF({ ...f, titre: e.target.value })}
          placeholder="Enrobage insuffisant, défaut de planéité…"
          required
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Constatée le</span>
        <input
          type="date"
          className={CHAMP}
          value={f.dateConstat}
          max={aujourdhui}
          onChange={(e) => setF({ ...f, dateConstat: e.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs">
        <span className="libelle-champ">Lot</span>
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
        <span className="libelle-champ">Gravité</span>
        <select
          className={CHAMP}
          value={f.gravite}
          onChange={(e) => setF({ ...f, gravite: e.target.value })}
        >
          <option value="1">1, mineure</option>
          <option value="2">2, modérée</option>
          <option value="3">3, majeure</option>
          <option value="4">4, bloquante</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-xs sm:col-span-3">
        <span className="libelle-champ">Constat</span>
        <textarea
          className={`${CHAMP} h-auto py-2`}
          rows={3}
          value={f.constat}
          onChange={(e) => setF({ ...f, constat: e.target.value })}
          required
        />
      </label>
      <div>
        <Button type="submit" className="h-10" disabled={enCours}>
          Ouvrir la fiche
        </Button>
      </div>
    </form>
  )
}

export function TraitementFiche({
  projetId,
  ficheId,
  aujourdhui,
}: {
  projetId: string
  ficheId: string
  aujourdhui: string
}) {
  const { enCours, envoyer } = useEnvoi()
  const [f, setF] = useState({ cause: '', action: '' })
  return (
    <form
      className="mt-3 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer(() => traiterNonConformiteAction({ projetId, ficheId, ...f, date: aujourdhui }))
      }}
    >
      <input
        className={CHAMP}
        aria-label="Cause"
        placeholder="Cause"
        value={f.cause}
        onChange={(e) => setF({ ...f, cause: e.target.value })}
        required
      />
      <input
        className={CHAMP}
        aria-label="Action corrective"
        placeholder="Action corrective"
        value={f.action}
        onChange={(e) => setF({ ...f, action: e.target.value })}
        required
      />
      <div>
        <Button type="submit" size="sm" disabled={enCours}>
          Consigner le traitement
        </Button>
      </div>
    </form>
  )
}

export function LeveeFiche({
  projetId,
  ficheId,
  aujourdhui,
}: {
  projetId: string
  ficheId: string
  aujourdhui: string
}) {
  const { enCours, envoyer } = useEnvoi()
  return (
    <Button
      size="sm"
      className="mt-3"
      disabled={enCours}
      onClick={() =>
        envoyer(() => leverNonConformiteAction({ projetId, ficheId, date: aujourdhui }))
      }
    >
      Lever la non-conformité
    </Button>
  )
}
