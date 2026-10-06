import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { Timeline, type PhotoAffichee } from '@/components/photos/timeline'
import { filtrer } from '@/db/compute/photos'
import { db } from '@/db/index'
import { chargerPhotos } from '@/db/queries/photos'
import { exigerPage } from '@/lib/garde'
import { urlAffichage } from '@/services/stockage'

export const metadata: Metadata = { title: 'Photos' }

type Recherche = Record<string, string | string[] | undefined>

const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

const CHAMP = 'champ champ-compact'

export default async function Photos({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Recherche>
}) {
  const { id } = await params
  await exigerPage(id)
  const r = await searchParams
  const vue = premier(r['vue']) === 'grille' ? 'grille' : 'chronologie'
  const filtre = {
    pointDeVueId: premier(r['pdv']),
    lotId: premier(r['lot']),
    du: date(premier(r['du'])),
    au: date(premier(r['au'])),
  }

  const donnees = await chargerPhotos(db(), id)
  const retenues = filtrer(donnees.photos, filtre)
  // Les URL signees sont produites en parallele : une par fichier.
  const photos: PhotoAffichee[] = await Promise.all(
    retenues.map(async (p) => {
      const [url, vignette] = await Promise.all([
        urlAffichage(p.chemin),
        urlAffichage(p.cheminVignette),
      ])
      return { ...p, url, vignette }
    }),
  )

  const lienVue = (v: string) => {
    const q = new URLSearchParams()
    q.set('vue', v)
    for (const [cle, valeur] of [
      ['pdv', filtre.pointDeVueId],
      ['lot', filtre.lotId],
      ['du', filtre.du],
      ['au', filtre.au],
    ] as const) {
      if (valeur) q.set(cle, valeur)
    }
    return `/projet/${id}/photos?${q.toString()}`
  }

  return (
    <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-6 lg:px-8">
      <FilAriane maillons={[{ libelle: 'Photos' }]} />
      <header className="mt-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[1.375rem] font-semibold">Timeline photographique</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {donnees.photos.length} photos, {donnees.pointsDeVue.length} points de vue de référence
          </p>
        </div>
        <nav aria-label="Présentation" className="bg-muted flex rounded-lg p-0.5 text-sm">
          {(
            [
              ['chronologie', 'Par point de vue'],
              ['grille', 'Grille par date'],
            ] as const
          ).map(([v, libelle]) => (
            <Link
              key={v}
              href={lienVue(v)}
              aria-current={vue === v ? 'page' : undefined}
              className={`rounded-md px-3 py-1 ${vue === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
            >
              {libelle}
            </Link>
          ))}
        </nav>
      </header>

      {/* Filtres en formulaire ordinaire : ils fonctionnent sans script, et
          l'adresse obtenue se partage telle quelle. */}
      <form
        method="get"
        aria-label="Filtres"
        className="surface mt-4 flex flex-wrap items-end gap-x-4 gap-y-3 px-5 py-3.5"
      >
        <input type="hidden" name="vue" value={vue} />
        <label className="flex flex-col gap-1.5 text-xs">
          <span className="libelle-champ">Point de vue</span>
          <select name="pdv" defaultValue={filtre.pointDeVueId} className={CHAMP}>
            <option value="">Tous</option>
            {donnees.pointsDeVue.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs">
          <span className="libelle-champ">Lot</span>
          <select name="lot" defaultValue={filtre.lotId} className={CHAMP}>
            <option value="">Tous</option>
            {donnees.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {l.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs">
          <span className="libelle-champ">Du</span>
          <input type="date" name="du" defaultValue={filtre.du} className={CHAMP} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs">
          <span className="libelle-champ">Au</span>
          <input type="date" name="au" defaultValue={filtre.au} className={CHAMP} />
        </label>
        <button
          type="submit"
          className="relief bg-primary text-primary-foreground h-10 rounded-xl px-4 text-sm font-bold hover:brightness-110"
        >
          Filtrer
        </button>
        {(filtre.pointDeVueId || filtre.lotId || filtre.du || filtre.au) && (
          <Link
            href={`/projet/${id}/photos?vue=${vue}`}
            className="text-muted-foreground h-10 text-sm leading-10 font-semibold underline"
          >
            Effacer les filtres
          </Link>
        )}
      </form>

      <Timeline photos={photos} pointsDeVue={donnees.pointsDeVue} vue={vue} />
    </div>
  )
}
