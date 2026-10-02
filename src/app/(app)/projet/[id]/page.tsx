import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { CourbeS } from '@/components/graphiques/courbe-s'
import { BarreAvancement } from '@/components/indicateurs/barre-avancement'
import { Tuile, type Sens, type Ton } from '@/components/indicateurs/tuile'
import { PanneauAlertes } from '@/components/tableau/panneau-alertes'
import { ProchainsJalons } from '@/components/tableau/prochains-jalons'
import { db } from '@/db/index'
import { enCacheProjet } from '@/lib/cache'
import { chargerSynthese } from '@/db/queries/lecture'
import { chargerTableau } from '@/db/queries/tableau'
import { exigerPage, voitDonneesInternes } from '@/lib/garde'
import {
  dateLongue,
  ecartJours,
  fcfa,
  fcfaCompact,
  fcfaSigne,
  indice,
  jours,
  pourcent,
} from '@/lib/format'
import { Icone } from '@/lib/icones'
import { construireTableau } from '@/lib/tableau-donnees'

export const metadata: Metadata = { title: 'Tableau de bord' }

/** Un indice de performance sous 0,98 appelle l'attention, sous 0,90 l'action. */
function tonIndice(valeur: number | null): Ton {
  if (valeur === null) return 'neutre'
  if (valeur >= 0.98) return 'bon'
  if (valeur >= 0.9) return 'alerte'
  return 'critique'
}

function sens(variation: number | null, seuil: number): Sens {
  if (variation === null || Math.abs(variation) < seuil) return 'stable'
  return variation > 0 ? 'hausse' : 'baisse'
}

/** Variation sur trente jours, ecrite en clair. */
function enTrenteJours(texte: string | null): string {
  return texte === null ? 'moins de trente jours d’historique' : `${texte} en 30 jours`
}

function tonEcart(ecart: number): Ton {
  if (ecart < -0.05) return 'critique'
  if (ecart < -0.01) return 'alerte'
  return 'bon'
}

export default async function VueProjet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const interne = voitDonneesInternes(utilisateur.role)

  const base = db()
  const [synthese, donnees] = await Promise.all([
    enCacheProjet('synthese', id, interne, () => chargerSynthese(base, id, interne)),
    enCacheProjet('tableau', id, interne, () => chargerTableau(base, id, interne)),
  ])

  const { projet, global, lots, dateAnalyse } = synthese
  const tableau = construireTableau(donnees)
  const ind = tableau?.indicateurs
  const ecart = ind ? ind.avancement - ind.avancementPrevu : 0
  const retardJ = ind?.ecartDelaiJ ?? 0
  const glissementFin =
    global?.dateFinProjetee !== undefined && global.dateFinProjetee !== null
      ? ecartJours(projet.dateFinContractuelle, global.dateFinProjetee)
      : null
  const t = tableau?.tendances

  const blocLots = (
    <section aria-label="Avancement par lot">
      <div className="surface overflow-hidden">
        <div className="border-border/70 flex items-baseline justify-between gap-4 border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Icone.lot className="text-muted-foreground size-4" strokeWidth={1.75} aria-hidden />
            Avancement par lot
          </h2>
          <p className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="bg-encre-discrete/30 h-2 w-4 rounded-full" />
              prévu
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="bg-encre-secondaire h-2 w-4 rounded-full" />
              réalisé
            </span>
            <span>écart à droite</span>
          </p>
        </div>

        <ul className="divide-border/60 divide-y">
          {lots.map((lot) => (
            <li key={lot.id} className="hover:bg-accent/35 px-5 py-3 transition-colors">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <Link
                  href={`/projet/${projet.id}/lot/${lot.id}`}
                  className="focus-visible:ring-ring/70 -mx-1 rounded px-1 text-sm font-medium hover:underline"
                >
                  <span className="text-muted-foreground mr-2 font-mono text-xs">{lot.code}</span>
                  {lot.nom}
                </Link>
                <span className="text-muted-foreground chiffres-alignes text-xs">
                  {fcfaCompact(lot.budgetXof)}
                  <span className="mx-1.5 opacity-40">·</span>
                  {lot.nombreTaches} tâches
                  {lot.tachesCritiques > 0 && (
                    <>
                      <span className="mx-1.5 opacity-40">·</span>
                      <span className="text-foreground [&>svg]:text-etat-critique inline-flex items-center gap-1 font-medium">
                        <Icone.nonConformite className="size-3" strokeWidth={2} aria-hidden />
                        {lot.tachesCritiques} critiques
                      </span>
                    </>
                  )}
                </span>
              </div>
              <BarreAvancement
                realise={lot.avancement}
                prevu={lot.avancementPrevu}
                rangCouleur={lot.rangCouleur}
                intitule={lot.nom}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )

  return (
    <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-6 lg:px-8">
      <FilAriane maillons={[{ libelle: projet.code }, { libelle: 'Tableau de bord' }]} />

      <header className="mt-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] font-semibold">{projet.nom}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {projet.lieu}
            <span className="mx-2 opacity-40">·</span>
            {projet.maitreOuvrage}
          </p>
        </div>
        {dateAnalyse !== null && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Icone.calendrier className="size-3.5" strokeWidth={1.75} />
            Situation arrêtée au {dateLongue(dateAnalyse)}
          </p>
        )}
      </header>

      {global === null || tableau === null || ind === undefined || t === undefined ? (
        <div className="surface mt-6 px-6 py-14 text-center">
          <Icone.tableauBord
            className="text-muted-foreground/60 mx-auto size-8"
            strokeWidth={1.5}
          />
          <p className="mt-3 font-medium">Aucun indicateur disponible</p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm">
            Le cache n&apos;a pas encore été calculé pour ce chantier. Lancer{' '}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              npm run db:recalcul
            </code>
            .
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Indicateurs de synthèse" className="mt-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tuile
                intitule="Avancement"
                valeur={pourcent(ind.avancement)}
                precision={`${pourcent(ind.avancementPrevu)} prévus à cette date, soit ${
                  ecart >= 0 ? '+' : ''
                }${pourcent(ecart)}`}
                icone="tableauBord"
                ton={tonEcart(ecart)}
                tendance={{
                  serie: t.avancement.serie,
                  sens: sens(t.avancement.variation, 0.0005),
                  libelle: enTrenteJours(
                    t.avancement.variation === null
                      ? null
                      : `${t.avancement.variation >= 0 ? '+' : ''}${(t.avancement.variation * 100)
                          .toFixed(1)
                          .replace('.', ',')} pts`,
                  ),
                }}
              />
              <Tuile
                intitule="Écart de délai"
                valeur={jours(-Math.round(retardJ))}
                precision="lecture horizontale de la courbe en S"
                icone="planning"
                ton={retardJ > 20 ? 'critique' : retardJ > 5 ? 'alerte' : 'bon'}
                tendance={{
                  serie: t.ecartDelaiJ.serie.map((v) => (v === null ? null : -v)),
                  sens: sens(
                    t.ecartDelaiJ.variation === null ? null : -t.ecartDelaiJ.variation,
                    0.5,
                  ),
                  libelle: enTrenteJours(
                    t.ecartDelaiJ.variation === null
                      ? null
                      : `${jours(-Math.round(t.ecartDelaiJ.variation))}`,
                  ),
                }}
              />
              <Tuile
                intitule="SPI — délai"
                valeur={ind.spi === null ? '—' : indice(ind.spi)}
                precision="valeur acquise sur valeur planifiée"
                icone="hausse"
                ton={tonIndice(ind.spi)}
                tendance={{
                  serie: t.spi.serie,
                  sens: sens(t.spi.variation, 0.0005),
                  libelle: enTrenteJours(
                    t.spi.variation === null
                      ? null
                      : `${t.spi.variation >= 0 ? '+' : ''}${indice(t.spi.variation)}`,
                  ),
                }}
              />
              {interne ? (
                <Tuile
                  intitule="CPI — coût"
                  valeur={ind.cpi === null ? '—' : indice(ind.cpi)}
                  precision="valeur acquise au coût budgété sur coût réel"
                  icone="cout"
                  ton={tonIndice(ind.cpi)}
                  tendance={{
                    serie: t.cpi.serie,
                    sens: sens(t.cpi.variation, 0.0005),
                    libelle: enTrenteJours(
                      t.cpi.variation === null
                        ? null
                        : `${t.cpi.variation >= 0 ? '+' : ''}${indice(t.cpi.variation)}`,
                    ),
                  }}
                />
              ) : (
                <Tuile
                  intitule="Fin projetée"
                  valeur={
                    global.dateFinProjetee === null
                      ? '—'
                      : dateLongue(global.dateFinProjetee).replace(/ \d{4}$/, '')
                  }
                  precision={
                    glissementFin === null
                      ? `contractuelle : ${dateLongue(projet.dateFinContractuelle)}`
                      : `${jours(glissementFin)} sur la date contractuelle`
                  }
                  icone="calendrier"
                  ton={glissementFin !== null && glissementFin > 0 ? 'alerte' : 'bon'}
                />
              )}
            </div>
          </section>

          <section aria-label="Situation budgétaire" className="mt-4">
            <dl className="surface divide-border/70 grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              {(interne && ind.eac !== null
                ? [
                    { cle: 'Montant du marché', valeur: fcfa(projet.montantMarcheXof) },
                    { cle: 'Valeur acquise', valeur: fcfa(ind.va) },
                    { cle: 'Coût réel reconstitué', valeur: fcfa(ind.cr) },
                    {
                      cle: 'Coût estimé final',
                      valeur: fcfa(ind.eac),
                      note:
                        ind.vac === null
                          ? undefined
                          : `${fcfaSigne(ind.vac)} sur le budget au coût de ${fcfaCompact(ind.bacCout)}`,
                    },
                  ]
                : [
                    { cle: 'Montant du marché', valeur: fcfa(projet.montantMarcheXof) },
                    { cle: 'Valeur planifiée', valeur: fcfa(ind.vp) },
                    { cle: 'Valeur acquise', valeur: fcfa(ind.va) },
                    {
                      cle: 'Reste à réaliser',
                      valeur: fcfa(projet.montantMarcheXof - ind.va),
                      note: undefined,
                    },
                  ]
              ).map((c) => (
                <div key={c.cle} className="px-5 py-3.5">
                  <dt className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
                    {c.cle}
                  </dt>
                  <dd className="chiffres-alignes mt-1 text-[0.9375rem] font-semibold">
                    {c.valeur}
                  </dd>
                  {'note' in c && c.note !== undefined && (
                    <dd className="text-muted-foreground chiffres-alignes mt-0.5 text-xs">
                      {c.note}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground mt-2 px-1 text-xs leading-relaxed">
              Au rythme constaté, la durée projetée est de {ind.dureeProjeteeJ ?? '—'} jours pour{' '}
              {projet.dureeContractuelleJ} contractuels
              {ind.retardJ !== null && ind.retardJ > 0
                ? `, soit ${ind.retardJ} jours de retard et une pénalité prévue de ${fcfa(
                    ind.penaliteXof,
                  )}.`
                : ', sans pénalité prévue.'}
              {interne &&
                ' Le coût réel est reconstitué à partir des heures relevées, des quantités mises en œuvre et du coût des aléas ; il ne remplace pas la comptabilité analytique de l’entreprise. Le CPI et le coût estimé final le comparent au coût budgété du travail, établi d’après les équipes prévues au planning, et non au prix de vente, qui inclut la marge.'}
            </p>
          </section>

          <section aria-label="Courbe en S" className="mt-4">
            <div className="surface px-5 py-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="flex items-center gap-2 text-sm font-medium">
                  <Icone.analyses
                    className="text-muted-foreground size-4"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  Courbe en S
                </h2>
                <p className="text-muted-foreground text-xs">
                  Valeurs cumulées depuis l&apos;ordre de service, en FCFA
                </p>
              </div>
              <CourbeS
                points={donnees.courbe}
                projection={tableau.projection}
                bac={donnees.cadre.bacXof}
                ecartDelaiJ={retardJ}
                interne={interne}
              />
            </div>
          </section>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {blocLots}
            <div className="grid gap-4">
              <PanneauAlertes projetId={projet.id} alertes={tableau.alertes} />
              <ProchainsJalons jalons={tableau.jalons} />
            </div>
          </div>
        </>
      )}

      {(global === null || tableau === null) && <div className="mt-4">{blocLots}</div>}

      <section aria-label="Données du marché" className="mt-4 mb-2">
        <div className="surface px-5 py-4">
          <h2 className="mb-3 text-sm font-medium">Le marché</h2>
          <dl className="grid gap-x-10 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Code', projet.code],
              ['Entreprise', projet.entreprise],
              ['Maîtrise d’œuvre', projet.maitreOeuvre],
              ['Ordre de service', dateLongue(projet.dateOrdreService)],
              ['Fin contractuelle', dateLongue(projet.dateFinContractuelle)],
              ['Durée contractuelle', `${projet.dureeContractuelleJ} jours calendaires`],
              [
                'Pénalité de retard',
                `${pourcent(projet.tauxPenaliteJournaliere, 2)} du marché par jour`,
              ],
            ].map(([cle, valeur]) => (
              <div key={cle} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">{cle}</dt>
                <dd className="truncate text-right font-medium">{valeur}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  )
}
