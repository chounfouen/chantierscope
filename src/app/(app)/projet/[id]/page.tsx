import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { CourbeS } from '@/components/graphiques/courbe-s'
import { BarreAvancement } from '@/components/indicateurs/barre-avancement'
import { Tuile, type Sens, type Ton } from '@/components/indicateurs/tuile'
import { Accueil, type Repere } from '@/components/tableau/accueil'
import { PanneauAlertes } from '@/components/tableau/panneau-alertes'
import { ProchainsJalons } from '@/components/tableau/prochains-jalons'
import { db } from '@/db/index'
import { enCacheProjet } from '@/lib/cache'
import { chargerSynthese } from '@/db/queries/lecture'
import { chargerTableau } from '@/db/queries/tableau'
import { exigerPage, voitDonneesInternes } from '@/lib/garde'
import {
  aujourdhui,
  dateCourte,
  dateLongue,
  fcfa,
  fcfaCompact,
  fcfaSigne,
  indice,
  jours,
  pourcent,
} from '@/lib/format'
import { Icone } from '@/lib/icones'
import { teinteSerie } from '@/lib/viz'
import { prenom, salutation, sousTitreSituation, titreSituation } from '@/lib/accueil'
import { construireTableau } from '@/lib/tableau-donnees'
import type { Achevement } from '@/db/compute/tableau'

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

/**
 * La fin projetee en une phrase : la date du planning recale, la penalite qui
 * en decoule, et la fourchette des deux hypotheses de rythme.
 */
function texteAchevement(fin: Achevement, finContractuelle: string): string {
  const { rythmePrevuJ, rythmeConstateJ } = fin.fourchette
  const signe = (j: number) => (j > 0 ? `+${j} j` : j < 0 ? `${j} j` : 'à l’heure')
  const debut =
    fin.retardProjeteJ > 0
      ? `Le planning recalé à la date d’état finit le ${dateLongue(fin.dateFinProjetee)}, ${
          fin.retardProjeteJ
        } jours après la fin contractuelle du ${dateLongue(finContractuelle)}, soit une pénalité prévue de ${fcfa(
          fin.penaliteXof,
        )}${fin.plafondAtteint ? `, plafonnée (${fcfa(fin.penaliteBruteXof)} sans plafond)` : ''}.`
      : `Le planning recalé à la date d’état finit le ${dateLongue(
          fin.dateFinProjetee,
        )}, dans le délai contractuel : aucune pénalité prévue.`
  const fourchette =
    rythmeConstateJ === null
      ? ''
      : ` Pour comparaison, selon le rythme du reste des travaux : ${signe(
          rythmePrevuJ,
        )} au rythme prévu, ${signe(rythmeConstateJ)} au rythme constaté.`
  return debut + fourchette
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
  const tableau = construireTableau(donnees, aujourdhui())
  const ind = tableau?.indicateurs
  const fin = tableau?.achevement
  const ecart = ind ? ind.avancement - ind.avancementPrevu : 0
  /** Retard constate sur la courbe en S, positif pour un retard. */
  const retardJ = ind?.ecartDelaiJ ?? 0
  const retardArrondi = Math.round(retardJ)
  const t = tableau?.tendances

  const prochainJalon = tableau?.jalons[0]
  const alertesCritiques = tableau?.alertes.filter((a) => a.niveau === 'critique').length ?? 0
  const situation = {
    ecartDelaiJ: retardJ,
    jalonsMenaces: tableau?.jalons.filter((j) => j.menace).length ?? 0,
    alertesCritiques,
    avancement: ind?.avancement ?? 0,
  }
  const reperes: Repere[] = [
    ...(fin
      ? [
          {
            icone: 'calendrier' as const,
            libelle: 'Fin projetée',
            valeur: dateCourte(fin.dateFinProjetee),
          },
        ]
      : []),
    ...(prochainJalon
      ? [
          {
            icone: 'jalon' as const,
            libelle: prochainJalon.nom,
            valeur: `dans ${prochainJalon.joursRestants} j`,
          },
        ]
      : []),
    ...(fin && fin.penaliteXof > 0
      ? [
          {
            icone: 'cout' as const,
            libelle: fin.plafondAtteint ? 'Pénalité prévue, plafonnée' : 'Pénalité prévue',
            valeur: fcfaCompact(fin.penaliteXof),
          },
        ]
      : []),
    {
      icone: 'alerte' as const,
      libelle: 'Alertes',
      valeur: String(tableau?.alertes.length ?? 0),
      href: '#alertes',
    },
  ]

  const blocLots = (
    <section aria-label="Avancement par lot">
      <div className="surface overflow-hidden">
        <div className="border-border/70 flex items-baseline justify-between gap-4 border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2.5 text-base font-extrabold">
            <span className="pastille size-8">
              <Icone.lot className="size-4" strokeWidth={2} aria-hidden />
            </span>
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
            <li key={lot.id} className="hover:bg-muted/50 px-5 py-3.5 transition-colors">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <Link
                  href={`/projet/${projet.id}/lot/${lot.id}`}
                  className="focus-visible:ring-ring/70 -mx-1 inline-flex items-center gap-2 rounded px-1 text-[0.9375rem] font-bold hover:underline"
                >
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-[4px]"
                    style={{ background: teinteSerie(lot.rangCouleur) }}
                  />
                  <span className="text-muted-foreground font-mono text-xs font-medium">
                    {lot.code}
                  </span>
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
          <h1 className="text-[1.625rem] leading-tight font-extrabold tracking-tight">
            {projet.nom}
          </h1>
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

      {global === null ||
      tableau === null ||
      ind === undefined ||
      fin === undefined ||
      t === undefined ? (
        <div className="surface mt-6 px-6 py-14 text-center">
          <Icone.tableauBord
            className="text-muted-foreground/60 mx-auto size-8"
            strokeWidth={1.5}
          />
          <p className="mt-3 font-medium">Aucun indicateur disponible</p>
          <p className="text-muted-foreground mx-auto mt-1.5 max-w-sm text-sm">
            Les indicateurs n&apos;ont pas encore été calculés pour ce chantier. Ils le seront à la
            validation du prochain relevé, ou cette nuit.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <Accueil
              salutation={`${salutation(new Date().getUTCHours())} ${prenom(utilisateur.nom)},`}
              titre={titreSituation(situation)}
              sousTitre={sousTitreSituation(situation)}
              realise={ind.avancement}
              prevu={ind.avancementPrevu}
              reperes={reperes}
            />
          </div>

          <section aria-label="Indicateurs de synthèse" className="entree entree-1 mt-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tuile
                intitule="Avancement"
                valeur={pourcent(ind.avancement)}
                anime={{ valeur: ind.avancement, format: 'pourcent' }}
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
                intitule={retardArrondi >= 0 ? 'Retard constaté' : 'Avance constatée'}
                valeur={`${Math.abs(retardArrondi)} j`}
                precision="lecture horizontale de la courbe en S"
                icone="planning"
                ton={retardJ > 20 ? 'critique' : retardJ > 5 ? 'alerte' : 'bon'}
                tendance={{
                  serie: t.ecartDelaiJ.serie,
                  sens: sens(t.ecartDelaiJ.variation, 0.5),
                  libelle: enTrenteJours(
                    t.ecartDelaiJ.variation === null
                      ? null
                      : Math.round(t.ecartDelaiJ.variation) === 0
                        ? 'stable'
                        : `${jours(Math.round(t.ecartDelaiJ.variation))} de retard`,
                  ),
                }}
              />
              <Tuile
                intitule="SPI — délai"
                valeur={ind.spi === null ? '—' : indice(ind.spi)}
                {...(ind.spi === null
                  ? {}
                  : { anime: { valeur: ind.spi, format: 'indice' as const } })}
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
                  {...(ind.cpi === null
                    ? {}
                    : { anime: { valeur: ind.cpi, format: 'indice' as const } })}
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
                  valeur={dateLongue(fin.dateFinProjetee).replace(/ \d{4}$/, '')}
                  precision={
                    fin.retardProjeteJ > 0
                      ? `${fin.retardProjeteJ} j de retard sur la date contractuelle`
                      : `dans le délai contractuel : ${dateLongue(donnees.finContractuelle)}`
                  }
                  icone="calendrier"
                  ton={fin.retardProjeteJ > 0 ? 'alerte' : 'bon'}
                />
              )}
            </div>
          </section>

          <section aria-label="Situation budgétaire" className="mt-4">
            <dl className="surface divide-border/70 grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              {(interne && ind.eac !== null
                ? [
                    { cle: 'Montant du marché', valeur: fcfa(donnees.contrat.montantXof) },
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
                    { cle: 'Montant du marché', valeur: fcfa(donnees.contrat.montantXof) },
                    { cle: 'Valeur planifiée', valeur: fcfa(ind.vp) },
                    { cle: 'Valeur acquise', valeur: fcfa(ind.va) },
                    {
                      cle: 'Reste à réaliser',
                      valeur: fcfa(donnees.contrat.montantXof - ind.va),
                      note: undefined,
                    },
                  ]
              ).map((c) => (
                <div key={c.cle} className="px-5 py-4">
                  <dt className="text-muted-foreground text-sm font-bold">{c.cle}</dt>
                  <dd className="chiffres-alignes mt-1 text-lg font-extrabold tracking-tight">
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
              {texteAchevement(fin, donnees.finContractuelle)}
              {interne &&
                ' Le coût réel est reconstitué à partir des heures relevées, des quantités mises en œuvre et du coût des aléas ; il ne remplace pas la comptabilité analytique de l’entreprise. Le CPI et le coût estimé final le comparent au coût budgété du travail, établi d’après les équipes prévues au planning, et non au prix de vente, qui inclut la marge.'}
            </p>
          </section>

          <section aria-label="Courbe en S" className="mt-4">
            <div className="surface px-5 py-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="flex items-center gap-2.5 text-base font-extrabold">
                  <span className="pastille size-8">
                    <Icone.analyses className="size-4" strokeWidth={2} aria-hidden />
                  </span>
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
          <h2 className="mb-3 text-base font-extrabold">Le marché</h2>
          <dl className="grid gap-x-10 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Code', projet.code],
              ['Entreprise', projet.entreprise],
              ['Maîtrise d’œuvre', projet.maitreOeuvre],
              ['Ordre de service', dateLongue(projet.dateOrdreService)],
              [
                'Fin contractuelle',
                donnees.finContractuelle === projet.dateFinContractuelle
                  ? dateLongue(projet.dateFinContractuelle)
                  : `${dateLongue(donnees.finContractuelle)} (initiale : ${dateCourte(projet.dateFinContractuelle)})`,
              ],
              [
                'Durée contractuelle',
                donnees.contrat.dureeJ === projet.dureeContractuelleJ
                  ? `${projet.dureeContractuelleJ} jours calendaires`
                  : `${donnees.contrat.dureeJ} jours, dont ${donnees.contrat.dureeJ - projet.dureeContractuelleJ} de prolongation`,
              ],
              [
                'Montant du marché',
                donnees.contrat.montantAvenantsXof === 0
                  ? fcfa(donnees.contrat.montantXof)
                  : `${fcfa(donnees.contrat.montantXof)}, avenants compris`,
              ],
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
