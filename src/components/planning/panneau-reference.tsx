'use client'

/**
 * Reference du planning et planning recale, en tete de l'ecran du planning.
 *
 * Deux plannings coexistent, et le conducteur doit savoir lequel il regarde.
 * La REFERENCE, figee, porte la valeur planifiee : c'est contre elle que se
 * mesurent SPI et courbe en S. Le planning COURANT se recale librement ; rejoue
 * a la date d'etat, il donne la fin projetee et, contre la fin contractuelle,
 * les marges negatives a rattraper.
 *
 * Figer une nouvelle reference est un acte contractuel : il se motive, et se
 * confirme d'un second geste.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { figerReferenceAction } from '@/app/(app)/projet/[id]/planning/actions'
import { Button } from '@/components/ui/button'
import { dateLongue } from '@/lib/format'
import { Icone } from '@/lib/icones'

export function PanneauReference({
  projetId,
  reference,
  finCourante,
  recale,
  editable,
}: {
  projetId: string
  reference: { numero: number; motif: string; geleLe: string; fin: string; versions: number } | null
  /** Fin du planning courant, sans tenir compte de l'avancement. */
  finCourante: string
  /** Planning rejoue a la date d'etat, s'il y a une date d'etat. */
  recale: {
    dateEtat: string
    fin: string
    finContractuelle: string
    aRattraper: number
    pireMargeJ: number
  } | null
  editable: boolean
}) {
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [motif, setMotif] = useState('')
  const [enCours, demarrer] = useTransition()

  function figer() {
    demarrer(async () => {
      const r = await figerReferenceAction({ projetId, motif })
      if (r.ok) {
        toast.success(r.message)
        setOuvert(false)
        setMotif('')
        router.refresh()
      } else toast.error(r.message)
    })
  }

  return (
    <section
      aria-label="Référence et planning recalé"
      className="surface mt-4 grid gap-3 p-4 text-sm md:grid-cols-2"
    >
      <div>
        <h2 className="flex items-center gap-2 font-extrabold">
          <Icone.calendrier className="size-4" aria-hidden />
          {reference ? `Référence n° ${reference.numero}` : 'Aucune référence figée'}
        </h2>
        {reference ? (
          <p className="text-muted-foreground mt-1">
            Figée le {dateLongue(reference.geleLe.slice(0, 10))} : {reference.motif}. Elle finit le{' '}
            {dateLongue(reference.fin)}
            {reference.fin !== finCourante
              ? `, le planning courant le ${dateLongue(finCourante)}`
              : ', comme le planning courant'}
            . La valeur planifiée et la courbe en S se mesurent sur elle.
          </p>
        ) : (
          <p className="text-muted-foreground mt-1">
            La valeur planifiée suit le planning courant : chaque modification réécrit l’historique.
            Figer une référence la rend opposable.
          </p>
        )}
      </div>

      <div>
        {recale && (
          <>
            <h2 className="font-extrabold">
              Recalé au {dateLongue(recale.dateEtat)} : fin le {dateLongue(recale.fin)}
            </h2>
            <p className="text-muted-foreground mt-1">
              {recale.aRattraper > 0
                ? `${recale.aRattraper} tâche${recale.aRattraper > 1 ? 's portent' : ' porte'} une marge négative contre la fin contractuelle du ${dateLongue(recale.finContractuelle)}, jusqu’à ${-recale.pireMargeJ} jours à rattraper.`
                : `Toutes les tâches tiennent dans le délai contractuel, qui finit le ${dateLongue(recale.finContractuelle)}.`}
            </p>
          </>
        )}
      </div>

      {editable && (
        <div className="border-border/70 border-t pt-3 md:col-span-2">
          {ouvert ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                figer()
              }}
            >
              <label className="grid min-w-64 flex-1 gap-1.5 text-xs">
                <span className="libelle-champ">Motif du gel</span>
                <input
                  className="champ champ-compact"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Avenant n° 1, ordre de service de prolongation…"
                  required
                  minLength={5}
                />
              </label>
              <Button type="submit" className="h-10" disabled={enCours || motif.trim().length < 5}>
                Figer le planning courant
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => setOuvert(false)}
              >
                Annuler
              </Button>
              <p className="text-muted-foreground w-full text-xs">
                La valeur planifiée de tout l’historique sera recalculée sur le planning courant.
                Réservé à une décision contractuelle ; les références précédentes restent
                consultables.
              </p>
            </form>
          ) : (
            <Button variant="outline" className="h-10" onClick={() => setOuvert(true)}>
              Figer une nouvelle référence
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
