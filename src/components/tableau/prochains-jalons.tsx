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
        <h2 id="titre-jalons" className="flex items-center gap-2.5 text-base font-extrabold">
          <span className="pastille size-8">
            <Icone.jalon className="size-4" strokeWidth={2} aria-hidden />
          </span>
          Prochains jalons
        </h2>
        <p className="text-muted-foreground text-xs">Date prévue, puis projetée</p>
      </div>

      {jalons.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">Tous les jalons sont atteints.</p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {jalons.slice(0, maximum).map((j) => (
            <li key={j.id} className="flex items-center gap-4 px-5 py-3.5">
              {/* Compte a rebours en pastille : le nombre de jours d'abord. */}
              <span
                className="grid size-14 shrink-0 place-content-center rounded-2xl text-center"
                style={{
                  background: j.menace
                    ? 'color-mix(in oklab, var(--etat-critique) 13%, var(--card))'
                    : 'var(--marque-douce)',
                }}
              >
                <span className="chiffres-alignes text-xl leading-none font-extrabold">
                  {Math.abs(j.joursRestants)}
                </span>
                <span className="text-muted-foreground mt-0.5 text-[0.6875rem] leading-none font-bold">
                  {j.joursRestants < 0 ? 'j passés' : 'jours'}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] leading-snug font-bold">{j.nom}</p>
                <p className="text-muted-foreground mt-0.5 text-[0.8125rem]">
                  {j.contractuel ? 'Contractuel' : 'Interne'}, prévu le {dateCourte(j.datePrevue)}
                  {j.dateProjetee !== null && j.glissementJ !== 0 && (
                    <>, projeté le {dateCourte(j.dateProjetee)}</>
                  )}
                </p>
                {j.menace && (
                  <p className="[&>svg]:text-etat-critique mt-1 flex items-center gap-1 text-xs font-bold">
                    <Menace className="size-3.5" strokeWidth={2.25} aria-hidden />
                    Menacé, {j.glissementJ} j de glissement
                  </p>
                )}
              </div>
              <span className="sr-only">{restants(j.joursRestants)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
