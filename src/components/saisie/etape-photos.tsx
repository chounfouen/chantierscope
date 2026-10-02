'use client'

/**
 * Etape photos du releve.
 *
 * Les photos sont compressees des leur selection, pas a l'envoi : le chef
 * de chantier voit tout de suite ce qui partira, et l'envoi hors ligne n'a
 * pas a garder des originaux de plusieurs megaoctets dans le telephone.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icone } from '@/lib/icones'
import { compresser } from '@/lib/photos/compression'
import type { PhotoAEnvoyer } from '@/lib/photos/televersement'
import { nouvelIdentifiant } from '@/lib/releve-formulaire'
import { CLASSE_CHAMP } from './champs'

/** Nombre de photos par releve : au-dela, c'est un reportage, pas un releve. */
export const PHOTOS_MAX = 12

function Apercu({ photo }: { photo: PhotoAEnvoyer }) {
  const url = useMemo(() => URL.createObjectURL(photo.vignette), [photo.vignette])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  // Apercu local d'un Blob : le composant Image de Next n'apporte rien ici.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
}

export function EtapePhotos({
  releveId,
  photos,
  surChangement,
}: {
  releveId: string
  photos: PhotoAEnvoyer[]
  surChangement: (p: PhotoAEnvoyer[]) => void
}) {
  const [traitement, setTraitement] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)

  async function ajouter(fichiers: FileList | null) {
    if (!fichiers) return
    setErreur(null)
    const liste = [...fichiers].slice(0, PHOTOS_MAX - photos.length)
    setTraitement(liste.length)
    const nouvelles: PhotoAEnvoyer[] = []
    for (const f of liste) {
      try {
        const c = await compresser(f)
        nouvelles.push({ id: nouvelIdentifiant(), releveId, legende: null, ...c })
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Photo illisible.')
      }
      setTraitement((n) => n - 1)
    }
    surChangement([...photos, ...nouvelles])
  }

  return (
    <>
      <label className="border-input hover:bg-accent/60 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm">
        <Icone.photos className="size-6" aria-hidden />
        <span className="font-medium">Prendre ou choisir des photos</span>
        <span className="text-muted-foreground text-xs">
          {photos.length} sur {PHOTOS_MAX}, compressées sur le téléphone avant l’envoi
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          disabled={photos.length >= PHOTOS_MAX || traitement > 0}
          onChange={(e) => {
            void ajouter(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {traitement > 0 && (
        <p role="status" className="text-muted-foreground text-sm">
          Compression en cours…
        </p>
      )}
      {erreur && (
        <p role="alert" className="text-destructive text-sm">
          {erreur}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3">
        {photos.map((p, i) => (
          <li key={p.id} className="space-y-1.5">
            <Apercu photo={p} />
            <input
              type="text"
              aria-label={`Légende de la photo ${i + 1}`}
              placeholder="Légende"
              value={p.legende ?? ''}
              onChange={(e) =>
                surChangement(
                  photos.map((x) =>
                    x.id === p.id ? { ...x, legende: e.target.value || null } : x,
                  ),
                )
              }
              className={`${CLASSE_CHAMP} h-10 text-sm`}
            />
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full"
              onClick={() => surChangement(photos.filter((x) => x.id !== p.id))}
            >
              <Icone.supprimer className="size-4" />
              Retirer
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}
