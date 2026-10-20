import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import {
  FormulaireEssais,
  FormulaireFiche,
  LeveeFiche,
  TraitementFiche,
} from '@/components/qualite/formulaires'
import { db } from '@/db/index'
import { chargerPlanning } from '@/db/queries/planning'
import { chargerQualite } from '@/db/queries/qualite'
import { aujourdhui, dateCourte, fcfa, nombre } from '@/lib/format'
import {
  exigerPage,
  habilite,
  PEUT_LEVER_NON_CONFORMITE,
  PEUT_OUVRIR_NON_CONFORMITE,
  PEUT_SAISIR_ESSAIS,
  PEUT_TRAITER_NON_CONFORMITE,
  voitDonneesInternes,
} from '@/lib/garde'
import { LIBELLE_ETAT_BETON, LIBELLE_STATUT_NC } from '@/lib/qualite'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Qualité' }

const TEINTE_ETAT = {
  CONFORME: 'text-etat-acheve',
  NON_CONFORME: 'text-etat-critique',
  RESULTAT_EN_RETARD: 'text-etat-retard',
  A_EXPLIQUER: 'text-etat-retard',
  EN_ATTENTE: 'text-muted-foreground',
  SANS_ESSAI: 'text-muted-foreground',
} as const

/**
 * Dossier qualite : registre des essais du beton avec la conformite de
 * chaque coulage, points d'arret du ferraillage, fiches de non-conformite.
 */
export default async function Qualite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const jour = aujourdhui()
  const base = db()
  const [q, planning] = await Promise.all([
    chargerQualite(base, id, jour, voitDonneesInternes(utilisateur.role)),
    chargerPlanning(base, id),
  ])
  const projet = planning.projet
  const s = q.synthese
  const role = utilisateur.role
  const aEssayer = q.coulages
    .filter((c) => c.conformite.etat !== 'CONFORME' && c.conformite.etat !== 'NON_CONFORME')
    .map((c) => ({
      id: c.id,
      date: c.date,
      libelle: `${dateCourte(c.date)} · ${c.ouvrage} · ${c.classeBeton}, ${nombre(c.volumeM3, 1)} m³`,
    }))

  // Le registre met en avant ce qui demande une action ; les coulages
  // conformes, la grande majorite, restent repliees.
  const conformes = q.coulages.filter(
    (c) => c.conformite.etat === 'CONFORME' && !c.conformite.alertePrecoce,
  )
  const aSuivre = q.coulages.filter((c) => !conformes.includes(c))

  const tuiles: [string, string, string][] = [
    ['Béton coulé', `${nombre(s.volumeM3)} m³`, `${q.coulages.length} coulages validés`],
    [
      'Conformité à 28 jours',
      `${s.conformes} / ${s.conformes + s.nonConformes}`,
      s.nonConformes > 0
        ? `${s.nonConformes} coulage${s.nonConformes > 1 ? 's' : ''} non conforme${s.nonConformes > 1 ? 's' : ''}`
        : 'aucun coulage non conforme',
    ],
    [
      'Résultats attendus',
      String(s.resultatsEnRetard),
      `en retard de saisie, ${s.enAttente} à venir`,
    ],
    [
      'Fiches ouvertes',
      String(s.fichesOuvertes),
      `${s.pointsArretFranchis} point${s.pointsArretFranchis > 1 ? 's' : ''} d’arrêt franchi${s.pointsArretFranchis > 1 ? 's' : ''}`,
    ],
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[{ libelle: projet.code, href: `/projet/${id}` }, { libelle: 'Qualité' }]}
      />
      <header className="mt-3">
        <TitrePage icone="valide">Qualité</TitrePage>
        <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
          Conformité du béton par contrôle d’identité (NF EN 206, annexe B) : chaque résultat de
          prélèvement au moins égal à fck − 4 MPa, et la moyenne à fck + 1 dès deux résultats.
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

      <section aria-labelledby="titre-fiches" className="surface mt-4 overflow-hidden">
        <h2
          id="titre-fiches"
          className="border-border/70 border-b px-5 py-3.5 text-base font-extrabold"
        >
          Non-conformités
        </h2>
        {q.fiches.length === 0 ? (
          <p className="text-muted-foreground p-5 text-sm">Aucune fiche.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {q.fiches.map((f) => (
              <li key={f.id} className="px-5 py-3.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">
                    n° {f.numero} · {f.titre}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-bold',
                      f.statut === 'LEVEE' ? 'text-etat-acheve' : 'text-etat-retard',
                    )}
                  >
                    {LIBELLE_STATUT_NC[f.statut]}
                    {f.leveeLe && ` le ${dateCourte(f.leveeLe)}`}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Constatée le {dateCourte(f.dateConstat)}
                  {f.lotNom && ` · ${f.lotNom}`} · gravité {f.gravite}
                  {f.coutXof !== null && f.coutXof > 0 && ` · reprise ${fcfa(f.coutXof)}`}
                </p>
                <p className="mt-1">{f.constat}</p>
                {f.cause && (
                  <p className="mt-1">
                    <span className="font-bold">Cause : </span>
                    {f.cause}
                  </p>
                )}
                {f.action && (
                  <p>
                    <span className="font-bold">Action : </span>
                    {f.action}
                  </p>
                )}
                {f.statut === 'OUVERTE' && habilite(role, PEUT_TRAITER_NON_CONFORMITE) && (
                  <TraitementFiche projetId={id} ficheId={f.id} aujourdhui={jour} />
                )}
                {f.statut === 'TRAITEE' && habilite(role, PEUT_LEVER_NON_CONFORMITE) && (
                  <LeveeFiche projetId={id} ficheId={f.id} aujourdhui={jour} />
                )}
              </li>
            ))}
          </ul>
        )}
        {habilite(role, PEUT_OUVRIR_NON_CONFORMITE) && (
          <details className="border-border/70 border-t px-5 py-4">
            <summary className="cursor-pointer text-sm font-bold">
              Ouvrir une fiche de non-conformité
            </summary>
            <div className="mt-3">
              <FormulaireFiche
                projetId={id}
                aujourdhui={jour}
                lots={planning.lots.map((l) => ({ id: l.id, nom: l.nom }))}
              />
            </div>
          </details>
        )}
      </section>

      <section aria-labelledby="titre-essais" className="surface mt-4 mb-2 overflow-hidden">
        <h2
          id="titre-essais"
          className="border-border/70 border-b px-5 py-3.5 text-base font-extrabold"
        >
          Registre des essais du béton
        </h2>
        {habilite(role, PEUT_SAISIR_ESSAIS) && (
          <details className="border-border/70 border-b px-5 py-4">
            <summary className="cursor-pointer text-sm font-bold">
              Reporter des résultats du laboratoire
            </summary>
            <div className="mt-3">
              <FormulaireEssais projetId={id} aujourdhui={jour} coulages={aEssayer} />
            </div>
          </details>
        )}
        {aSuivre.length === 0 ? (
          <p className="text-muted-foreground px-5 py-4 text-sm">
            Aucun coulage à suivre : tous les résultats à 28 jours sont conformes.
          </p>
        ) : (
          <TableauCoulages
            coulages={aSuivre}
            legende="Coulages à suivre : résultats attendus, non conformes ou à expliquer"
          />
        )}
        {conformes.length > 0 && (
          <details className="border-border/70 border-t">
            <summary className="cursor-pointer px-5 py-3.5 text-sm font-bold">
              {conformes.length} coulage{conformes.length > 1 ? 's' : ''} conforme
              {conformes.length > 1 ? 's' : ''} à 28 jours
            </summary>
            <TableauCoulages coulages={conformes} legende="Coulages conformes à 28 jours" />
          </details>
        )}
      </section>
    </div>
  )
}

type CoulageQualite = Awaited<ReturnType<typeof chargerQualite>>['coulages'][number]

/** Registre des coulages, avec leurs resultats moyens et leur verdict. */
function TableauCoulages({
  coulages,
  legende,
}: {
  coulages: readonly CoulageQualite[]
  legende: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {legende}, résultats moyens à 7 et 28 jours, verdict de conformité
        </caption>
        <thead className="bg-muted/40">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-bold">
              Coulage
            </th>
            <th scope="col" className="px-3 py-2 text-left font-bold">
              Béton
            </th>
            <th scope="col" className="px-3 py-2 text-right font-bold">
              7 j
            </th>
            <th scope="col" className="px-3 py-2 text-right font-bold">
              28 j
            </th>
            <th scope="col" className="px-3 py-2 text-left font-bold">
              Verdict
            </th>
          </tr>
        </thead>
        <tbody>
          {coulages.map((c) => (
            <tr key={c.id} className="border-border/60 border-t align-top">
              <td className="px-3 py-2">
                <span className="chiffres-alignes font-bold">{dateCourte(c.date)}</span> {c.ouvrage}
                <span className="text-muted-foreground block text-xs">
                  {c.lotNom}
                  {c.ferraillageReceptionne === false && (
                    <span className="text-etat-retard font-bold">
                      {' '}
                      · ferraillage non réceptionné
                    </span>
                  )}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {c.classeBeton}, {nombre(c.volumeM3, 1)} m³
              </td>
              <td className="chiffres-alignes px-3 py-2 text-right whitespace-nowrap">
                {c.moyenne7 === null ? '—' : `${nombre(c.moyenne7, 1)} MPa`}
                {c.conformite.alertePrecoce && (
                  <span className="text-etat-retard block text-xs font-bold">faible</span>
                )}
              </td>
              <td className="chiffres-alignes px-3 py-2 text-right whitespace-nowrap">
                {c.conformite.moyenne28 === null ? '—' : `${nombre(c.conformite.moyenne28, 1)} MPa`}
              </td>
              <td className="px-3 py-2">
                <span className={cn('font-bold', TEINTE_ETAT[c.conformite.etat])}>
                  {LIBELLE_ETAT_BETON[c.conformite.etat]}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {c.conformite.etat === 'EN_ATTENTE' || c.conformite.etat === 'SANS_ESSAI'
                    ? `28 jours le ${dateCourte(c.conformite.echeance)}`
                    : c.conformite.motif}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
