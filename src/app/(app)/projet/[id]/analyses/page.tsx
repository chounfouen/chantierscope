import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FilAriane } from '@/components/coquille/fil-ariane'
import {
  BarresHorizontales,
  ConsommationMateriau,
  HistogrammeEffectifs,
  JoursPerdus,
} from '@/components/graphiques/analyses'
import { CourbeS } from '@/components/graphiques/courbe-s'
import {
  arretsParCause,
  consommations,
  effectifs,
  joursPerdusCumules,
  MATERIAUX,
  rendements,
  repartitionAleas,
  FENETRE_RECENTE_J,
} from '@/db/compute/analyses'
import { dateApres } from '@/db/compute/tableau'
import { db } from '@/db/index'
import { chargerAnalyses } from '@/db/queries/analyses'
import { chargerTableau } from '@/db/queries/tableau'
import { exigerPage, voitDonneesInternes } from '@/lib/garde'
import { dateLongue, LIBELLE_NATURE, LIBELLE_UNITE, nombre, pourcent } from '@/lib/format'
import { Icone, type NomIcone } from '@/lib/icones'
import { LIBELLE_GRAVITE, LIBELLE_TYPE_ALEA } from '@/lib/releve'
import { construireTableau } from '@/lib/tableau-donnees'

export const metadata: Metadata = { title: 'Analyses' }

/** Charge a venir montree au-dela de la date d'analyse, en jours. */
const HORIZON_CHARGE_J = 60

function Bloc({
  titre,
  sousTitre,
  icone,
  children,
}: {
  titre: string
  sousTitre?: string
  icone: NomIcone
  children: ReactNode
}) {
  const I = Icone[icone]
  return (
    <section aria-label={titre} className="surface px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <I className="text-muted-foreground size-4" strokeWidth={1.75} aria-hidden />
          {titre}
        </h2>
        {sousTitre !== undefined && <p className="text-muted-foreground text-xs">{sousTitre}</p>}
      </div>
      {children}
    </section>
  )
}

const libelleType = (t: string) => LIBELLE_TYPE_ALEA[t as keyof typeof LIBELLE_TYPE_ALEA] ?? t

export default async function Analyses({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const interne = voitDonneesInternes(utilisateur.role)

  const base = db()
  const [donnees, tableauLu] = await Promise.all([
    chargerAnalyses(base, id, interne),
    chargerTableau(base, id, interne),
  ])
  const tableau = construireTableau(tableauLu)
  const { origine, jourAnalyse, dateAnalyse } = donnees
  const date = (j: number) => dateApres(origine, j)

  if (dateAnalyse === null || tableau === null) {
    return (
      <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-6 lg:px-8">
        <FilAriane maillons={[{ libelle: 'Analyses' }]} />
        <p className="text-muted-foreground mt-6 text-sm">
          Aucun instantané calculé pour ce chantier : les analyses ne sont pas encore disponibles.
        </p>
      </div>
    )
  }

  const materiaux = consommations(donnees.lignes, donnees.taches, donnees.quantites, jourAnalyse)
  const aleas = repartitionAleas(donnees.aleas, jourAnalyse)
  const perdus = joursPerdusCumules(donnees.aleas, jourAnalyse)
  const arrets = arretsParCause(donnees.releves, jourAnalyse)
  const effectif = interne
    ? effectifs(donnees.releves, donnees.equipes, jourAnalyse, HORIZON_CHARGE_J)
    : []
  const rendement = interne
    ? rendements(
        donnees.lignes,
        donnees.taches,
        donnees.equipes,
        donnees.releves,
        donnees.quantites,
        jourAnalyse,
      )
    : []
  const retard = Math.round(tableau.indicateurs.ecartDelaiJ)

  return (
    <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-6 lg:px-8">
      <FilAriane maillons={[{ libelle: 'Analyses' }]} />
      <header className="mt-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="text-[1.375rem] font-semibold">Analyses</h1>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Icone.calendrier className="size-3.5" strokeWidth={1.75} />
          Situation arrêtée au {dateLongue(dateAnalyse)}, relevés validés seulement
        </p>
      </header>

      <div className="mt-5 grid gap-4">
        <Bloc
          titre="Courbe en S"
          icone="analyses"
          sousTitre={
            retard > 0
              ? `${retard} jours de retard par lecture horizontale : la valeur acquise du jour était planifiée le ${dateLongue(date(jourAnalyse - retard))}`
              : 'Valeur acquise au niveau du planifié'
          }
        >
          <CourbeS
            points={tableauLu.courbe}
            projection={tableau.projection}
            bac={tableauLu.cadre.bacXof}
            ecartDelaiJ={tableau.indicateurs.ecartDelaiJ}
            interne={interne}
          />
        </Bloc>

        {interne && (
          <Bloc
            titre="Effectifs"
            icone="effectif"
            sousTitre={`Ouvriers relevés jour par jour, et charge des équipes prévues jusqu’à ${HORIZON_CHARGE_J} jours après la situation`}
          >
            <HistogrammeEffectifs
              dateAnalyse={dateAnalyse}
              points={effectif.map((p) => ({ date: date(p.jour), reel: p.reel, prevu: p.prevu }))}
            />
          </Bloc>
        )}

        <Bloc
          titre="Consommation des matériaux clés"
          icone="materiaux"
          sousTitre="Cumul prévu au planning contre cumul réalisé"
        >
          <div className="grid gap-6 lg:grid-cols-3">
            {materiaux.map((m) => (
              <ConsommationMateriau
                key={m.famille}
                libelle={MATERIAUX[m.famille].libelle}
                unite={MATERIAUX[m.famille].unite}
                total={m.total}
                points={m.serie.map((p) => ({
                  date: date(p.jour),
                  prevu: p.prevu,
                  realise: p.realise,
                }))}
              />
            ))}
          </div>
        </Bloc>

        {interne && rendement.length > 0 && (
          <Bloc
            titre="Rendements par nature de tâche"
            icone="tableauBord"
            sousTitre="Production par ouvrier et par jour, rapportée au rendement prévu : 100 % est le nominal"
          >
            <BarresHorizontales
              titre="Rendement relatif depuis le début du chantier"
              barres={rendement
                .filter((r) => r.indice !== null)
                .map((r) => ({
                  libelle: LIBELLE_NATURE[r.nature],
                  valeur: r.indice as number,
                  detail:
                    r.indiceRecent === null
                      ? undefined
                      : `${pourcent(r.indiceRecent, 0)} sur ${FENETRE_RECENTE_J} jours`,
                }))}
              format="pourcent"
              reference={1}
              libelleReference="Prévu"
              colonnes={[
                'Nature',
                'Ouvriers-jours',
                'Quantité par ouvrier-jour',
                'Prévue',
                'Rendement relatif',
                `Sur ${FENETRE_RECENTE_J} jours`,
              ]}
              lignesTableau={rendement.map((r) => [
                LIBELLE_NATURE[r.nature],
                nombre(r.ouvriersJours),
                r.quantiteParOuvrierJour === null
                  ? '—'
                  : `${nombre(r.quantiteParOuvrierJour, 2)} ${LIBELLE_UNITE[r.unite]}`,
                r.quantitePrevueParOuvrierJour === null
                  ? '—'
                  : `${nombre(r.quantitePrevueParOuvrierJour, 2)} ${LIBELLE_UNITE[r.unite]}`,
                r.indice === null ? '—' : pourcent(r.indice, 0),
                r.indiceRecent === null ? '—' : pourcent(r.indiceRecent, 0),
              ])}
            />
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
              Le relevé donne l’effectif d’un lot pour la journée : il est réparti entre les tâches
              du lot qui ont produit ce jour-là, au prorata des équipes prévues. Une baisse sur les
              trente derniers jours précède en général le retard qu’elle va produire.
            </p>
          </Bloc>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Bloc
            titre="Aléas par type"
            icone="alerte"
            sousTitre="Nombre d’aléas survenus, par gravité dans le tableau"
          >
            {aleas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun aléa déclaré.</p>
            ) : (
              <BarresHorizontales
                titre="Aléas par type"
                barres={aleas.map((a) => ({
                  libelle: libelleType(a.type),
                  valeur: a.total,
                  detail: `${a.joursPerdus} jours perdus`,
                }))}
                format="nombre"
                colonnes={[
                  'Type',
                  ...[1, 2, 3, 4].map((g) => LIBELLE_GRAVITE[g] ?? String(g)),
                  'Total',
                  'Jours perdus',
                ]}
                lignesTableau={aleas.map((a) => [
                  libelleType(a.type),
                  ...a.parGravite.map((n) => nombre(n)),
                  nombre(a.total),
                  nombre(a.joursPerdus),
                ])}
              />
            )}
          </Bloc>

          <Bloc
            titre="Jours perdus cumulés"
            icone="calendrier"
            sousTitre={`${perdus[perdus.length - 1]?.cumul ?? 0} jours d’impact déclarés sur les aléas`}
          >
            <JoursPerdus points={perdus.map((p) => ({ date: date(p.jour), cumul: p.cumul }))} />
          </Bloc>
        </div>

        <Bloc
          titre="Journées non travaillables par cause"
          icone="chome"
          sousTitre="Journées calendaires touchées ; une journée arrêtée sur plusieurs lots compte une fois"
        >
          {arrets.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune journée non travaillée relevée.</p>
          ) : (
            <BarresHorizontales
              titre="Journées non travaillables par cause"
              barres={arrets.map((a) => ({
                libelle: a.cause,
                valeur: a.journees,
                detail: `${a.journeesLot} journées de lot`,
              }))}
              format="nombre"
              colonnes={['Cause', 'Journées', 'Journées de lot']}
              lignesTableau={arrets.map((a) => [
                a.cause,
                nombre(a.journees),
                nombre(a.journeesLot),
              ])}
            />
          )}
        </Bloc>
      </div>
    </div>
  )
}
