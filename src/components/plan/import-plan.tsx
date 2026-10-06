'use client'

/**
 * Fenetre d'import d'un fond de plan : choix du niveau, du fichier, des
 * calques (DXF) ou de la page (PDF), apercu, puis depot.
 *
 * La conversion se fait ici, dans le navigateur ; le serveur ne recoit
 * qu'une image WebP. La fenetre est montee a chaque ouverture : elle repart
 * toujours de zero.
 */

import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { enregistrerPlanAction, preparerImportAction } from '@/app/(app)/projet/[id]/plan/actions'
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
import { analyser, convertir, type ImagePlan, type Source } from '@/lib/plan/conversion'
import { EXTENSIONS_PLAN } from '@/lib/plan/format'
import { libelleNiveau } from '@/lib/plan/zones'

const LIBELLE_FORMAT: Record<Source['format'], string> = {
  DXF: 'Plan AutoCAD (DXF)',
  PDF: 'Document PDF',
  SVG: 'Dessin vectoriel (SVG)',
  IMAGE: 'Image',
}

export function ImportPlan({
  projetId,
  niveaux,
  niveauInitial,
  zonesParNiveau,
  plansParNiveau,
  ouvert,
  surFermeture,
}: {
  projetId: string
  niveaux: number[]
  niveauInitial: number
  zonesParNiveau: ReadonlyMap<number, number>
  plansParNiveau: ReadonlySet<number>
  ouvert: boolean
  surFermeture: (niveauImporte?: number) => void
}) {
  const router = useRouter()
  const id = useId()
  const entree = useRef<HTMLInputElement>(null)
  const [niveau, setNiveau] = useState(niveauInitial)
  const [source, setSource] = useState<Source | null>(null)
  const [calques, setCalques] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [image, setImage] = useState<(ImagePlan & { url: string }) | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [envoi, demarrer] = useTransition()

  // Apercu, recalcule quand les calques ou la page changent.
  useEffect(() => {
    if (!source) return
    let annule = false
    const minuterie = setTimeout(async () => {
      setOccupe('Préparation de l’aperçu…')
      setErreur(null)
      try {
        const r = await convertir(source, { calquesVisibles: calques, page })
        if (annule) return
        setImage((ancienne) => {
          if (ancienne) URL.revokeObjectURL(ancienne.url)
          return { ...r, url: URL.createObjectURL(r.blob) }
        })
      } catch (e) {
        if (!annule) {
          setImage(null)
          setErreur(e instanceof Error ? e.message : 'Conversion impossible.')
        }
      } finally {
        if (!annule) setOccupe(null)
      }
    }, 250)
    return () => {
      annule = true
      clearTimeout(minuterie)
    }
  }, [source, calques, page])

  async function choisir(fichier: File | undefined) {
    if (!fichier) return
    setSource(null)
    setImage(null)
    setErreur(null)
    setOccupe('Lecture du fichier…')
    try {
      const s = await analyser(fichier)
      if (s.format === 'DXF') {
        setCalques(new Set(s.dessin.calques.filter((c) => c.visibleParDefaut).map((c) => c.nom)))
      }
      setPage(1)
      setSource(s)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier illisible.')
    } finally {
      setOccupe(null)
    }
  }

  function importer() {
    if (!image || !source) return
    demarrer(async () => {
      const p = await preparerImportAction({ projetId, niveau })
      if (!p.ok) {
        toast.error(p.message)
        return
      }
      const r = await fetch(p.depot.url, {
        method: p.depot.methode,
        headers: p.depot.entetes,
        body: image.blob,
      }).catch(() => null)
      if (!r?.ok) {
        toast.error('Envoi du plan interrompu : vérifier la connexion et réessayer.')
        return
      }
      const e = await enregistrerPlanAction({
        projetId,
        planId: p.planId,
        niveau,
        formatSource: image.format,
        nomFichier: source.nom,
      })
      if (!e.ok) {
        toast.error(e.message)
        return
      }
      toast.success(e.message)
      surFermeture(niveau)
      router.refresh()
    })
  }

  const zones = zonesParNiveau.get(niveau) ?? 0
  const choixNiveaux = [...new Set([...niveaux, niveau])].sort((a, b) => a - b)

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && !envoi && surFermeture()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">Importer un plan de niveau</DialogTitle>
          <DialogDescription>
            Plan AutoCAD exporté en DXF, PDF, SVG ou image. Le fichier est converti sur cet appareil
            ; seule l’image du plan est envoyée.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <label className="grid content-start gap-1.5">
            <span className="libelle-champ">Niveau</span>
            <select
              value={niveau}
              onChange={(e) => setNiveau(Number(e.target.value))}
              className="champ champ-compact"
            >
              {choixNiveaux.map((n) => (
                <option key={n} value={n}>
                  {libelleNiveau(n)}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground text-xs">Ou un autre niveau :</span>
            <input
              type="number"
              min={-9}
              max={199}
              aria-label="Numéro du niveau, 0 pour le rez-de-chaussée"
              value={niveau}
              onChange={(e) => setNiveau(Math.trunc(Number(e.target.value) || 0))}
              className="champ champ-compact"
            />
          </label>

          <div className="grid content-start gap-1.5">
            <span className="libelle-champ" id={`${id}-fichier`}>
              Fichier du plan
            </span>
            <button
              type="button"
              aria-labelledby={`${id}-fichier`}
              onClick={() => entree.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void choisir(e.dataTransfer.files[0])
              }}
              className="border-input hover:border-marque/60 hover:bg-marque-douce/50 grid min-h-28 place-items-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors"
            >
              <span className="pastille size-10 rounded-full">
                <Icone.importer className="size-5" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="text-sm font-bold">
                {source ? source.nom : 'Choisir ou déposer un fichier'}
              </span>
              <span className="text-muted-foreground text-xs">
                {source ? LIBELLE_FORMAT[source.format] : 'DXF, PDF, SVG, PNG, JPEG, WebP'}
              </span>
            </button>
            <input
              ref={entree}
              type="file"
              accept={EXTENSIONS_PLAN}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void choisir(e.target.files?.[0])}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              Fichier DWG ? Dans AutoCAD : Fichier, Enregistrer sous, type DXF.
            </p>
          </div>
        </div>

        {source?.format === 'DXF' && (
          <fieldset className="grid gap-2">
            <legend className="libelle-champ mb-1.5 flex w-full items-center justify-between">
              Calques affichés
              <span className="flex gap-3 text-xs font-semibold">
                <button
                  type="button"
                  className="text-marque hover:underline"
                  onClick={() => setCalques(new Set(source.dessin.calques.map((c) => c.nom)))}
                >
                  Tous
                </button>
                <button
                  type="button"
                  className="text-marque hover:underline"
                  onClick={() => setCalques(new Set())}
                >
                  Aucun
                </button>
              </span>
            </legend>
            <ul className="border-border/70 grid max-h-44 gap-x-4 overflow-y-auto rounded-xl border px-3 py-2 sm:grid-cols-2">
              {source.dessin.calques.map((c) => (
                <li key={c.nom}>
                  <label className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={calques.has(c.nom)}
                      onChange={(e) => {
                        const s = new Set(calques)
                        if (e.target.checked) s.add(c.nom)
                        else s.delete(c.nom)
                        setCalques(s)
                      }}
                      className="accent-marque size-4"
                    />
                    <span className="min-w-0 truncate font-semibold">{c.nom}</span>
                    <span className="text-muted-foreground ml-auto text-xs">{c.entites}</span>
                  </label>
                </li>
              ))}
            </ul>
            {Object.keys(source.dessin.ignorees).length > 0 && (
              <p className="text-muted-foreground text-xs">
                Non dessinés :{' '}
                {Object.entries(source.dessin.ignorees)
                  .map(([t, n]) => `${t} (${n})`)
                  .join(', ')}
                . Les hachures et les images insérées ne sont pas reprises.
              </p>
            )}
          </fieldset>
        )}

        {source?.format === 'PDF' && source.pages > 1 && (
          <label className="flex items-center gap-3">
            <span className="libelle-champ">Page</span>
            <input
              type="number"
              min={1}
              max={source.pages}
              value={page}
              onChange={(e) =>
                setPage(
                  Math.min(source.pages, Math.max(1, Math.trunc(Number(e.target.value)) || 1)),
                )
              }
              className="champ champ-compact w-24"
            />
            <span className="text-muted-foreground text-sm">sur {source.pages}</span>
          </label>
        )}

        <div
          className="bg-muted/60 border-border/70 relative grid min-h-48 place-items-center overflow-hidden rounded-2xl border"
          aria-live="polite"
        >
          {image ? (
            // Apercu local, en adresse blob : next/image n'y apporte rien.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt="Aperçu du plan converti"
              className="fond-plan max-h-80 w-full object-contain"
            />
          ) : (
            <p className="text-muted-foreground px-6 py-10 text-center text-sm">
              {occupe ?? 'L’aperçu du plan s’affichera ici.'}
            </p>
          )}
          {image && occupe && (
            <p className="bg-card/90 absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold">
              {occupe}
            </p>
          )}
        </div>
        {image && (
          <p className="text-muted-foreground -mt-2 text-xs">
            Image de {image.largeur} × {image.hauteur} pixels,{' '}
            {Math.max(1, Math.round(image.blob.size / 1024))} Ko.
          </p>
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

        {plansParNiveau.has(niveau) && (
          <p className="bg-marque-douce rounded-xl px-3.5 py-3 text-sm leading-snug font-semibold">
            Ce plan remplacera celui du niveau {libelleNiveau(niveau)}.
            {zones > 0 &&
              ` Ses ${zones} zone${zones > 1 ? 's' : ''} suivront, à leur position relative : vérifier ensuite les contours.`}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => surFermeture()} disabled={envoi}>
            Annuler
          </Button>
          <Button onClick={importer} disabled={!image || !!occupe || envoi}>
            <Icone.importer className="size-4" strokeWidth={2.25} aria-hidden />
            {envoi ? 'Envoi en cours…' : 'Importer ce plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
