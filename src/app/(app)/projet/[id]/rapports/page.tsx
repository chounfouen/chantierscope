import type { Metadata } from 'next'
import { sql } from 'drizzle-orm'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { semaineFinissantLe } from '@/db/compute/rapport'
import { dateApres } from '@/db/compute/tableau'
import { db } from '@/db/index'
import { exigerPage, voitDonneesInternes } from '@/lib/garde'
import { dateLongue } from '@/lib/format'
import { Icone } from '@/lib/icones'

export const metadata: Metadata = { title: 'Rapports' }

/** Semaines proposees : les huit dernieres, finissant le jour de la situation. */
const SEMAINES = 8

export default async function Rapports({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const u = await exigerPage(id)
  const interne = voitDonneesInternes(u.role)
  const [l] = await db().execute<{ situation: string | null; origine: string }>(sql`
    select (select max(date) from snapshot_avancement where projet_id = p.id) as situation,
           p.date_ordre_service as origine
      from projet p where p.id = ${id}`)
  const situation = l?.situation ?? null

  const semaines =
    situation === null
      ? []
      : Array.from({ length: SEMAINES }, (_, k) =>
          semaineFinissantLe(dateApres(situation, -7 * k)),
        ).filter((s) => s.fin >= (l?.origine ?? ''))

  return (
    <div className="mx-auto max-w-[56rem] px-4 py-6 sm:px-6 lg:px-8">
      <FilAriane maillons={[{ libelle: 'Rapports' }]} />
      <h1 className="mt-2.5 text-[1.375rem] font-semibold">Rapports hebdomadaires</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Page de garde, synthèse des indicateurs, avancement par lot, faits marquants, aléas, météo
        {interne ? ', effectifs' : ''}, planche photographique et jalons à venir. Le rapport est
        calculé à la demande sur les relevés validés.
      </p>
      {!interne && (
        <p className="text-muted-foreground mt-2 text-sm">
          Votre exemplaire ne comporte ni les données de coût ni les effectifs de l’entreprise.
        </p>
      )}

      {semaines.length === 0 ? (
        <p className="surface text-muted-foreground mt-5 px-5 py-8 text-sm">
          Aucune situation n’est encore calculée pour ce chantier.
        </p>
      ) : (
        <ul className="surface divide-border/60 mt-5 divide-y">
          {semaines.map((s, k) => (
            <li key={s.fin} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium">
                  Semaine du {dateLongue(s.debut)} au {dateLongue(s.fin)}
                </p>
                {k === 0 && (
                  <p className="text-muted-foreground text-xs">Situation la plus récente</p>
                )}
              </div>
              <a
                href={`/api/projet/${id}/rapport?fin=${s.fin}`}
                download
                className="border-input hover:bg-accent flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                <Icone.exporter className="size-4" strokeWidth={1.75} aria-hidden />
                Télécharger le PDF
                <span className="sr-only">
                  {' '}
                  de la semaine du {dateLongue(s.debut)} au {dateLongue(s.fin)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
