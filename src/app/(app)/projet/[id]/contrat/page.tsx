import type { Metadata } from 'next'
import Link from 'next/link'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import {
  DecisionIntemperie,
  FormulaireAvenant,
  FormulaireOrdreService,
} from '@/components/contrat/formulaires'
import { LIBELLE_ORDRE } from '@/lib/contrat'
import { db } from '@/db/index'
import { chargerContrat } from '@/db/queries/contrat'
import { chargerPlanning } from '@/db/queries/planning'
import { aujourdhui, dateCourte, dateLongue, fcfa, fcfaSigne } from '@/lib/format'
import { exigerPage, habilite, PEUT_GERER_CONTRAT, PEUT_STATUER_INTEMPERIE } from '@/lib/garde'

export const metadata: Metadata = { title: 'Contrat' }

const DECISION = {
  PROPOSEE: 'À reconnaître',
  RECONNUE: 'Reconnue',
  REJETEE: 'Rejetée',
} as const

/**
 * Le marche tel qu'il s'applique aujourd'hui : delai et montant initiaux,
 * puis chaque acte qui les a modifies. C'est la fin contractuelle EN VIGUEUR
 * qui fixe la date a partir de laquelle courent les penalites.
 */
export default async function Contrat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const jour = aujourdhui()
  const base = db()
  const [contrat, planning] = await Promise.all([
    chargerContrat(base, id, jour),
    chargerPlanning(base, id),
  ])
  const { cadre } = contrat
  const projet = planning.projet
  const gere = habilite(utilisateur.role, PEUT_GERER_CONTRAT)
  const statue = habilite(utilisateur.role, PEUT_STATUER_INTEMPERIE)
  const p = cadre.prolongations

  const lignesDelai: [string, string][] = [
    ['Délai initial', `${cadre.dureeInitialeJ} j`],
    ['Avenants', `+${p.avenantsJ} j`],
    ['Ordres de service de prolongation', `+${p.ordresServiceJ} j`],
    [
      cadre.suspensionEnCours ? 'Suspensions, dont une en cours' : 'Suspensions (arrêt à reprise)',
      `+${p.suspensionsJ} j`,
    ],
    [
      `Intempéries reconnues (${cadre.intemperies.reconnuesJ} j) au-delà des ${cadre.intemperies.previsiblesJ} j prévisibles du CCAP`,
      `+${p.intemperiesJ} j`,
    ],
  ]

  const section = 'surface mt-4 overflow-hidden'
  const enTete = 'border-border/70 border-b px-5 py-3.5 text-base font-extrabold'

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[{ libelle: projet.code, href: `/projet/${id}` }, { libelle: 'Contrat' }]}
      />
      <header className="mt-3">
        <TitrePage icone="rapports">Contrat</TitrePage>
        <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
          Fin contractuelle en vigueur :{' '}
          <strong className="text-foreground">{dateLongue(cadre.finContractuelle)}</strong>
          {cadre.finContractuelle !== projet.dateFinContractuelle &&
            ` (initiale : ${dateLongue(projet.dateFinContractuelle)})`}
          . Montant en vigueur :{' '}
          <strong className="text-foreground">{fcfa(cadre.montantXof)}</strong>.{' '}
          <Link href={`/projet/${id}/situations`} className="underline underline-offset-4">
            Situations de travaux
          </Link>
        </p>
      </header>

      <section aria-labelledby="titre-delai" className={section}>
        <h2 id="titre-delai" className={enTete}>
          Délai et montant en vigueur
        </h2>
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <table className="w-full text-sm">
            <tbody>
              {lignesDelai.map(([cle, valeur]) => (
                <tr key={cle} className="border-border/60 border-b">
                  <td className="py-1.5 pr-3">{cle}</td>
                  <td className="chiffres-alignes py-1.5 text-right font-medium whitespace-nowrap">
                    {valeur}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 pr-3 font-extrabold">Délai en vigueur</td>
                <td className="chiffres-alignes py-1.5 text-right font-extrabold">
                  {cadre.dureeJ} j
                </td>
              </tr>
            </tbody>
          </table>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-border/60 border-b">
                <td className="py-1.5 pr-3">Marché initial, hors taxes</td>
                <td className="chiffres-alignes py-1.5 text-right font-medium">
                  {fcfa(cadre.montantInitialXof)}
                </td>
              </tr>
              <tr className="border-border/60 border-b">
                <td className="py-1.5 pr-3">Avenants</td>
                <td className="chiffres-alignes py-1.5 text-right font-medium">
                  {fcfaSigne(cadre.montantAvenantsXof)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 font-extrabold">Montant en vigueur</td>
                <td className="chiffres-alignes py-1.5 text-right font-extrabold">
                  {fcfa(cadre.montantXof)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="titre-intemperies" className={section}>
        <h2 id="titre-intemperies" className={enTete}>
          Intempéries
        </h2>
        <p className="text-muted-foreground px-5 pt-3 text-sm">
          Une journée arrêtée par la météo est proposée depuis le journal validé. Reconnue
          contradictoirement, elle prolonge le délai au-delà des {cadre.intemperies.previsiblesJ}{' '}
          journées réputées prévisibles au CCAP.
        </p>
        {contrat.intemperies.length === 0 ? (
          <p className="text-muted-foreground p-5 text-sm">Aucune intempérie consignée.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {contrat.intemperies.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="chiffres-alignes w-24 font-bold">{dateCourte(i.date)}</span>
                <span className="min-w-0 flex-1">
                  {i.jours} jour{i.jours > 1 ? 's' : ''}
                  {i.lotNom ? ` · ${i.lotNom}` : ''}
                  <span className="text-muted-foreground block text-xs">{i.description}</span>
                </span>
                {i.decision === 'PROPOSEE' && statue ? (
                  <DecisionIntemperie projetId={id} aleaId={i.id} />
                ) : (
                  <span
                    className={
                      i.decision === 'PROPOSEE'
                        ? 'text-etat-retard text-xs font-bold'
                        : 'text-muted-foreground text-xs font-bold'
                    }
                  >
                    {DECISION[i.decision]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titre-avenants" className={section}>
        <h2 id="titre-avenants" className={enTete}>
          Avenants
        </h2>
        {contrat.avenants.length === 0 ? (
          <p className="text-muted-foreground px-5 pt-4 text-sm">Aucun avenant.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {contrat.avenants.map((a) => (
              <li key={a.numero} className="flex flex-wrap gap-3 px-5 py-3 text-sm">
                <span className="w-24 font-bold">n° {a.numero}</span>
                <span className="min-w-0 flex-1">
                  {a.objet}
                  <span className="text-muted-foreground block text-xs">{dateLongue(a.date)}</span>
                </span>
                <span className="chiffres-alignes text-right">
                  {fcfaSigne(a.montantXof)}
                  <span className="text-muted-foreground block text-xs">+{a.delaiJ} j</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {gere && (
          <details className="border-border/70 border-t px-5 py-4">
            <summary className="cursor-pointer text-sm font-bold">Enregistrer un avenant</summary>
            <div className="mt-3">
              <FormulaireAvenant projetId={id} aujourdhui={jour} />
            </div>
          </details>
        )}
      </section>

      <section aria-labelledby="titre-ordres" className={`${section} mb-2`}>
        <h2 id="titre-ordres" className={enTete}>
          Ordres de service
        </h2>
        {contrat.ordres.length === 0 ? (
          <p className="text-muted-foreground px-5 pt-4 text-sm">Aucun ordre de service.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {contrat.ordres.map((o) => (
              <li key={o.numero} className="flex flex-wrap gap-3 px-5 py-3 text-sm">
                <span className="w-24 font-bold">n° {o.numero}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{LIBELLE_ORDRE[o.type]}</span> · {o.objet}
                  <span className="text-muted-foreground block text-xs">{dateLongue(o.date)}</span>
                </span>
                {o.type === 'PROLONGATION' && (
                  <span className="chiffres-alignes text-right">+{o.delaiJ} j</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {gere && (
          <details className="border-border/70 border-t px-5 py-4">
            <summary className="cursor-pointer text-sm font-bold">
              Enregistrer un ordre de service
            </summary>
            <div className="mt-3">
              <FormulaireOrdreService projetId={id} aujourdhui={jour} />
            </div>
          </details>
        )}
      </section>
    </div>
  )
}
