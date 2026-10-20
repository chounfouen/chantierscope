import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import {
  FormulaireReserve,
  LeveeReserve,
  PrononceReception,
} from '@/components/reception/formulaires'
import { db } from '@/db/index'
import { chargerPlanning } from '@/db/queries/planning'
import { chargerReception, zonesDuProjet } from '@/db/queries/reception'
import { aujourdhui, dateCourte, dateLongue, nombre } from '@/lib/format'
import {
  exigerPage,
  habilite,
  PEUT_CONSTATER_RESERVE,
  PEUT_LEVER_RESERVE,
  PEUT_PRONONCER_RECEPTION,
} from '@/lib/garde'
import { LIBELLE_PHASE } from '@/lib/reception'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Réserves' }

/**
 * Operations prealables a la reception, reception et garantie de parfait
 * achevement : chaque reserve localisee sur le plan, imputee a l'entreprise
 * qui execute le lot, suivie jusqu'a sa levee.
 */
export default async function Reserves({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ zone?: string | string[] }>
}) {
  const { id } = await params
  const { zone: zoneDemandee } = await searchParams
  const utilisateur = await exigerPage(id)
  const jour = aujourdhui()
  const base = db()
  const [r, planning, zones] = await Promise.all([
    chargerReception(base, id, jour),
    chargerPlanning(base, id),
    zonesDuProjet(base, id),
  ])
  const projet = planning.projet
  const role = utilisateur.role
  const filtre = typeof zoneDemandee === 'string' ? zoneDemandee : null
  const affichees = filtre === null ? r.reserves : r.reserves.filter((x) => x.zoneId === filtre)
  const zoneFiltree = zones.find((z) => z.id === filtre)
  const s = r.synthese

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[{ libelle: projet.code, href: `/projet/${id}` }, { libelle: 'Réserves' }]}
      />
      <header className="mt-3">
        <TitrePage icone="reserve">Réception et réserves</TitrePage>
        <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
          {r.dateReception === null
            ? 'Réception non prononcée : les réserves relèvent des opérations préalables.'
            : `Réception prononcée le ${dateLongue(r.dateReception)}. Garantie de parfait achèvement jusqu’au ${dateLongue(r.finGarantie as string)}.`}
        </p>
      </header>

      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        {(
          [
            ['Ouvertes', String(s.ouvertes)],
            ['Échéance dépassée', String(s.enRetard)],
            ['Levées', String(s.levees)],
            [
              'Délai moyen de levée',
              s.delaiMoyenLeveeJ === null ? '—' : `${nombre(s.delaiMoyenLeveeJ)} j`,
            ],
          ] as const
        ).map(([t, v]) => (
          <div key={t} className="surface p-4">
            <dt className="text-muted-foreground text-sm">{t}</dt>
            <dd className="chiffres-alignes mt-1 text-2xl font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>

      {r.dateReception === null && habilite(role, PEUT_PRONONCER_RECEPTION) && (
        <section className="surface mt-4 px-5 py-4">
          <h2 className="mb-3 text-base font-extrabold">Prononcer la réception</h2>
          <PrononceReception projetId={id} aujourdhui={jour} reservesOuvertes={s.ouvertes} />
        </section>
      )}

      {habilite(role, PEUT_CONSTATER_RESERVE) && (
        <details className="surface mt-4 px-5 py-4" open={filtre !== null}>
          <summary className="cursor-pointer text-sm font-bold">Consigner une réserve</summary>
          <div className="mt-3">
            <FormulaireReserve
              projetId={id}
              aujourdhui={jour}
              zones={zones}
              lots={planning.lots.map((l) => ({ id: l.id, nom: l.nom }))}
              receptionPrononcee={r.dateReception !== null}
              zoneInitiale={filtre}
            />
          </div>
        </details>
      )}

      <section aria-labelledby="titre-reserves" className="surface mt-4 mb-2 overflow-hidden">
        <h2
          id="titre-reserves"
          className="border-border/70 flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5 text-base font-extrabold"
        >
          <span>{zoneFiltree ? zoneFiltree.nom : 'Toutes les réserves'}</span>
          {zoneFiltree && (
            <Link
              href={`/projet/${id}/reserves`}
              className="text-muted-foreground text-sm font-medium underline underline-offset-4"
            >
              Voir toutes les zones
            </Link>
          )}
        </h2>
        {affichees.length === 0 ? (
          <p className="text-muted-foreground p-5 text-sm">Aucune réserve.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {affichees.map((x) => {
              const retard = x.leveeLe === null && x.echeance !== null && x.echeance < jour
              return (
                <li key={x.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
                  <span className="w-12 font-bold">n° {x.numero}</span>
                  <span className="min-w-0 flex-1">
                    {x.description}
                    <span className="text-muted-foreground block text-xs">
                      {[
                        x.zoneNom ?? 'Non localisée',
                        x.lotNom && `${x.lotNom} (${x.entreprise ?? 'titulaire'})`,
                        LIBELLE_PHASE[x.phase],
                        `constatée le ${dateCourte(x.constateeLe)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {x.leveeLe !== null ? (
                      <span className="text-etat-acheve text-xs font-bold">
                        Levée le {dateCourte(x.leveeLe)}
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'text-xs font-bold',
                            retard ? 'text-etat-critique' : 'text-etat-retard',
                          )}
                        >
                          {x.echeance
                            ? `${retard ? 'Échue le' : 'À lever avant le'} ${dateCourte(x.echeance)}`
                            : 'Ouverte'}
                        </span>
                        {habilite(role, PEUT_LEVER_RESERVE) && (
                          <LeveeReserve projetId={id} reserveId={x.id} aujourdhui={jour} />
                        )}
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
