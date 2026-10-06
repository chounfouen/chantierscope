'use client'

/**
 * Import d'une maquette IFC : lecture et conversion en GLB dans le
 * navigateur, resume, puis depot. Le moteur IFC, plusieurs mega-octets de
 * WebAssembly, n'est charge qu'ici.
 */

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  enregistrerMaquetteAction,
  preparerImportMaquetteAction,
} from '@/app/(app)/projet/[id]/maquette/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Icone } from '@/lib/icones'
import { refusMaquette, TAILLE_MAX_IFC } from '@/lib/maquette/format'
import type { Etage } from '@/lib/maquette/ifc'
import { FAMILLES, famille, type Famille } from '@/lib/maquette/regles'

type Converti = {
  nom: string
  glb: Uint8Array
  elements: number
  etages: Etage[]
  familles: [Famille, number][]
  schema: string
}

async function convertirIfc(fichier: File): Promise<Converti> {
  const [{ IfcAPI }, { extraireMaquette, glbMaquette }] = await Promise.all([
    import('web-ifc'),
    import('@/lib/maquette/ifc'),
  ])
  const api = new IfcAPI()
  const wasm = new URL('web-ifc/web-ifc.wasm', import.meta.url).href
  // Un seul fil : la version multi-fils exige des en-tetes d'isolation que
  // l'application n'impose pas.
  await api.Init(() => wasm, true)
  const m = extraireMaquette(api, new Uint8Array(await fichier.arrayBuffer()))
  if (m.elements.length === 0) throw new Error('La maquette ne contient aucun élément dessinable.')
  const compte = new Map<Famille, number>()
  for (const e of m.elements)
    compte.set(famille(e.classe), (compte.get(famille(e.classe)) ?? 0) + 1)
  return {
    nom: fichier.name,
    glb: glbMaquette(m),
    elements: m.elements.length,
    etages: m.etages,
    familles: [...compte.entries()].sort((a, b) => b[1] - a[1]),
    schema: m.schema,
  }
}

export function ImportMaquette({
  projetId,
  remplace,
  surFermeture,
}: {
  projetId: string
  remplace: boolean
  surFermeture: () => void
}) {
  const router = useRouter()
  const entree = useRef<HTMLInputElement>(null)
  const [converti, setConverti] = useState<Converti | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [envoi, demarrer] = useTransition()

  async function choisir(fichier: File | undefined) {
    if (!fichier) return
    setConverti(null)
    setErreur(null)
    const refus =
      fichier.size > TAILLE_MAX_IFC
        ? 'Fichier trop volumineux (300 Mo au plus).'
        : refusMaquette(fichier.name, new Uint8Array(await fichier.slice(0, 64).arrayBuffer()))
    if (refus) {
      setErreur(refus)
      return
    }
    setOccupe('Lecture de la maquette…')
    // Laisse le navigateur afficher le message avant le calcul.
    await new Promise((r) => setTimeout(r, 30))
    try {
      setConverti(await convertirIfc(fichier))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Maquette illisible.')
    } finally {
      setOccupe(null)
    }
  }

  function importer() {
    if (!converti) return
    demarrer(async () => {
      const p = await preparerImportMaquetteAction({ projetId })
      if (!p.ok) {
        toast.error(p.message)
        return
      }
      const r = await fetch(p.depot.url, {
        method: p.depot.methode,
        headers: p.depot.entetes,
        body: new Blob([converti.glb as BlobPart], { type: 'model/gltf-binary' }),
      }).catch(() => null)
      if (!r?.ok) {
        toast.error(
          r?.status === 413
            ? 'Maquette trop lourde une fois convertie (50 Mo au plus).'
            : 'Envoi de la maquette interrompu : vérifier la connexion et réessayer.',
        )
        return
      }
      const e = await enregistrerMaquetteAction({
        projetId,
        fichierId: p.fichierId,
        nomFichier: converti.nom,
      })
      if (!e.ok) {
        toast.error(e.message)
        return
      }
      toast.success(e.message)
      surFermeture()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !envoi && surFermeture()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">
            Importer la maquette du bâtiment
          </DialogTitle>
          <DialogDescription>
            Export IFC de Revit, ArchiCAD, Tekla, Allplan ou tout logiciel BIM. La maquette est
            convertie sur cet appareil ; seule sa géométrie allégée est envoyée.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => entree.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void choisir(e.dataTransfer.files[0])
          }}
          disabled={!!occupe || envoi}
          aria-label="Choisir le fichier IFC de la maquette"
          className="border-input hover:border-marque/60 hover:bg-marque-douce/50 grid min-h-32 place-items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors"
        >
          <span className="pastille size-11 rounded-full">
            <Icone.importer className="size-5" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="text-sm font-bold">
            {converti ? converti.nom : (occupe ?? 'Choisir ou déposer un fichier IFC')}
          </span>
          <span className="text-muted-foreground text-xs">
            Fichier Revit ? Fichier, Exporter, IFC.
          </span>
        </button>
        <input
          ref={entree}
          type="file"
          accept=".ifc"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void choisir(e.target.files?.[0])}
        />

        {converti && (
          <div className="bg-muted/60 space-y-3 rounded-2xl px-4 py-3.5 text-sm" aria-live="polite">
            <p className="font-bold">
              {converti.elements} éléments sur {converti.etages.length} étages, schéma{' '}
              {converti.schema}
            </p>
            <p className="text-muted-foreground">
              Étages : {converti.etages.map((e) => e.nom).join(', ')}.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {converti.familles.map(([f, n]) => (
                <li key={f} className="bg-card rounded-full px-2.5 py-1 text-xs font-bold">
                  {FAMILLES[f]} · {n}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Géométrie convertie : {Math.max(1, Math.round(converti.glb.byteLength / 1024))} Ko.
            </p>
          </div>
        )}

        {erreur && (
          <p
            role="alert"
            className="[&>svg]:text-etat-critique flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-snug font-semibold"
            style={{ background: 'color-mix(in oklab, var(--etat-critique) 12%, var(--card))' }}
          >
            <Icone.alerte className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} aria-hidden />
            {erreur}
          </p>
        )}

        {remplace && (
          <p className="bg-marque-douce rounded-xl px-3.5 py-3 text-sm leading-snug font-semibold">
            Cette maquette remplacera la précédente. Les rattachements des tâches sont conservés et
            s’appliquent à la nouvelle version.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={surFermeture} disabled={envoi}>
            Annuler
          </Button>
          <Button onClick={importer} disabled={!converti || envoi}>
            <Icone.importer className="size-4" strokeWidth={2.25} aria-hidden />
            {envoi ? 'Envoi en cours…' : 'Importer cette maquette'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
