import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { ActionsReleve } from '@/components/saisie/actions-releve'
import { PastilleStatut } from '@/components/saisie/statut-releve'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/db/index'
import { chargerReleve, journeesDeReleve } from '@/db/queries/saisie'
import { palierAtteint, serieDeReleves } from '@/db/compute/serie'
import { Felicitations } from '@/components/saisie/felicitations'
import { prenom } from '@/lib/accueil'
import { actionsSurReleve, exigerPage, PEUT_CONSULTER_JOURNAL } from '@/lib/garde'
import { aujourdhui, dateLongue, fcfa, instant, libelleMeteo, quantite } from '@/lib/format'
import { Icone } from '@/lib/icones'
import { LIBELLE_GRAVITE, LIBELLE_TYPE_ALEA } from '@/lib/releve'
import { teinteSerie } from '@/lib/viz'
import { urlAffichage } from '@/services/stockage'

export const metadata: Metadata = { title: 'Relevé journalier' }

export default async function FicheReleve({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; releveId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id, releveId } = await params
  const envoye = (await searchParams)['envoye'] === '1'
  const utilisateur = await exigerPage(id, PEUT_CONSULTER_JOURNAL)

  const r = /^[0-9a-f-]{36}$/i.test(releveId) ? await chargerReleve(db(), releveId) : null
  // Un releve d'un autre projet est introuvable ici, quel que soit le droit
  // de l'utilisateur sur cet autre projet.
  if (!r || r.projetId !== id) notFound()

  const actions = actionsSurReleve(r.statut, utilisateur.role)
  // Les felicitations ne concernent que l'auteur, juste apres son envoi.
  const fete = envoye && r.auteurId === utilisateur.id
  const serie = fete
    ? serieDeReleves(await journeesDeReleve(db(), id, utilisateur.id), aujourdhui())
    : 0
  const photos = await Promise.all(
    r.photos.map(async (p) => ({
      ...p,
      url: await urlAffichage(p.chemin),
      vignette: await urlAffichage(p.cheminVignette),
    })),
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[
          { libelle: 'Journal', href: `/projet/${id}/releve` },
          { libelle: `${r.lot.code} — ${dateLongue(r.date)}` },
        ]}
      />

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1 h-7 w-2 shrink-0 rounded-full"
            style={{ background: teinteSerie(r.lot.rangCouleur) }}
          />
          <div>
            <h1 className="text-[1.625rem] leading-tight font-extrabold tracking-tight">
              {dateLongue(r.date)}
            </h1>
            <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
              Lot {r.lot.code} — {r.lot.nom}
            </p>
          </div>
        </div>
        <PastilleStatut statut={r.statut} />
      </header>

      {fete && (
        <Felicitations
          prenom={prenom(utilisateur.nom)}
          serie={serie}
          palier={palierAtteint(serie)}
          journal={`/projet/${id}/releve`}
          nouveau={`/projet/${id}/releve/nouveau`}
        />
      )}

      {r.remplacePar && (
        <p className="border-border bg-muted/40 mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Icone.rectifie className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Ce relevé a été rectifié. Il est conservé comme trace et n’est plus compté.{' '}
            <Link
              href={`/projet/${id}/releve/${r.remplacePar.id}`}
              className="underline underline-offset-4"
            >
              Voir le relevé rectificatif
            </Link>
          </span>
        </p>
      )}
      {r.remplace && (
        <p className="border-border bg-muted/40 mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Icone.rectifie className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Relevé rectificatif.{' '}
            <Link
              href={`/projet/${id}/releve/${r.remplace.id}`}
              className="underline underline-offset-4"
            >
              Voir le relevé d’origine
            </Link>
          </span>
        </p>
      )}

      <div className="mt-4">
        <ActionsReleve projetId={id} releveId={r.id} actions={actions} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Icone.meteo className="size-4" aria-hidden />
              Météo
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{libelleMeteo(r.meteoCode)}</p>
            {r.precipitationsMm !== null && (
              <p className="text-muted-foreground chiffres-alignes mt-1">
                {r.precipitationsMm.toLocaleString('fr-FR')} mm de pluie
                {r.temperatureC !== null && `, ${r.temperatureC.toLocaleString('fr-FR')} °C`}
                {r.rafalesKmh !== null && `, rafales ${r.rafalesKmh.toLocaleString('fr-FR')} km/h`}
              </p>
            )}
            {r.meteoCorrigee && (
              <p className="text-muted-foreground mt-1 text-xs">Corrigée sur le terrain.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Icone.effectif className="size-4" aria-hidden />
              Activité
            </CardTitle>
          </CardHeader>
          <CardContent className="chiffres-alignes text-sm">
            {r.journeeTravaillee ? (
              <p>
                {r.effectifOuvriers} ouvriers, {r.effectifEncadrement} encadrants,{' '}
                {r.heuresTravaillees.toLocaleString('fr-FR')} heures
              </p>
            ) : (
              <p className="flex items-center gap-1.5">
                <Icone.chome className="size-4" aria-hidden />
                Journée non travaillée : {r.motifArret}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Icone.quantitatif className="size-4" aria-hidden />
            Quantités réalisées
          </CardTitle>
        </CardHeader>
        <CardContent>
          {r.quantites.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune quantité relevée.</p>
          ) : (
            <ul className="divide-border/70 divide-y text-sm">
              {r.quantites.map((q) => (
                <li
                  key={q.ligneId}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <span className="min-w-0">
                    <span className="text-muted-foreground mr-2 font-mono text-xs">
                      {q.codeWbs}
                    </span>
                    {q.designation}
                    {q.commentaire && (
                      <span className="text-muted-foreground block text-xs">{q.commentaire}</span>
                    )}
                  </span>
                  <span className="chiffres-alignes font-medium">
                    {quantite(q.quantite, q.unite)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {photos.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Icone.photos className="size-4" aria-hidden />
              Photos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noreferrer" className="block">
                    {/* URL signee a duree de vie courte : l'optimiseur d'images
                        de Next la mettrait en cache au-dela de sa validite. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.vignette}
                      alt={p.legende ?? 'Photo du relevé'}
                      loading="lazy"
                      className="aspect-[4/3] w-full rounded-lg object-cover"
                    />
                  </a>
                  {p.legende && <p className="text-muted-foreground mt-1 text-xs">{p.legende}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {r.observations && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Observations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-line">{r.observations}</p>
          </CardContent>
        </Card>
      )}

      {r.alea && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="[&>svg]:text-etat-retard flex items-center gap-2 text-sm font-medium">
              <Icone.alerte className="size-4" aria-hidden />
              Aléa déclaré : {LIBELLE_TYPE_ALEA[r.alea.type]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{r.alea.description}</p>
            <p className="text-muted-foreground chiffres-alignes">
              Gravité {r.alea.gravite} ({LIBELLE_GRAVITE[r.alea.gravite]}), délai{' '}
              {r.alea.impactDelaiJ} j, coût estimé {fcfa(r.alea.impactCoutXof)}
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-muted-foreground mt-6 text-xs">
        Saisi par {r.auteur ?? 'compte supprimé'} le {instant(r.creeLe)}
        {r.validePar && r.valideLe && ` · validé par ${r.validePar} le ${instant(r.valideLe)}`}
      </p>
    </div>
  )
}
