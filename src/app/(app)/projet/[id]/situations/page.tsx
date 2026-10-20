import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import { db } from '@/db/index'
import { chargerPlanning } from '@/db/queries/planning'
import { chargerSituations } from '@/db/queries/situation'
import { aujourdhui, dateCourte, fcfa, fcfaNu, moisLong, pourcent } from '@/lib/format'
import { exigerPage } from '@/lib/garde'

export const metadata: Metadata = { title: 'Situations de travaux' }

/**
 * Situations mensuelles : pour chaque mois, les travaux executes depuis
 * l'origine, ce qui en est deduit, et ce que le mois appelle en paiement.
 *
 * Les travaux sont valorises par la methode d'avancement de chaque tache,
 * au prix du marche. C'est une base de discussion, pas l'attachement
 * contradictoire qui fonde le decompte signe.
 */
export default async function Situations({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await exigerPage(id)
  const base = db()
  const [decompte, planning] = await Promise.all([
    chargerSituations(base, id, aujourdhui()),
    chargerPlanning(base, id),
  ])
  const { clauses, situations } = decompte
  const projet = planning.projet
  const derniere = situations.at(-1)
  const totalPaye = situations.reduce((t, s) => t + s.aPayerXof, 0)

  const clausesLues: [string, string][] = [
    ['Retenue de garantie', pourcent(clauses.retenueGarantieTaux, 0)],
    [
      'Avance de démarrage',
      clauses.avanceTaux > 0
        ? `${fcfa(decompte.avanceXof)} (${pourcent(clauses.avanceTaux, 0)} du marché initial)`
        : 'aucune',
    ],
    [
      'Remboursement de l’avance',
      `de ${pourcent(clauses.remboursementDebut, 0)} à ${pourcent(clauses.remboursementFin, 0)} d’exécution`,
    ],
    [
      'Pénalités de retard',
      `${pourcent(clauses.tauxPenaliteJournaliere, 2)} du marché par jour, au-delà du délai en vigueur`,
    ],
  ]

  /** Une deduction s'affiche en negatif ; zero reste zero, sans signe. */
  const deduit = (x: number) => (x === 0 ? '0' : fcfaNu(-x))
  const cellule = 'chiffres-alignes px-2.5 py-2 text-right whitespace-nowrap'
  // Les en-tetes passent a la ligne : le tableau tient sur un ecran de bureau.
  const entete = 'px-2.5 py-2 text-right align-bottom font-bold leading-tight'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[{ libelle: projet.code, href: `/projet/${id}` }, { libelle: 'Situations' }]}
      />
      <header className="mt-3">
        <TitrePage icone="cout">Situations de travaux</TitrePage>
        <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
          Décompte mensuel, en cumul depuis l’ordre de service, hors taxes. Le marché en vigueur et
          la fin contractuelle viennent du{' '}
          <Link href={`/projet/${id}/contrat`} className="underline underline-offset-4">
            contrat
          </Link>
          .
        </p>
      </header>

      <section aria-labelledby="titre-clauses" className="surface mt-4 p-5">
        <h2 id="titre-clauses" className="text-base font-extrabold">
          Clauses financières du CCAP
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {clausesLues.map(([cle, valeur]) => (
            <div key={cle} className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">{cle}</dt>
              <dd className="font-medium">{valeur}</dd>
            </div>
          ))}
        </dl>
      </section>

      {derniere === undefined ? (
        <p className="surface text-muted-foreground mt-4 p-5 text-sm">
          Aucune situation : le premier relevé validé ouvrira la première.
        </p>
      ) : (
        <>
          <section aria-labelledby="titre-derniere" className="surface mt-4 p-5">
            <h2 id="titre-derniere" className="text-base font-extrabold">
              Situation n° {derniere.numero}, {moisLong(derniere.mois)}
              {derniere.provisoire && (
                <span className="text-etat-retard ml-2 text-sm font-bold">
                  provisoire, arrêtée au {dateCourte(derniere.date)}
                </span>
              )}
            </h2>
            <dl className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-sm">À payer ce mois</dt>
                <dd className="chiffres-alignes text-xl font-extrabold">
                  {fcfa(derniere.aPayerXof)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Net cumulé dû</dt>
                <dd className="chiffres-alignes text-xl font-extrabold">
                  {fcfa(derniere.netCumuleXof)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Exécution du marché</dt>
                <dd className="chiffres-alignes text-xl font-extrabold">
                  {pourcent(derniere.execution)}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="titre-situations" className="surface mt-4 overflow-hidden">
            <h2
              id="titre-situations"
              className="border-border/70 border-b px-5 py-3.5 text-base font-extrabold"
            >
              Toutes les situations
              <span className="text-muted-foreground ml-2 text-sm font-medium">
                montants en F CFA
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Situations mensuelles de travaux, en cumul, montants en francs CFA hors taxes
                </caption>
                <thead className="bg-muted/40">
                  <tr>
                    <th scope="col" className="px-2.5 py-2 text-left align-bottom font-bold">
                      N°
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-left align-bottom font-bold">
                      Mois
                    </th>
                    <th scope="col" className={entete}>
                      Travaux cumulés
                    </th>
                    <th scope="col" className={entete}>
                      Exécution
                    </th>
                    <th scope="col" className={entete}>
                      Retenue de garantie
                    </th>
                    <th scope="col" className={entete}>
                      Avance remboursée
                    </th>
                    <th scope="col" className={entete}>
                      Pénalités
                    </th>
                    <th scope="col" className={entete}>
                      Net cumulé
                    </th>
                    <th scope="col" className={entete}>
                      À payer
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {situations.map((s) => (
                    <tr key={s.mois} className="border-border/60 border-t">
                      <td className="px-2.5 py-2 font-bold">{s.numero}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {moisLong(s.mois)}
                        {s.provisoire && (
                          <span className="text-muted-foreground block text-xs">
                            au {dateCourte(s.date)}, provisoire
                          </span>
                        )}
                      </td>
                      <td className={cellule}>{fcfaNu(s.travauxXof)}</td>
                      <td className={cellule}>{pourcent(s.execution)}</td>
                      <td className={cellule}>{deduit(s.retenueGarantieXof)}</td>
                      <td className={cellule}>{deduit(s.remboursementAvanceXof)}</td>
                      <td className={cellule}>
                        {deduit(s.penalitesXof)}
                        {s.retardConstateJ > 0 && (
                          <span className="text-muted-foreground block text-xs">
                            {s.retardConstateJ} j de retard
                          </span>
                        )}
                      </td>
                      <td className={cellule}>{fcfaNu(s.netCumuleXof)}</td>
                      <td className={`${cellule} font-bold`}>{fcfaNu(s.aPayerXof)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-border border-t-2">
                    <th scope="row" colSpan={8} className="px-2.5 py-2 text-right font-extrabold">
                      Total appelé
                    </th>
                    <td className={`${cellule} font-extrabold`}>{fcfaNu(totalPaye)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      <p className="text-muted-foreground mt-4 mb-2 text-sm">
        Les travaux sont valorisés par la méthode d’avancement de chaque tâche, au prix du marché :
        c’est la base de discussion de la situation, pas l’attachement contradictoire qui fonde le
        décompte signé. La retenue de garantie se libère à la réception, ou contre une caution.
        Aucune pénalité n’est retenue avant l’échéance du délai en vigueur.
      </p>
    </div>
  )
}
