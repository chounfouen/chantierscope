'use client'

/**
 * Validation groupee des releves soumis, en tete du journal.
 *
 * Valider une semaine releve par releve demandait d'ouvrir chaque fiche, de
 * valider, de revenir au journal et de refiltrer : une trentaine de clics
 * pour sept releves. Ici, le conducteur voit d'un coup d'oeil les releves en
 * attente — lot, effectif, lignes, depassements de quantitatif — et les
 * valide ensemble, apres une confirmation, en un seul recalcul.
 *
 * Un releve qui signale un depassement ou un alea reste coche mais se
 * remarque : le conducteur peut l'ouvrir avant de valider.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { validerSelectionAction } from '@/app/(app)/projet/[id]/releve/actions'
import { Button } from '@/components/ui/button'
import type { ReleveAValider } from '@/db/queries/saisie'
import { dateCourte } from '@/lib/format'
import { Icone } from '@/lib/icones'
import { teinteSerie } from '@/lib/viz'

export function ValidationGroupee({
  projetId,
  releves,
}: {
  projetId: string
  releves: readonly ReleveAValider[]
}) {
  const router = useRouter()
  const [coches, setCoches] = useState<ReadonlySet<string>>(() => new Set(releves.map((r) => r.id)))
  const [confirmation, setConfirmation] = useState(false)
  const [enCours, demarrer] = useTransition()

  if (releves.length === 0) return null
  const selection = releves.filter((r) => coches.has(r.id))
  const tous = selection.length === releves.length

  function basculer(id: string) {
    setConfirmation(false)
    setCoches((c) => {
      const n = new Set(c)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function valider() {
    demarrer(async () => {
      const r = await validerSelectionAction(
        projetId,
        selection.map((s) => ({ id: s.id, version: s.version })),
      )
      if (r.ok && r.perimes === 0) toast.success(r.message)
      else if (r.ok) toast.warning(r.message)
      else toast.error(r.message)
      setConfirmation(false)
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="titre-a-valider" className="surface mt-5 overflow-hidden">
      <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="titre-a-valider" className="text-base font-extrabold">
          {releves.length} relevé{releves.length > 1 ? 's' : ''} à valider
        </h2>
        <Button
          variant="ghost"
          className="h-9"
          onClick={() => {
            setConfirmation(false)
            setCoches(tous ? new Set() : new Set(releves.map((r) => r.id)))
          }}
        >
          {tous ? 'Tout décocher' : 'Tout cocher'}
        </Button>
      </div>

      <ul className="divide-border/60 max-h-80 divide-y overflow-y-auto">
        {releves.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-[var(--marque)]"
              checked={coches.has(r.id)}
              onChange={() => basculer(r.id)}
              aria-label={`Relevé du ${dateCourte(r.date)}, ${r.lotNom}`}
            />
            <span
              aria-hidden
              className="h-4 w-1 shrink-0 rounded-full"
              style={{ background: teinteSerie(r.rangCouleur) }}
            />
            <span className="min-w-0 flex-1 text-sm">
              <span className="chiffres-alignes font-bold">{dateCourte(r.date)}</span>
              <span className="text-muted-foreground mx-1.5 font-mono text-xs">{r.lotCode}</span>
              <span className="truncate">{r.lotNom}</span>
              <span className="text-muted-foreground block text-xs">
                {r.journeeTravaillee
                  ? `${r.effectifOuvriers} ouvriers · ${r.nombreLignes} ligne${r.nombreLignes > 1 ? 's' : ''}`
                  : 'Journée non travaillée'}
                {r.auteur ? ` · ${r.auteur}` : ''}
              </span>
            </span>
            {(r.depassements > 0 || r.aAlea || r.reserves > 0 || r.pointsArret > 0) && (
              <span className="[&>svg]:text-etat-retard flex shrink-0 items-center gap-1 text-xs font-bold">
                <Icone.alerte className="size-3.5" aria-hidden />
                {[
                  r.depassements > 0 &&
                    `${r.depassements} dépassement${r.depassements > 1 ? 's' : ''}`,
                  r.aAlea && 'Aléa',
                  r.reserves > 0 && `${r.reserves} réserve${r.reserves > 1 ? 's' : ''}`,
                  r.pointsArret > 0 && 'Ferraillage non réceptionné',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <Link
              href={`/projet/${projetId}/releve/${r.id}`}
              className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-4"
            >
              Ouvrir
            </Link>
          </li>
        ))}
      </ul>

      <div className="border-border/70 flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {confirmation ? (
          <>
            <p className="text-sm">
              Valider {selection.length} relevé{selection.length > 1 ? 's' : ''} ? Une fois validés,
              ils ne se modifient plus.
            </p>
            <Button className="h-11" disabled={enCours} onClick={valider}>
              <Icone.valide className="size-4" />
              Confirmer
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setConfirmation(false)}>
              Annuler
            </Button>
          </>
        ) : (
          <Button
            className="h-11"
            disabled={selection.length === 0 || enCours}
            onClick={() => setConfirmation(true)}
          >
            <Icone.valide className="size-4" />
            Valider la sélection ({selection.length})
          </Button>
        )}
      </div>
    </section>
  )
}
