'use client'

/**
 * Releves en attente d'envoi sur ce telephone, et indicateur de reseau.
 *
 * La synchronisation est declenchee au chargement, au retour du reseau et a
 * intervalle regulier tant que la file n'est pas vide. Elle ne concerne que
 * les releves de l'utilisateur connecte.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { dateLongue } from '@/lib/format'
import {
  lister,
  listerPhotos,
  retirer,
  surChangementFile,
  synchroniser,
  synchroniserPhotos,
  type EntreeFile,
} from '@/lib/hors-ligne/file'
import { useEnLigne } from '@/lib/hors-ligne/reseau'
import { Icone } from '@/lib/icones'
import { cn } from '@/lib/utils'

const INTERVALLE_MS = 60_000

/**
 * File de ce telephone, tenue a jour a chaque changement : les releves, et le
 * nombre de photos en attente, qui peuvent rester seules en file quand leur
 * releve est parti mais pas elles.
 */
function useFile(
  projetId: string,
  utilisateurId: string,
): { releves: EntreeFile[]; photos: number } {
  const [etat, setEtat] = useState<{ releves: EntreeFile[]; photos: number }>({
    releves: [],
    photos: 0,
  })
  useEffect(() => {
    let actif = true
    const relire = () => {
      Promise.all([lister(projetId, utilisateurId), listerPhotos(projetId, utilisateurId)])
        .then(([releves, photos]) => {
          if (actif) {
            setEtat({ releves, photos: photos.filter((p) => p.etat === 'en_attente').length })
          }
        })
        .catch(() => {
          // IndexedDB indisponible, navigation privee par exemple : la file
          // reste vide, la saisie directe fonctionne toujours.
        })
    }
    relire()
    const desabonner = surChangementFile(relire)
    return () => {
      actif = false
      desabonner()
    }
  }, [projetId, utilisateurId])
  return etat
}

/** Pastille de l'en-tete : reseau, et nombre de releves en attente. */
export function IndicateurReseau({
  projetId,
  utilisateurId,
}: {
  projetId: string
  utilisateurId: string
}) {
  const router = useRouter()
  const enLigne = useEnLigne()
  const file = useFile(projetId, utilisateurId)
  const enAttente = file.releves.filter((e) => e.etat === 'en_attente').length + file.photos
  const enCours = useRef(false)

  const lancer = useCallback(async () => {
    if (enCours.current || !navigator.onLine) return
    enCours.current = true
    try {
      const bilan = await synchroniser(projetId, utilisateurId)
      if (!bilan.interrompue) await synchroniserPhotos(projetId, utilisateurId)
      if (bilan.envoyes > 0) {
        toast.success(
          bilan.envoyes === 1
            ? 'Un relevé saisi hors ligne a été envoyé.'
            : `${bilan.envoyes} relevés saisis hors ligne ont été envoyés.`,
        )
        router.refresh()
      }
      if (bilan.refuses > 0) {
        toast.error('Un relevé en attente a été refusé : voir le journal de chantier.')
      }
    } catch {
      // Base locale indisponible : rien a synchroniser.
    } finally {
      enCours.current = false
    }
  }, [projetId, utilisateurId, router])

  useEffect(() => {
    if (enLigne && enAttente > 0) void lancer()
  }, [enLigne, enAttente, lancer])

  useEffect(() => {
    if (enAttente === 0) return
    const minuterie = window.setInterval(() => void lancer(), INTERVALLE_MS)
    return () => window.clearInterval(minuterie)
  }, [enAttente, lancer])

  if (enLigne && enAttente === 0) return null

  const IconeEtat = !enLigne ? Icone.horsLigne : Icone.enFile
  return (
    <span
      role="status"
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        !enLigne ? 'text-etat-retard border-current/40' : 'text-muted-foreground',
      )}
    >
      <IconeEtat className="size-3.5" aria-hidden />
      {!enLigne ? 'Hors ligne' : 'Envoi en attente'}
      {enAttente > 0 && <span className="chiffres-alignes font-medium">· {enAttente}</span>}
    </span>
  )
}

/** Detail de la file, dans le journal de chantier. */
export function FileAttente({
  projetId,
  utilisateurId,
}: {
  projetId: string
  utilisateurId: string
}) {
  const { releves: file, photos } = useFile(projetId, utilisateurId)
  const enLigne = useEnLigne()
  const router = useRouter()
  const [envoi, setEnvoi] = useState(false)

  if (file.length === 0 && photos === 0) return null

  async function envoyerMaintenant() {
    setEnvoi(true)
    const bilan = await synchroniser(projetId, utilisateurId)
      .then(async (b) => {
        if (!b.interrompue) await synchroniserPhotos(projetId, utilisateurId)
        return b
      })
      .finally(() => setEnvoi(false))
    if (bilan.envoyes > 0) router.refresh()
    if (bilan.interrompue) toast.info('Le serveur reste injoignable. Nouvel essai automatique.')
  }

  return (
    <section
      aria-labelledby="titre-file"
      className="border-etat-retard/40 mt-5 rounded-xl border border-dashed p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titre-file" className="flex items-center gap-2 text-sm font-medium">
          <Icone.enFile className="size-4" aria-hidden />
          Sur ce téléphone, en attente d’envoi
        </h2>
        {enLigne && (photos > 0 || file.some((e) => e.etat === 'en_attente')) && (
          <Button variant="outline" className="h-9" disabled={envoi} onClick={envoyerMaintenant}>
            Envoyer maintenant
          </Button>
        )}
      </div>
      {photos > 0 && (
        <p className="text-muted-foreground mt-1 text-xs">
          {photos} photo{photos > 1 ? 's' : ''} en attente d’envoi.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {file.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <span>
              {dateLongue(e.releve.date)}
              <span className="text-muted-foreground">
                {' '}
                — {e.releve.soumettre ? 'à soumettre' : 'brouillon'}
              </span>
              {e.motif && (
                <span
                  className={cn(
                    'block text-xs',
                    e.etat === 'refuse' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {e.etat === 'refuse' ? 'Refusé : ' : ''}
                  {e.motif}
                </span>
              )}
            </span>
            {e.etat === 'refuse' && (
              <Button
                variant="ghost"
                className="h-9"
                onClick={() => {
                  if (window.confirm('Retirer ce relevé refusé de ce téléphone ?'))
                    void retirer(e.id)
                }}
              >
                <Icone.supprimer className="size-4" />
                Retirer
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
