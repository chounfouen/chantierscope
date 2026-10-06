'use client'

/**
 * Formulaire d'une zone en cours d'edition : nom et taches rattachees. Le
 * contour se dessine sur le plan ; ce volet ne porte que ce qui se tape.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TacheRattachable } from '@/db/queries/plan'
import { Icone } from '@/lib/icones'

export type ZoneEnEdition = {
  id?: string
  nom: string
  tacheIds: string[]
  points: [number, number][]
  /** Vrai tant que le contour se trace, sommet par sommet. */
  trace: boolean
}

export function EditeurZone({
  zone,
  taches,
  enCours,
  surChangement,
  surEnregistrer,
  surAnnuler,
  surRedessiner,
  surSupprimer,
}: {
  zone: ZoneEnEdition
  taches: readonly TacheRattachable[]
  enCours: boolean
  surChangement: (z: ZoneEnEdition) => void
  surEnregistrer: () => void
  surAnnuler: () => void
  surRedessiner: () => void
  surSupprimer: (() => void) | null
}) {
  const [filtre, setFiltre] = useState('')
  const choisies = new Set(zone.tacheIds)
  const visibles = useMemo(() => {
    const f = filtre.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    const liste = f
      ? taches.filter((t) =>
          `${t.codeWbs} ${t.nom} ${t.lotNom}`
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .includes(f),
        )
      : taches
    // Les taches deja rattachees en tete : on voit d'abord ce qui est choisi.
    return [...liste].sort((a, b) => Number(choisies.has(b.id)) - Number(choisies.has(a.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre, taches])

  const basculer = (id: string) => {
    const s = new Set(choisies)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    surChangement({ ...zone, tacheIds: [...s] })
  }

  if (zone.trace) {
    return (
      <div className="space-y-3 px-5 py-5">
        <h2 className="text-base font-extrabold">
          {zone.id ? 'Redessiner le contour' : 'Nouvelle zone'}
        </h2>
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
          <li>Cliquer sur le plan pour poser chaque sommet de la zone.</li>
          <li>Cliquer sur le premier sommet, ou appuyer sur Entrée, pour fermer le contour.</li>
          <li>Retour arrière retire le dernier sommet ; Échap annule.</li>
        </ol>
        <p className="chiffres-alignes text-sm font-bold">
          {zone.points.length} sommet{zone.points.length > 1 ? 's' : ''} posé
          {zone.points.length > 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => surChangement({ ...zone, trace: false })}
            disabled={zone.points.length < 3}
          >
            Fermer le contour
          </Button>
          <Button variant="outline" onClick={surAnnuler}>
            Annuler
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="flex max-h-[42rem] flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        surEnregistrer()
      }}
    >
      <div className="border-border/70 space-y-3 border-b px-5 py-4">
        <h2 className="text-base font-extrabold">
          {zone.id ? 'Modifier la zone' : 'Nouvelle zone'}
        </h2>
        <label className="grid gap-1.5">
          <span className="libelle-champ">Nom de la zone</span>
          <input
            value={zone.nom}
            onChange={(e) => surChangement({ ...zone, nom: e.target.value })}
            placeholder="R+1 — Logements sud"
            required
            maxLength={120}
            className="champ"
          />
        </label>
        <p className="text-muted-foreground text-xs">
          Faire glisser un sommet sur le plan pour ajuster le contour.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-5 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="libelle-champ">Tâches réalisées dans la zone</span>
          <span className="text-muted-foreground text-xs font-bold">
            {choisies.size} choisie{choisies.size > 1 ? 's' : ''}
          </span>
        </div>
        <input
          type="search"
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          placeholder="Rechercher une tâche ou un lot"
          aria-label="Rechercher une tâche"
          className="champ champ-compact"
        />
        <ul className="border-border/70 max-h-64 overflow-y-auto rounded-xl border">
          {visibles.map((t) => (
            <li key={t.id} className="border-border/50 border-b last:border-b-0">
              <label className="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={choisies.has(t.id)}
                  onChange={() => basculer(t.id)}
                  className="accent-marque mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0 text-sm leading-snug">
                  <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                    {t.codeWbs}
                  </span>
                  <span className="font-semibold">{t.nom}</span>
                  <span className="text-muted-foreground block text-xs">{t.lotNom}</span>
                </span>
              </label>
            </li>
          ))}
          {visibles.length === 0 && (
            <li className="text-muted-foreground px-3 py-4 text-sm">Aucune tâche trouvée.</li>
          )}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 px-5 py-4">
        <Button type="submit" disabled={enCours || zone.nom.trim() === ''}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button type="button" variant="outline" onClick={surAnnuler} disabled={enCours}>
          Annuler
        </Button>
        <Button type="button" variant="outline" onClick={surRedessiner} disabled={enCours}>
          <Icone.dessiner className="size-4" aria-hidden />
          Redessiner
        </Button>
        {surSupprimer && (
          <Button
            type="button"
            variant="ghost"
            onClick={surSupprimer}
            disabled={enCours}
            className="text-destructive ml-auto"
          >
            <Icone.supprimer className="size-4" aria-hidden />
            Supprimer
          </Button>
        )}
      </div>
    </form>
  )
}
