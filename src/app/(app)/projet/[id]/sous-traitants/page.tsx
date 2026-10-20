import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import { DecisionAgrement, FormulaireDemandeAgrement } from '@/components/securite/formulaires'
import { db } from '@/db/index'
import { chargerPlanning } from '@/db/queries/planning'
import { chargerSousTraitants } from '@/db/queries/securite'
import { aujourdhui, dateCourte, fcfa, pourcent } from '@/lib/format'
import {
  exigerPage,
  habilite,
  PEUT_AGREER,
  PEUT_DEMANDER_AGREMENT,
  voitDonneesInternes,
} from '@/lib/garde'
import { LIBELLE_AGREMENT } from '@/lib/securite'

export const metadata: Metadata = { title: 'Sous-traitants' }

/**
 * Sous-traitants du titulaire : agrement, lots confies, situation et
 * presence sur le chantier. Un sous-traitant present avant son agrement est
 * une irregularite que le maitre d'ouvrage peut reprocher au titulaire.
 */
export default async function SousTraitants({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const interne = voitDonneesInternes(utilisateur.role)
  const jour = aujourdhui()
  const base = db()
  const [{ sousTraitants, montantMarcheXof }, planning] = await Promise.all([
    chargerSousTraitants(base, id, interne),
    chargerPlanning(base, id),
  ])
  const projet = planning.projet
  const sousTraite = sousTraitants
    .filter((s) => s.statut !== 'REFUSE')
    .reduce((t, s) => t + s.montantXof, 0)
  const lotsPris = new Set(
    sousTraitants.filter((s) => s.statut !== 'REFUSE').flatMap((s) => s.lots.map((l) => l.id)),
  )
  const agree = habilite(utilisateur.role, PEUT_AGREER)
  const demande = habilite(utilisateur.role, PEUT_DEMANDER_AGREMENT)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[{ libelle: projet.code, href: `/projet/${id}` }, { libelle: 'Sous-traitants' }]}
      />
      <header className="mt-3">
        <TitrePage icone="equipe">Sous-traitants</TitrePage>
        <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
          {sousTraitants.length === 0
            ? 'Aucun sous-traitant déclaré : le titulaire exécute seul.'
            : `${fcfa(sousTraite)} sous-traités, soit ${pourcent(sousTraite / montantMarcheXof)} du marché initial.`}
        </p>
      </header>

      <ul className="mt-4 grid gap-4">
        {sousTraitants.map((s) => (
          <li key={s.id} className="surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-extrabold">{s.raisonSociale}</h2>
                <p className="text-muted-foreground text-sm">
                  {s.specialite} · {s.lots.map((l) => `${l.code} ${l.nom}`).join(', ')}
                </p>
              </div>
              {s.statut === 'DEMANDE' && agree ? (
                <DecisionAgrement projetId={id} sousTraitantId={s.id} aujourdhui={jour} />
              ) : (
                <span
                  className={
                    s.statut === 'AGREE'
                      ? 'text-etat-acheve text-sm font-bold'
                      : 'text-etat-retard text-sm font-bold'
                  }
                >
                  {LIBELLE_AGREMENT[s.statut]}
                  {s.statueLe && ` le ${dateCourte(s.statueLe)}`}
                </span>
              )}
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Contrat, hors taxes</dt>
                <dd className="chiffres-alignes font-bold">{fcfa(s.montantXof)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Exécuté, selon ses lots</dt>
                <dd className="chiffres-alignes font-bold">
                  {fcfa(s.travauxXof)} ({pourcent(s.avancement)})
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paiement</dt>
                <dd className="font-bold">
                  {s.paiementDirect ? 'Direct par le maître d’ouvrage' : 'Par le titulaire'}
                </dd>
              </div>
              {interne && (
                <div>
                  <dt className="text-muted-foreground">Présence</dt>
                  <dd className="chiffres-alignes font-bold">{s.hommesJours} hommes-jours</dd>
                </div>
              )}
            </dl>
            {interne && (s.presencesSansAgrement ?? 0) > 0 && (
              <p className="border-etat-retard/40 bg-etat-retard/10 mt-3 rounded-lg border px-3 py-2 text-sm">
                {s.presencesSansAgrement} journée{(s.presencesSansAgrement ?? 0) > 1 ? 's' : ''}{' '}
                travaillée{(s.presencesSansAgrement ?? 0) > 1 ? 's' : ''} sur ses lots avant
                l’agrément : à régulariser auprès du maître d’ouvrage.
              </p>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              Demande du {dateCourte(s.demandeLe)}
            </p>
          </li>
        ))}
      </ul>

      {demande && (
        <details className="surface mt-4 mb-2 px-5 py-4">
          <summary className="cursor-pointer text-sm font-bold">
            Déclarer un sous-traitant et demander son agrément
          </summary>
          <div className="mt-3">
            <FormulaireDemandeAgrement
              projetId={id}
              aujourdhui={jour}
              lots={planning.lots.map((l) => ({
                id: l.id,
                code: l.code,
                nom: l.nom,
                pris: lotsPris.has(l.id),
              }))}
            />
          </div>
        </details>
      )}
    </div>
  )
}
