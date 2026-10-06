import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { FileAttente } from '@/components/saisie/file-attente'
import { PastilleStatut } from '@/components/saisie/statut-releve'
import { Button } from '@/components/ui/button'
import { db } from '@/db/index'
import {
  chargerJournal,
  chargerReferentielSaisie,
  journeesDeReleve,
  type FiltresJournal,
} from '@/db/queries/saisie'
import { serieDeReleves } from '@/db/compute/serie'
import { statutReleve, type StatutReleve } from '@/db/schema'
import { STATUT_RELEVE } from '@/lib/etats'
import { aujourdhui, dateLongue } from '@/lib/format'
import { exigerPage, habilite, PEUT_CONSULTER_JOURNAL, PEUT_SAISIR } from '@/lib/garde'
import { Icone } from '@/lib/icones'
import { DateSimple } from '@/lib/releve'
import { cn } from '@/lib/utils'
import { teinteSerie } from '@/lib/viz'

export const metadata: Metadata = { title: 'Journal de chantier' }

type Recherche = Promise<Record<string, string | string[] | undefined>>

/** Un filtre mal forme est ignore, pas transmis a la requete. */
function lireFiltres(brut: Record<string, string | string[] | undefined>): FiltresJournal {
  const un = (cle: string) => {
    const v = brut[cle]
    return typeof v === 'string' && v !== '' ? v : undefined
  }
  const date = (cle: string) => {
    const v = un(cle)
    return v && DateSimple.safeParse(v).success ? v : undefined
  }
  const statut = un('statut')
  const lot = un('lot')
  return {
    lotId: lot && /^[0-9a-f-]{36}$/i.test(lot) ? lot : undefined,
    du: date('du'),
    au: date('au'),
    statut: statutReleve.enumValues.includes(statut as StatutReleve)
      ? (statut as StatutReleve)
      : undefined,
  }
}

export default async function JournalDeChantier({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Recherche
}) {
  const { id } = await params
  const utilisateur = await exigerPage(id, PEUT_CONSULTER_JOURNAL)
  const filtres = lireFiltres(await searchParams)

  const base = db()
  const [journal, referentiel] = await Promise.all([
    chargerJournal(base, id, filtres),
    chargerReferentielSaisie(base, id),
  ])
  const { entrees, tronque, enAttente } = journal
  const peutSaisir = habilite(utilisateur.role, PEUT_SAISIR)
  const serie = peutSaisir
    ? serieDeReleves(await journeesDeReleve(base, id, utilisateur.id), aujourdhui())
    : 0
  const filtre = Object.values(filtres).some((v) => v !== undefined)

  /*
   * Une page tronquee s'arrete sur une journee COMPLETE : la derniere
   * journee, peut-etre coupee, est laissee a la page suivante, qui commence
   * par elle.
   */
  const derniereDate = entrees[entrees.length - 1]?.date
  const affichees =
    tronque && entrees.some((e) => e.date !== derniereDate)
      ? entrees.filter((e) => e.date !== derniereDate)
      : entrees
  const suite = new URLSearchParams()
  for (const [cle, valeur] of [
    ['lot', filtres.lotId],
    ['du', filtres.du],
    ['statut', filtres.statut],
    ['au', derniereDate],
  ] as const) {
    if (valeur) suite.set(cle, valeur)
  }

  /* Regroupement par journee, la plus recente d'abord. */
  const parDate = new Map<string, typeof entrees>()
  for (const e of affichees) {
    const liste = parDate.get(e.date) ?? []
    liste.push(e)
    parDate.set(e.date, liste)
  }

  const champ =
    'border-input bg-background h-10 rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[
          { libelle: referentiel.projet.code, href: `/projet/${id}` },
          { libelle: 'Journal de chantier' },
        ]}
      />

      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Journal de chantier</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {enAttente > 0 ? (
              <Link
                href={`/projet/${id}/releve?statut=SOUMIS`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {enAttente} relevé{enAttente > 1 ? 's' : ''} en attente de validation
              </Link>
            ) : (
              'Aucun relevé en attente de validation.'
            )}
          </p>
        </div>
        {peutSaisir && (
          <div className="flex flex-wrap items-center gap-3">
            {serie > 0 && (
              <p
                className="bg-soleil text-soleil-encre flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"
                title="Journées ouvrables consécutives couvertes par vos relevés"
              >
                <Icone.calendrier className="size-4" strokeWidth={2.5} aria-hidden />
                Série de {serie} {serie > 1 ? 'jours' : 'jour'}
              </p>
            )}
            <Button asChild className="h-11">
              <Link href={`/projet/${id}/releve/nouveau`}>
                <Icone.ajouter className="size-4" />
                Nouveau relevé
              </Link>
            </Button>
          </div>
        )}
      </header>

      {peutSaisir && <FileAttente projetId={id} utilisateurId={utilisateur.id} />}

      <form method="get" className="mt-5 flex flex-wrap items-end gap-2" aria-label="Filtres">
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Lot</span>
          <select name="lot" defaultValue={filtres.lotId ?? ''} className={champ}>
            <option value="">Tous les lots</option>
            {referentiel.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Du</span>
          <input type="date" name="du" defaultValue={filtres.du ?? ''} className={champ} />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Au</span>
          <input type="date" name="au" defaultValue={filtres.au ?? ''} className={champ} />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">Statut</span>
          <select name="statut" defaultValue={filtres.statut ?? ''} className={champ}>
            <option value="">Tous</option>
            {statutReleve.enumValues.map((s) => (
              <option key={s} value={s}>
                {STATUT_RELEVE[s].libelle}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" className="h-10">
          <Icone.rechercher className="size-4" />
          Filtrer
        </Button>
        {filtre && (
          <Button asChild variant="ghost" className="h-10">
            <Link href={`/projet/${id}/releve`}>Effacer</Link>
          </Button>
        )}
      </form>

      {entrees.length === 0 ? (
        <div className="text-muted-foreground mt-8 rounded-xl border border-dashed p-8 text-center text-sm">
          {filtre
            ? 'Aucun relevé ne correspond à ces filtres.'
            : 'Aucun relevé saisi pour le moment.'}
        </div>
      ) : (
        <ol className="mt-6 space-y-6">
          {[...parDate].map(([date, liste]) => (
            <li key={date}>
              <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                <time dateTime={date}>{dateLongue(date)}</time>
              </h2>
              <ul className="divide-border/70 divide-y rounded-xl border">
                {liste.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/projet/${id}/releve/${e.id}`}
                      className={cn(
                        'hover:bg-accent/50 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-3 transition-colors sm:flex-nowrap',
                        e.statut === 'RECTIFIE' && 'opacity-60',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span
                          aria-hidden
                          className="h-4 w-1 shrink-0 rounded-full"
                          style={{ background: teinteSerie(e.rangCouleur) }}
                        />
                        <span className="text-muted-foreground font-mono text-xs">{e.lotCode}</span>
                        <span className="truncate text-sm">{e.lotNom}</span>
                      </span>
                      <span className="text-muted-foreground chiffres-alignes text-xs whitespace-nowrap">
                        {e.journeeTravaillee
                          ? `${e.effectifOuvriers} ouvriers · ${e.nombreLignes} ligne${e.nombreLignes > 1 ? 's' : ''}`
                          : `Arrêt : ${e.motifArret ?? ''}`}
                      </span>
                      {e.aAlea && (
                        <span className="[&>svg]:text-etat-retard flex items-center gap-1 text-xs">
                          <Icone.alerte className="size-3.5" aria-hidden />
                          Aléa
                        </span>
                      )}
                      <PastilleStatut statut={e.statut} />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {tronque && derniereDate !== undefined && (
        <p className="mt-4 text-sm">
          <Link
            href={`/projet/${id}/releve?${suite.toString()}`}
            className="text-foreground font-medium underline underline-offset-4"
          >
            Relevés antérieurs, à partir du {dateLongue(derniereDate)}
          </Link>
        </p>
      )}
    </div>
  )
}
