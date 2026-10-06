import Link from 'next/link'
import { Grue } from '@/components/coquille/grue'
import { AnneauProgression } from '@/components/indicateurs/anime'
import { Icone, type NomIcone } from '@/lib/icones'
import { pourcent } from '@/lib/format'

export type Repere = { icone: NomIcone; libelle: string; valeur: string; href?: string }

/**
 * Accueil du tableau de bord : la situation dite en une phrase, l'avancement
 * en grand, et trois ou quatre reperes. Le detail chiffre vient ensuite.
 */
export function Accueil({
  salutation,
  titre,
  sousTitre,
  realise,
  prevu,
  reperes,
}: {
  salutation: string
  titre: string
  sousTitre: string
  realise: number
  prevu: number
  reperes: Repere[]
}) {
  return (
    <section
      aria-label="Situation du chantier"
      className="surface entree relative overflow-hidden px-6 py-6 sm:px-8"
      style={{
        background:
          'linear-gradient(135deg, var(--marque-douce) 0%, var(--card) 55%, var(--soleil-doux) 140%)',
      }}
    >
      <Grue className="absolute -bottom-8 hidden h-52 xl:block" style={{ right: '13rem' }} />
      <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-marque text-sm font-extrabold">{salutation}</p>
          <h2 className="mt-1 text-[1.625rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[1.875rem]">
            {titre}
          </h2>
          <p className="text-muted-foreground mt-2 text-[0.9375rem] font-semibold">{sousTitre}</p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {reperes.map((r) => {
              const I = Icone[r.icone]
              const contenu = (
                <>
                  <span className="pastille size-7 rounded-full">
                    <I className="size-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="text-muted-foreground text-xs font-bold">{r.libelle}</span>
                  <span className="chiffres-alignes text-sm font-extrabold">{r.valeur}</span>
                </>
              )
              const classe =
                'bg-card/90 border-border/70 flex items-center gap-2 rounded-full border py-1 pr-3.5 pl-1'
              return (
                <li key={r.libelle}>
                  {r.href ? (
                    <Link
                      href={r.href}
                      className={`${classe} hover:border-marque/40 transition-colors`}
                    >
                      {contenu}
                    </Link>
                  ) : (
                    <span className={classe}>{contenu}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex flex-col items-center gap-2">
          <AnneauProgression realise={realise} prevu={prevu} />
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
            <span aria-hidden className="bg-foreground inline-block h-3 w-[3px] rounded-full" />
            prévu à cette date : {pourcent(prevu)}
          </p>
        </div>
      </div>
    </section>
  )
}
