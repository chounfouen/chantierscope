import type { JalonProjete } from '@/db/compute/tableau'
import { ETAT } from '@/lib/etats'
import { dateCourte } from '@/lib/format'
import { Icone } from '@/lib/icones'

function restants(j: number): string {
  if (j === 0) return 'aujourd’hui'
  if (j < 0) return `dépassé de ${-j} j`
  return `dans ${j} j`
}

/**
 * Prochains jalons, du plus proche au plus lointain, avec le nombre de jours
 * restants et la date a laquelle la tache declenchante est projetee.
 */
export function ProchainsJalons({
  jalons,
  maximum = 5,
}: {
  jalons: readonly JalonProjete[]
  maximum?: number
}) {
  const Menace = ETAT.CRITIQUE.icone
  return (
    <section aria-labelledby="titre-jalons" className="surface overflow-hidden">
      <div className="border-border/70 flex items-baseline justify-between gap-4 border-b px-5 py-3.5">
        <h2 id="titre-jalons" className="flex items-center gap-2 text-sm font-medium">
          <Icone.jalon className="text-muted-foreground size-4" strokeWidth={1.75} aria-hidden />
          Prochains jalons
        </h2>
        <p className="text-muted-foreground text-xs">Date prévue, puis projetée</p>
      </div>

      {jalons.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">Tous les jalons sont atteints.</p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {jalons.slice(0, maximum).map((j) => (
            <li key={j.id} className="flex items-start justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm leading-snug font-medium">{j.nom}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {j.contractuel ? 'Contractuel' : 'Interne'}
                  <span className="mx-1.5 opacity-40">·</span>
                  prévu le {dateCourte(j.datePrevue)}
                  {j.dateProjetee !== null && j.glissementJ !== 0 && (
                    <>
                      <span className="mx-1.5 opacity-40">·</span>
                      projeté le {dateCourte(j.dateProjetee)}
                    </>
                  )}
                </p>
                {j.menace && (
                  <p
                    className={`mt-1 flex items-center gap-1 text-xs font-medium ${ETAT.CRITIQUE.teinte}`}
                  >
                    <Menace className="size-3.5" strokeWidth={1.75} aria-hidden />
                    Menacé, {j.glissementJ} j de glissement
                  </p>
                )}
              </div>
              <p className="chiffres-alignes shrink-0 text-right text-sm font-semibold">
                {restants(j.joursRestants)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
