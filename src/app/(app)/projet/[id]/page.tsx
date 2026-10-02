import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { CourbeS } from '@/components/graphiques/courbe-s'
import { BarreAvancement } from '@/components/indicateurs/barre-avancement'
import { Tuile, type Ton } from '@/components/indicateurs/tuile'
import { db } from '@/db/index'
import { chargerCourbeS, chargerSynthese } from '@/db/queries/lecture'
import { ecartDelaiJours } from '@/db/compute/evm'
import { exigerPage, voitDonneesInternes } from '@/lib/garde'
import { dateLongue, ecartJours, fcfa, fcfaCompact, indice, jours, pourcent } from '@/lib/format'
import { Icone } from '@/lib/icones'

export const metadata: Metadata = { title: 'Tableau de bord' }

/** Un indice de performance sous 0,98 appelle l'attention, sous 0,90 l'action. */
function tonIndice(valeur: number | null): Ton {
  if (valeur === null) return 'neutre'
  if (valeur >= 0.98) return 'bon'
  if (valeur >= 0.9) return 'alerte'
  return 'critique'
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
  const [synthese, courbe] = await Promise.all([
    chargerSynthese(base, id, interne),
    chargerCourbeS(base, id, interne),
  ])

  const { projet, global, lots, dateAnalyse } = synthese
  const ecart = global ? global.avancement - global.avancementPrevu : 0
  const retardJ = global
    ? ecartDelaiJours(
        courbe.map((p) => p.vp),
        global.valeurAcquiseXof,
        courbe.length - 1,
      )
    : 0
  const glissementFin =
    global?.dateFinProjetee !== undefined && global.dateFinProjetee !== null
      ? ecartJours(projet.dateFinContractuelle, global.dateFinProjetee)
      : null

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
            Situation arretee au {dateLongue(dateAnalyse)}
          </p>
        )}
      </header>

      {global === null ? (
        <div className="surface mt-6 px-6 py-14 text-center">
          <Icone.tableauBord
            className="text-muted-foreground/60 mx-auto size-8"
            strokeWidth={1.5}
          />
          <p className="mt-3 font-medium">Aucun indicateur disponible</p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm">
            Le cache n&apos;a pas encore ete calcule pour ce chantier. Lancer{' '}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              npm run db:recalcul
            </code>
            .
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Indicateurs de synthese" className="mt-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tuile
                intitule="Avancement"
                valeur={pourcent(global.avancement)}
                precision={`${pourcent(global.avancementPrevu)} prevus a cette date, soit ${
                  ecart >= 0 ? '+' : ''
                }${pourcent(ecart)}`}
                icone="tableauBord"
                ton={tonEcart(ecart)}
              />
              <Tuile
                intitule="Ecart de delai"
                valeur={jours(-Math.round(retardJ))}
                precision="lecture horizontale de la courbe en S"
                icone="planning"
                ton={retardJ > 20 ? 'critique' : retardJ > 5 ? 'alerte' : 'bon'}
              />
              <Tuile
                intitule="SPI — delai"
                valeur={global.spi === null ? '—' : indice(global.spi)}
                precision="valeur acquise sur valeur planifiee"
                icone="hausse"
                ton={tonIndice(global.spi)}
              />
              {interne ? (
                <Tuile
                  intitule="CPI — cout"
                  valeur={global.cpi === null ? '—' : indice(global.cpi)}
                  precision="valeur acquise au coût budgété sur coût réel"
                  icone="cout"
                  ton={tonIndice(global.cpi)}
                />
              ) : (
                <Tuile
                  intitule="Fin projetee"
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
                  Valeurs cumulees depuis l&apos;ordre de service, en FCFA
                </p>
              </div>
              <CourbeS
                points={courbe}
                bac={projet.montantMarcheXof}
                ecartDelaiJ={retardJ}
                interne={interne}
              />
            </div>
          </section>

          <section aria-label="Situation budgetaire" className="mt-4">
            <div className="surface divide-border/70 grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              {[
                { cle: 'Montant du marche', valeur: fcfa(projet.montantMarcheXof) },
                { cle: 'Valeur planifiee', valeur: fcfa(global.valeurPlanifieeXof) },
                { cle: 'Valeur acquise', valeur: fcfa(global.valeurAcquiseXof) },
                ...(interne && global.coutReelXof !== null
                  ? [{ cle: 'Cout reel reconstitue', valeur: fcfa(global.coutReelXof) }]
                  : [
                      {
                        cle: 'Reste a realiser',
                        valeur: fcfa(projet.montantMarcheXof - global.valeurAcquiseXof),
                      },
                    ]),
              ].map((c) => (
                <div key={c.cle} className="px-5 py-3.5">
                  <dt className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">
                    {c.cle}
                  </dt>
                  <dd className="chiffres-alignes mt-1 text-[0.9375rem] font-semibold">
                    {c.valeur}
                  </dd>
                </div>
              ))}
            </div>
            {interne && (
              <p className="text-muted-foreground/80 mt-2 px-1 text-xs leading-relaxed">
                Le coût réel est reconstitué à partir des heures relevées, des quantités mises en
                œuvre et du coût des aléas ; il ne remplace pas la comptabilité analytique de
                l’entreprise. Le CPI le compare au coût budgété du travail réalisé, établi d’après
                les équipes prévues au planning, et non au prix de vente, qui inclut la marge.
              </p>
            )}
          </section>
        </>
      )}

      <section aria-label="Avancement par lot" className="mt-4">
        <div className="surface overflow-hidden">
          <div className="border-border/70 flex items-baseline justify-between gap-4 border-b px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Icone.lot className="text-muted-foreground size-4" strokeWidth={1.75} aria-hidden />
              Avancement par lot
            </h2>
            <p className="text-muted-foreground text-xs">
              Le repere vertical marque l&apos;avancement prevu
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
                    {lot.nombreTaches} taches
                    {lot.tachesCritiques > 0 && (
                      <>
                        <span className="mx-1.5 opacity-40">·</span>
                        <span className="text-etat-critique font-medium">
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

      <section aria-label="Donnees du marche" className="mt-4 mb-2">
        <div className="surface px-5 py-4">
          <h2 className="mb-3 text-sm font-medium">Le marche</h2>
          <dl className="grid gap-x-10 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Code', projet.code],
              ['Entreprise', projet.entreprise],
              ['Maitrise d oeuvre', projet.maitreOeuvre],
              ['Ordre de service', dateLongue(projet.dateOrdreService)],
              ['Fin contractuelle', dateLongue(projet.dateFinContractuelle)],
              ['Duree contractuelle', `${projet.dureeContractuelleJ} jours calendaires`],
              [
                'Penalite de retard',
                `${pourcent(projet.tauxPenaliteJournaliere, 2)} du marche par jour`,
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
