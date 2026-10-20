import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import { FormulaireEvenement } from '@/components/securite/formulaires'
import { db } from '@/db/index'
import { chargerPlanning } from '@/db/queries/planning'
import { chargerSecurite, chargerSousTraitants } from '@/db/queries/securite'
import { aujourdhui, dateCourte, nombre } from '@/lib/format'
import { exigerPage, habilite, PEUT_CONSIGNER_SECURITE, voitDonneesInternes } from '@/lib/garde'
import { LIBELLE_EVENEMENT } from '@/lib/securite'

export const metadata: Metadata = { title: 'Sécurité' }

/**
 * Registre de securite du chantier et ses deux taux de reference. Le
 * registre se tient sur le terrain : chef de chantier et conducteur y
 * consignent accidents, presqu'accidents, causeries et visites.
 */
export default async function Securite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const interne = voitDonneesInternes(utilisateur.role)
  const jour = aujourdhui()
  const base = db()
  const [{ evenements, indicateurs: i }, planning, st] = await Promise.all([
    chargerSecurite(base, id, jour, interne),
    chargerPlanning(base, id),
    chargerSousTraitants(base, id, false),
  ])
  const projet = planning.projet
  const consigne = habilite(utilisateur.role, PEUT_CONSIGNER_SECURITE)

  const tuiles: [string, string, string][] = [
    [
      'Jours sans accident avec arrêt',
      String(i.joursSansAccident),
      i.accidentsAvecArret === 0 ? 'depuis l’ordre de service' : 'depuis le dernier',
    ],
    [
      'Taux de fréquence',
      i.tauxFrequence === null ? 'non mesuré' : nombre(i.tauxFrequence, 1),
      `${i.accidentsAvecArret} accident${i.accidentsAvecArret > 1 ? 's' : ''} avec arrêt par million d’heures`,
    ],
    [
      'Taux de gravité',
      i.tauxGravite === null ? 'non mesuré' : nombre(i.tauxGravite, 2),
      `${i.joursArret} jour${i.joursArret > 1 ? 's' : ''} d’arrêt pour mille heures`,
    ],
    [
      'Signaux faibles',
      String(i.signaux + i.accidentsSansArret),
      'presqu’accidents, situations dangereuses, accidents sans arrêt',
    ],
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[{ libelle: projet.code, href: `/projet/${id}` }, { libelle: 'Sécurité' }]}
      />
      <header className="mt-3">
        <TitrePage icone="securite">Sécurité</TitrePage>
        <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
          {i.causeries} causerie{i.causeries > 1 ? 's' : ''} et {i.visites} visite
          {i.visites > 1 ? 's' : ''} du coordonnateur consignées.
          {i.heures !== null &&
            ` Taux calculés sur ${nombre(i.heures)} heures d’ouvriers des relevés validés.`}
        </p>
      </header>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tuiles.map(([titre, valeur, aide]) => (
          <div key={titre} className="surface p-4">
            <dt className="text-muted-foreground text-sm">{titre}</dt>
            <dd className="chiffres-alignes mt-1 text-2xl font-extrabold">{valeur}</dd>
            <dd className="text-muted-foreground mt-1 text-xs">{aide}</dd>
          </div>
        ))}
      </dl>

      {consigne && (
        <details className="surface mt-4 px-5 py-4">
          <summary className="cursor-pointer text-sm font-bold">Consigner un événement</summary>
          <div className="mt-3">
            <FormulaireEvenement
              projetId={id}
              aujourdhui={jour}
              lots={planning.lots.map((l) => ({ id: l.id, nom: l.nom }))}
              sousTraitants={st.sousTraitants
                .filter((s) => s.statut === 'AGREE')
                .map((s) => ({ id: s.id, raisonSociale: s.raisonSociale }))}
            />
          </div>
        </details>
      )}

      <section aria-labelledby="titre-registre" className="surface mt-4 mb-2 overflow-hidden">
        <h2
          id="titre-registre"
          className="border-border/70 border-b px-5 py-3.5 text-base font-extrabold"
        >
          Registre
        </h2>
        {evenements.length === 0 ? (
          <p className="text-muted-foreground p-5 text-sm">Aucun événement consigné.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {evenements.map((e) => {
              const grave = e.type === 'ACCIDENT_AVEC_ARRET' || e.type === 'ACCIDENT_SANS_ARRET'
              return (
                <li key={e.id} className="flex flex-wrap gap-3 px-5 py-3 text-sm">
                  <span className="chiffres-alignes w-24 font-bold">{dateCourte(e.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={grave ? 'text-etat-critique font-bold' : 'font-bold'}>
                      {LIBELLE_EVENEMENT[e.type]}
                    </span>
                    {e.joursArret > 0 && `, ${e.joursArret} j d’arrêt`}
                    {e.participants !== null && `, ${e.participants} participants`}
                    <span className="block">{e.description}</span>
                    {(e.lotNom || e.sousTraitant) && (
                      <span className="text-muted-foreground block text-xs">
                        {[e.lotNom, e.sousTraitant].filter(Boolean).join(' · ')}
                      </span>
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
