import Link from 'next/link'
import type { Alerte, NiveauAlerte, RegleAlerte } from '@/db/compute/tableau'
import { SEUILS_ALERTE } from '@/db/compute/tableau'
import { ETAT } from '@/lib/etats'
import { Icone } from '@/lib/icones'
import type { LucideIcon } from 'lucide-react'

/**
 * Niveau d'une alerte : libelle, icone et teinte d'etat. La teinte ne porte
 * jamais seule le niveau, toujours doublee de l'icone et du libelle ecrit.
 */
const NIVEAU: Record<
  NiveauAlerte,
  { libelle: string; icone: LucideIcon; teinte: string; couleur: string }
> = {
  critique: {
    libelle: 'Critique',
    icone: ETAT.CRITIQUE.icone,
    teinte: ETAT.CRITIQUE.teinte,
    couleur: ETAT.CRITIQUE.couleur,
  },
  alerte: {
    libelle: 'À traiter',
    icone: ETAT.EN_RETARD.icone,
    teinte: ETAT.EN_RETARD.teinte,
    couleur: ETAT.EN_RETARD.couleur,
  },
  information: {
    libelle: 'À suivre',
    icone: Icone.enAttente,
    teinte: 'text-muted-foreground',
    couleur: 'var(--muted-foreground)',
  },
}

/** Les regles, enoncees telles qu'elles sont appliquees. */
export const ENONCE_REGLE: Record<RegleAlerte, string> = {
  TACHE_CRITIQUE_EN_RETARD: `Tâche du chemin critique en retard d’au moins ${SEUILS_ALERTE.retardTacheJ} jour sur son avancement prévu.`,
  JALON_MENACE:
    'Jalon contractuel dont la tâche déclenchante, projetée au rythme prévu depuis la situation, finit après la date.',
  NON_CONFORMITE_OUVERTE: `Non-conformité non soldée, ouverte depuis plus de ${SEUILS_ALERTE.nonConformiteJours} jours.`,
  RELEVE_NON_VALIDE: `Relevé en brouillon ou soumis, non validé plus de ${SEUILS_ALERTE.releveJours} jours après sa journée.`,
  DEPASSEMENT_QUANTITATIF: `Quantité réalisée supérieure de plus de ${SEUILS_ALERTE.depassement * 100} % au quantitatif.`,
}

function lien(projetId: string, a: Alerte): string | null {
  switch (a.cible.type) {
    case 'releve':
      return `/projet/${projetId}/releve/${a.cible.id}`
    case 'jalon':
      return `/projet/${projetId}/planning`
    default:
      return a.cible.lotId === undefined ? null : `/projet/${projetId}/lot/${a.cible.lotId}`
  }
}

export function PanneauAlertes({
  projetId,
  alertes,
  maximum = 8,
}: {
  projetId: string
  alertes: readonly Alerte[]
  maximum?: number
}) {
  const affichees = alertes.slice(0, maximum)
  const parNiveau = (n: NiveauAlerte) => alertes.filter((a) => a.niveau === n).length

  return (
    <section
      id="alertes"
      aria-labelledby="titre-alertes"
      className="surface scroll-mt-20 overflow-hidden"
    >
      <div className="border-border/70 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-5 py-3.5">
        <h2 id="titre-alertes" className="flex items-center gap-2.5 text-base font-extrabold">
          <span className="pastille size-8">
            <Icone.alerte className="size-4" strokeWidth={2} aria-hidden />
          </span>
          Alertes
        </h2>
        <p className="text-muted-foreground chiffres-alignes text-xs">
          {alertes.length === 0
            ? 'Aucune'
            : (['critique', 'alerte', 'information'] as const)
                .filter((n) => parNiveau(n) > 0)
                .map((n) => `${parNiveau(n)} ${NIVEAU[n].libelle.toLowerCase()}`)
                .join(' · ')}
        </p>
      </div>

      {alertes.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          Aucune règle d’alerte n’est déclenchée à la date de la situation.
        </p>
      ) : (
        <ol className="divide-border/60 divide-y">
          {affichees.map((a) => {
            const n = NIVEAU[a.niveau]
            const href = lien(projetId, a)
            const contenu = (
              <>
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full"
                  style={{ background: `color-mix(in oklab, ${n.couleur} 15%, var(--card))` }}
                >
                  <n.icone
                    className={`size-[1.125rem] ${n.teinte}`}
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-muted-foreground text-xs font-extrabold tracking-wide uppercase">
                      {n.libelle}
                    </span>
                    <span className="text-[0.9375rem] leading-snug font-bold">{a.titre}</span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[0.8125rem] leading-relaxed">
                    {a.detail}
                  </span>
                </span>
                {href !== null && (
                  <Icone.suivant
                    className="text-muted-foreground mt-2 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                )}
              </>
            )
            return (
              <li key={a.cle} data-regle={a.regle}>
                {href === null ? (
                  <div className="flex gap-3 px-5 py-3.5">{contenu}</div>
                ) : (
                  <Link
                    href={href}
                    className="group hover:bg-muted/60 flex gap-3 px-5 py-3.5 transition-colors"
                  >
                    {contenu}
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {alertes.length > affichees.length && (
        <p className="text-muted-foreground border-border/60 border-t px-5 py-2.5 text-xs">
          Et {alertes.length - affichees.length} autres alertes, de moindre ampleur.
        </p>
      )}

      <details className="border-border/60 border-t px-5 py-2.5 text-xs">
        <summary className="text-muted-foreground cursor-pointer select-none">
          Règles appliquées
        </summary>
        <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-4 leading-relaxed">
          {Object.values(ENONCE_REGLE).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}
