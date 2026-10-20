'use client'

/**
 * Formulaire de saisie journaliere, en etapes.
 *
 * Concu pour le telephone d'abord : une colonne, une etape a l'ecran, les
 * boutons de navigation fixes en bas, a portee de pouce. Chaque etape est
 * validee par le schema partage avec le serveur avant de passer a la
 * suivante ; l'utilisateur corrige ses erreurs la ou il les a faites, pas a
 * la fin.
 *
 * Le composant ne porte aucune regle metier. La conversion des champs est
 * dans `releve-formulaire.ts`, la validation dans `releve.ts`, le controle
 * des quantites dans `compute/saisie.ts`, l'envoi dans `hors-ligne/`.
 */

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { controlerQuantite } from '@/db/compute/saisie'
import type { ReferentielSaisie, TacheSaisie } from '@/db/queries/saisie'
import { typeAlea } from '@/db/schema'
import { dateCourte, dateLongue, fcfa, LIBELLE_UNITE, libelleMeteo, quantite } from '@/lib/format'
import {
  cleBrouillon,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
  type BrouillonFormulaire,
} from '@/lib/hors-ligne/brouillon'
import type { IssueEnvoi } from '@/lib/hors-ligne/envoi'
import { Icone } from '@/lib/icones'
import {
  ETAPES,
  erreursParChamp,
  LIBELLE_GRAVITE,
  LIBELLE_TYPE_ALEA,
  lireNombre,
  ReleveSaisi,
  type CleEtape,
} from '@/lib/releve'
import {
  heuresProposees,
  nouvelIdentifiant,
  versReleve,
  type EtatFormulaire,
  type EtatQuantite,
} from '@/lib/releve-formulaire'
import { cn } from '@/lib/utils'
import { teinteSerie } from '@/lib/viz'
import type { PhotoAEnvoyer } from '@/lib/photos/televersement'
import { Bascule, Champ, ChampNombre, CLASSE_CHAMP } from './champs'
import { EtapeJournal } from './etape-journal'
import { EtapePhotos } from './etape-photos'

export type ModeFormulaire = 'creation' | 'modification' | 'rectification'

type Proprietes = {
  referentiel: ReferentielSaisie
  initial: EtatFormulaire
  mode: ModeFormulaire
  /** Date du jour cote serveur, borne superieure de la date du releve. */
  aujourdhui: string
  /**
   * Envoi du releve analyse. Fourni par la page : saisie directe ou file hors
   * ligne pour une creation, action de rectification pour une rectification.
   */
  envoyer: (releve: ReleveSaisi, photos: PhotoAEnvoyer[]) => Promise<IssueEnvoi>
  /**
   * Sauvegarde locale du formulaire en cours, pour l'auteur donne. Absente,
   * rien n'est garde : c'est le cas de la rectification, qui se fait en ligne.
   */
  brouillon?: { utilisateurId: string }
}

/**
 * Les etapes du schema, plus deux etapes sans schema : les photos, qui ne
 * font pas partie du releve mais l'accompagnent, et le recapitulatif final.
 */
type Etape = CleEtape | 'photos' | 'envoi'
const CLES = ETAPES.map((e) => e.cle)
const ORDRE: Etape[] = [
  ...CLES.slice(0, CLES.indexOf('quantites') + 1),
  'photos',
  ...CLES.slice(CLES.indexOf('quantites') + 1),
  'envoi',
]
const TITRES: Record<Etape, string> = {
  ...(Object.fromEntries(ETAPES.map((e) => [e.cle, e.titre])) as Record<CleEtape, string>),
  photos: 'Photos',
  envoi: 'Récapitulatif et envoi',
}

/**
 * Chaque etape pose une question, en francais de chantier. Le titre technique
 * reste annonce aux lecteurs d'ecran et sert de repere au-dessus.
 */
const QUESTIONS: Record<Etape, string> = {
  dateLot: 'Quel jour, et sur quel lot ?',
  meteo: 'Quel temps a-t-il fait ?',
  moyens: 'Qui était sur le chantier ?',
  quantites: 'Qu’avez-vous réalisé aujourd’hui ?',
  photos: 'Une photo de la journée ?',
  observations: 'Quelque chose à signaler ? Un coulage, une livraison ?',
  alea: 'Un imprévu est-il survenu ?',
  envoi: 'Tout est bon ? On envoie.',
}

export function FormulaireReleve({
  referentiel,
  initial,
  mode,
  aujourdhui,
  envoyer,
  brouillon,
}: Proprietes) {
  const router = useRouter()
  const indiceDepart = mode === 'creation' ? 0 : 1
  // Un nouveau releve recoit son identifiant ici, dans le navigateur, et non
  // de la page : voir `nouvelIdentifiant`.
  const [etat, setEtat] = useState<EtatFormulaire>(() =>
    mode === 'creation' ? { ...initial, id: nouvelIdentifiant() } : initial,
  )
  const [indice, setIndice] = useState(indiceDepart)
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<PhotoAEnvoyer[]>([])
  const [enCours, demarrer] = useTransition()
  const [meteo, setMeteo] = useState<'inutile' | 'chargement' | 'chargee' | 'indisponible'>(
    initial.precipitationsMm === '' ? 'inutile' : 'chargee',
  )

  /* --- Brouillon local ----------------------------------------------------- */

  const cle = cleBrouillon(referentiel.projet.id, mode === 'creation' ? null : initial.id)
  const auteur = brouillon?.utilisateurId ?? null
  /** Brouillon trouve au chargement, en attente de la decision de l'utilisateur. */
  const [reprise, setReprise] = useState<BrouillonFormulaire | null>(null)
  /** Faux tant que la recherche d'un brouillon n'a pas abouti. */
  const [pret, setPret] = useState(auteur === null)

  useEffect(() => {
    if (auteur === null) return
    let actif = true
    void lireBrouillon(cle, auteur).then((b) => {
      if (!actif) return
      setReprise(b)
      setPret(true)
    })
    return () => {
      actif = false
    }
  }, [cle, auteur])

  /*
   * Sauvegarde a chaque modification, une fois la question de la reprise
   * tranchee : sans quoi un formulaire vierge ecraserait le brouillon avant
   * meme que l'utilisateur ait pu le reprendre. Un formulaire encore intact
   * n'est pas garde.
   */
  const intact =
    indice === indiceDepart &&
    photos.length === 0 &&
    JSON.stringify({ ...etat, id: '' }) === JSON.stringify({ ...initial, id: '' })
  useEffect(() => {
    if (auteur === null || !pret || reprise !== null || intact) return
    const minuterie = window.setTimeout(() => {
      void ecrireBrouillon({
        cle,
        utilisateurId: auteur,
        etat,
        indice,
        photos,
        majLe: Date.now(),
      })
    }, 300)
    return () => window.clearTimeout(minuterie)
  }, [auteur, pret, reprise, intact, cle, etat, indice, photos])

  function reprendre(b: BrouillonFormulaire) {
    setEtat(b.etat)
    setIndice(Math.min(Math.max(b.indice, indiceDepart), ORDRE.length - 1))
    setPhotos(b.photos)
    setMeteo(b.etat.precipitationsMm === '' ? 'inutile' : 'chargee')
    setReprise(null)
  }

  function recommencer() {
    void effacerBrouillon(cle)
    setReprise(null)
  }

  /*
   * Le bouton retour du telephone revient a l'etape precedente au lieu de
   * quitter le formulaire : chaque etape franchie est une entree
   * d'historique, sur la meme adresse.
   */
  useEffect(() => {
    function surRetour(e: PopStateEvent) {
      const cible = (e.state as { etapeReleve?: unknown } | null)?.etapeReleve
      setErreurs({})
      setIndice(typeof cible === 'number' ? cible : indiceDepart)
    }
    window.addEventListener('popstate', surRetour)
    return () => window.removeEventListener('popstate', surRetour)
  }, [indiceDepart])

  const etape = ORDRE[indice] as Etape
  const lot = referentiel.lots.find((l) => l.id === etat.lotId)
  const tachesDuLot = useMemo(
    () => referentiel.taches.filter((t) => t.lotId === etat.lotId),
    [referentiel.taches, etat.lotId],
  )

  function modifier<K extends keyof EtatFormulaire>(cle: K, valeur: EtatFormulaire[K]) {
    setEtat((e) => ({ ...e, [cle]: valeur }))
  }

  /* --- Prechargement de la meteo ------------------------------------------ */

  /**
   * Declenche en entrant dans l'etape meteo, et non par un effet : c'est
   * l'action de l'utilisateur qui appelle la donnee. Une meteo corrigee sur le
   * terrain n'est jamais ecrasee, et hors ligne on ne tente rien.
   */
  function chargerMeteo() {
    if (etat.meteoCorrigee || meteo === 'chargement') return
    if (meteo === 'chargee' && etat.precipitationsMm !== '') return
    if (!navigator.onLine) {
      setMeteo('indisponible')
      return
    }
    setMeteo('chargement')
    fetch(`/api/projet/${referentiel.projet.id}/meteo?date=${etat.date}`)
      .then((r) => (r.ok ? r.json() : { disponible: false }))
      .then((m: { disponible: boolean } & Record<string, number>) => {
        if (!m.disponible) return setMeteo('indisponible')
        setEtat((e) => ({
          ...e,
          meteoCode: String(m['meteoCode']),
          temperatureC: String(m['temperatureC']).replace('.', ','),
          precipitationsMm: String(m['precipitationsMm']).replace('.', ','),
          rafalesKmh: String(m['rafalesKmh']).replace('.', ','),
        }))
        setMeteo('chargee')
      })
      .catch(() => setMeteo('indisponible'))
  }

  /* --- Navigation ---------------------------------------------------------- */

  function validerEtape(cle: Etape): boolean {
    if (cle === 'envoi' || cle === 'photos') return true
    const schema = ETAPES.find((e) => e.cle === cle)?.schema
    if (!schema) return true
    const r = schema.safeParse(versReleve(etat, false))
    if (r.success) {
      setErreurs({})
      return true
    }
    setErreurs(erreursParChamp(r.error))
    return false
  }

  function suivant() {
    if (!validerEtape(etape)) {
      // L'erreur peut etre hors de l'ecran, sur la cinquieme ligne de
      // quantites : on y amene l'utilisateur au lieu de ne rien faire.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }
    if (ORDRE[indice + 1] === 'meteo') chargerMeteo()
    const prochain = Math.min(indice + 1, ORDRE.length - 1)
    window.history.pushState({ ...window.history.state, etapeReleve: prochain }, '')
    setIndice(prochain)
    window.scrollTo({ top: 0 })
  }

  function precedent() {
    setErreurs({})
    const courante = (window.history.state as { etapeReleve?: unknown } | null)?.etapeReleve
    if (typeof courante === 'number' && courante === indice) {
      // L'etape courante a sa propre entree : le retour du navigateur ramene a
      // la precedente, et l'historique reste aligne sur l'ecran.
      window.history.back()
    } else {
      setIndice((i) => Math.max(i - 1, indiceDepart))
    }
    window.scrollTo({ top: 0 })
  }

  /* --- Envoi --------------------------------------------------------------- */

  function terminer(soumettre: boolean) {
    // La revision horodate cette version : le serveur ignore une version plus
    // ancienne qui arriverait apres elle, par la file hors ligne par exemple.
    const brut = versReleve(etat, soumettre) as Record<string, unknown>
    const analyse = ReleveSaisi.safeParse({ ...brut, revision: Date.now() })
    if (!analyse.success) {
      const e = erreursParChamp(analyse.error)
      setErreurs(e)
      // Retour a la premiere etape fautive.
      const fautive = ETAPES.findIndex(
        (et) => !et.schema.safeParse(versReleve(etat, false)).success,
      )
      // L'indice du schema n'est pas celui de l'ecran : l'etape des photos
      // s'intercale entre les quantites et les observations.
      if (fautive >= 0) setIndice(ORDRE.indexOf((ETAPES[fautive] as (typeof ETAPES)[number]).cle))
      toast.error('Le relevé est incomplet : corriger les champs signalés.')
      return
    }

    demarrer(async () => {
      const issue = await envoyer(analyse.data, photos)
      // Enregistre ou mis en file : la saisie est en lieu sur, le brouillon
      // local n'a plus lieu d'etre.
      if (issue.issue !== 'refuse') await effacerBrouillon(cle)
      if (issue.issue === 'enregistre') {
        toast.success(
          mode === 'rectification'
            ? 'Relevé rectifié et validé.'
            : soumettre
              ? 'Relevé soumis à la validation.'
              : 'Brouillon enregistré.',
        )
        // Une soumission merite des felicitations, affichees par la fiche.
        const fete = soumettre && mode !== 'rectification' ? '?envoye=1' : ''
        router.push(`/projet/${referentiel.projet.id}/releve/${issue.releveId}${fete}`)
        router.refresh()
      } else if (issue.issue === 'reporte') {
        toast.info(issue.message)
        router.push(`/projet/${referentiel.projet.id}/releve`)
      } else {
        if (issue.champs) setErreurs(issue.champs)
        toast.error(issue.message)
      }
    })
  }

  /* --- Rendu --------------------------------------------------------------- */

  return (
    <div className="pb-28">
      {reprise !== null && (
        <section
          aria-label="Relevé non envoyé"
          className="border-etat-retard/50 bg-card mb-5 rounded-2xl border-2 p-4"
        >
          <p className="font-bold">Un relevé commencé n’a pas été envoyé.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Journée du {dateCourte(reprise.etat.date)}, arrêté à l’étape{' '}
            {Math.min(reprise.indice + 1, ORDRE.length)} sur {ORDRE.length}
            {reprise.photos.length > 0
              ? `, avec ${reprise.photos.length} photo${reprise.photos.length > 1 ? 's' : ''}`
              : ''}
            . Il est gardé sur ce téléphone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" className="h-11 flex-[2]" onClick={() => reprendre(reprise)}>
              Reprendre
            </Button>
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={recommencer}>
              Recommencer
            </Button>
          </div>
        </section>
      )}

      <EnTeteEtapes indice={indice} mode={mode} />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (etape === 'envoi') return
          suivant()
        }}
        className="mt-5"
      >
        <fieldset className="space-y-5" disabled={enCours}>
          <legend className="sr-only">{TITRES[etape]}</legend>

          {erreurs[''] && (
            <p role="alert" className="text-destructive text-sm">
              {erreurs['']}
            </p>
          )}

          {etape === 'dateLot' && (
            <EtapeDateLot
              etat={etat}
              referentiel={referentiel}
              aujourdhui={aujourdhui}
              erreurs={erreurs}
              surDate={(d) => {
                modifier('date', d)
                setMeteo('inutile')
              }}
              surLot={(l) => {
                // Les quantites saisies appartiennent a l'ancien lot.
                setEtat((e) => ({ ...e, lotId: l, quantites: {} }))
              }}
            />
          )}

          {etape === 'meteo' && (
            <EtapeMeteo etat={etat} erreurs={erreurs} meteo={meteo} modifier={modifier} />
          )}

          {etape === 'moyens' && <EtapeMoyens etat={etat} erreurs={erreurs} modifier={modifier} />}

          {etape === 'quantites' && (
            <EtapeQuantites
              etat={etat}
              taches={tachesDuLot}
              erreurs={erreurs}
              surQuantite={(ligneId, q) =>
                setEtat((e) => ({ ...e, quantites: { ...e.quantites, [ligneId]: q } }))
              }
            />
          )}

          {etape === 'photos' && (
            <EtapePhotos releveId={etat.id} photos={photos} surChangement={setPhotos} />
          )}

          {etape === 'observations' && (
            <>
              <Champ
                libelle="Observations"
                aide="Faits marquants, visites, réserves, consignes. Facultatif."
                erreur={erreurs['observations']}
              >
                {(a) => (
                  <textarea
                    {...a}
                    rows={7}
                    value={etat.observations}
                    onChange={(e) => modifier('observations', e.target.value)}
                    className={cn(CLASSE_CHAMP, 'h-auto py-2.5 leading-relaxed')}
                  />
                )}
              </Champ>
              <EtapeJournal
                coulages={etat.coulages ?? []}
                livraisons={etat.livraisons ?? []}
                journeeTravaillee={etat.journeeTravaillee}
                erreurs={erreurs}
                surCoulages={(c) => modifier('coulages', c)}
                surLivraisons={(l) => modifier('livraisons', l)}
              />
            </>
          )}

          {etape === 'alea' && <EtapeAlea etat={etat} erreurs={erreurs} modifier={modifier} />}

          {etape === 'envoi' && (
            <Recapitulatif
              etat={etat}
              referentiel={referentiel}
              lotNom={lot?.nom ?? ''}
              photos={photos.length}
            />
          )}
        </fieldset>

        <nav
          aria-label="Navigation entre les étapes"
          className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-20 border-t px-4 py-3 backdrop-blur md:left-[15.5rem]"
        >
          <div className="mx-auto flex max-w-xl gap-2">
            {indice > (mode === 'creation' ? 0 : 1) && (
              <Button
                type="button"
                variant="outline"
                className="h-12 flex-1 text-base"
                onClick={precedent}
                disabled={enCours}
              >
                <Icone.precedent className="size-4" />
                Précédent
              </Button>
            )}
            {etape !== 'envoi' ? (
              <Button type="submit" className="h-12 flex-[2] text-base" disabled={enCours}>
                Suivant
                <Icone.suivant className="size-4" />
              </Button>
            ) : mode === 'rectification' ? (
              <Button
                type="button"
                className="h-12 flex-[2] text-base"
                disabled={enCours}
                onClick={() => terminer(true)}
              >
                <Icone.valide className="size-4" />
                Rectifier et valider
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 flex-1 text-base"
                  disabled={enCours}
                  onClick={() => terminer(false)}
                >
                  Brouillon
                </Button>
                <Button
                  type="button"
                  className="h-12 flex-[2] text-base"
                  disabled={enCours}
                  onClick={() => terminer(true)}
                >
                  <Icone.envoyer className="size-4" />
                  Soumettre
                </Button>
              </>
            )}
          </div>
        </nav>
      </form>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* En-tete                                                                    */
/* -------------------------------------------------------------------------- */

function EnTeteEtapes({ indice, mode }: { indice: number; mode: ModeFormulaire }) {
  const etape = ORDRE[indice] as Etape
  const part = (indice + 1) / ORDRE.length
  return (
    <div>
      {/* Barre de progression epaisse, a reflet : on voit d'un coup d'oeil le
          chemin parcouru, et elle avance a chaque etape. */}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={ORDRE.length}
        aria-valuenow={indice + 1}
        aria-label={`Étape ${indice + 1} sur ${ORDRE.length}`}
        className="bg-muted h-4 overflow-hidden rounded-full"
      >
        <div
          className="bg-marque relative h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${part * 100}%` }}
        >
          <span
            aria-hidden
            className="bg-card/35 absolute inset-x-2 top-[3px] h-[3px] rounded-full"
          />
        </div>
      </div>
      <p className="text-muted-foreground mt-4 text-sm font-bold">
        {TITRES[etape]} · étape {indice + 1} sur {ORDRE.length}
        {mode === 'rectification' && ' · rectification'}
      </p>
      <h2 key={etape} className="entree mt-1 text-[1.625rem] leading-tight font-extrabold">
        {QUESTIONS[etape]}
      </h2>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Etapes                                                                     */
/* -------------------------------------------------------------------------- */

type Modifier = <K extends keyof EtatFormulaire>(cle: K, valeur: EtatFormulaire[K]) => void

function EtapeDateLot({
  etat,
  referentiel,
  aujourdhui,
  erreurs,
  surDate,
  surLot,
}: {
  etat: EtatFormulaire
  referentiel: ReferentielSaisie
  aujourdhui: string
  erreurs: Record<string, string>
  surDate: (d: string) => void
  surLot: (l: string) => void
}) {
  return (
    <>
      <Champ libelle="Date de la journée" erreur={erreurs['date']}>
        {(a) => (
          <input
            {...a}
            type="date"
            value={etat.date}
            min={referentiel.projet.dateOrdreService}
            max={aujourdhui}
            onChange={(e) => surDate(e.target.value)}
            className={CLASSE_CHAMP}
          />
        )}
      </Champ>

      <fieldset className="space-y-1.5">
        <legend className="mb-2 text-sm font-bold">Lot</legend>
        <div className="grid gap-3">
          {referentiel.lots.map((l) => (
            <label
              key={l.id}
              className={cn(
                'relief has-[:focus-visible]:ring-ring/50 flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-2.5 transition-colors has-[:focus-visible]:ring-3',
                etat.lotId === l.id
                  ? 'border-marque bg-marque-douce [--relief:var(--marque)]'
                  : 'border-input bg-card hover:bg-muted [--relief:var(--input)]',
              )}
            >
              <input
                type="radio"
                name="lot"
                value={l.id}
                checked={etat.lotId === l.id}
                onChange={() => surLot(l.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-[5px]"
                style={{ background: teinteSerie(l.rangCouleur) }}
              />
              <span className="text-muted-foreground font-mono text-xs">{l.code}</span>
              <span className="flex-1 text-base font-bold">{l.nom}</span>
              <span
                aria-hidden
                className={cn(
                  'grid size-6 place-items-center rounded-full border-2 transition-colors',
                  etat.lotId === l.id
                    ? 'border-marque bg-marque text-primary-foreground'
                    : 'border-input',
                )}
              >
                {etat.lotId === l.id && <Icone.valide className="size-4" strokeWidth={2.5} />}
              </span>
            </label>
          ))}
        </div>
        {erreurs['lotId'] && (
          <p role="alert" className="text-destructive text-sm">
            Choisir le lot du relevé.
          </p>
        )}
      </fieldset>
    </>
  )
}

function EtapeMeteo({
  etat,
  erreurs,
  meteo,
  modifier,
}: {
  etat: EtatFormulaire
  erreurs: Record<string, string>
  meteo: 'inutile' | 'chargement' | 'chargee' | 'indisponible'
  modifier: Modifier
}) {
  const corriger =
    <K extends 'temperatureC' | 'precipitationsMm' | 'rafalesKmh'>(cle: K) =>
    (v: string) => {
      modifier(cle, v)
      if (meteo === 'chargee') modifier('meteoCorrigee', true)
    }
  const code = lireNombre(etat.meteoCode)

  return (
    <>
      <div className="border-border/80 bg-muted/40 flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Icone.meteo className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p>
          {meteo === 'chargement' && 'Chargement de la météo du jour…'}
          {meteo === 'chargee' &&
            (etat.meteoCorrigee
              ? 'Météo corrigée sur le terrain : la valeur saisie sera conservée.'
              : `${libelleMeteo(code)}, valeurs relevées par Open-Meteo. Les corriger si le terrain dit autre chose.`)}
          {meteo === 'indisponible' &&
            'Météo indisponible pour le moment. La saisir à la main, ou laisser vide : elle sera complétée la nuit.'}
          {meteo === 'inutile' && 'La météo sera proposée pour la date choisie.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ChampNombre
          libelle="Pluie"
          unite="mm"
          valeur={etat.precipitationsMm}
          surChangement={corriger('precipitationsMm')}
          erreur={erreurs['precipitationsMm']}
        />
        <ChampNombre
          libelle="Température maxi"
          unite="°C"
          valeur={etat.temperatureC}
          surChangement={corriger('temperatureC')}
          erreur={erreurs['temperatureC']}
        />
        <ChampNombre
          libelle="Rafales"
          unite="km/h"
          valeur={etat.rafalesKmh}
          surChangement={corriger('rafalesKmh')}
          erreur={erreurs['rafalesKmh']}
        />
      </div>
    </>
  )
}

function EtapeMoyens({
  etat,
  erreurs,
  modifier,
}: {
  etat: EtatFormulaire
  erreurs: Record<string, string>
  modifier: Modifier
}) {
  const proposees = heuresProposees(etat.effectifOuvriers)
  return (
    <>
      <Bascule
        libelle="La journée a-t-elle été travaillée ?"
        valeur={etat.journeeTravaillee}
        surChangement={(v) => modifier('journeeTravaillee', v)}
        oui="Oui"
        non="Non, arrêt"
      />

      {!etat.journeeTravaillee && (
        <Champ
          libelle="Cause de l’arrêt"
          aide="Pluie, jour férié, rupture d’approvisionnement…"
          erreur={erreurs['motifArret']}
        >
          {(a) => (
            <input
              {...a}
              type="text"
              value={etat.motifArret}
              onChange={(e) => modifier('motifArret', e.target.value)}
              className={CLASSE_CHAMP}
            />
          )}
        </Champ>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ChampNombre
          libelle="Ouvriers"
          decimal={false}
          valeur={etat.effectifOuvriers}
          surChangement={(v) => modifier('effectifOuvriers', v)}
          erreur={erreurs['effectifOuvriers']}
        />
        <ChampNombre
          libelle="Encadrement"
          decimal={false}
          valeur={etat.effectifEncadrement}
          surChangement={(v) => modifier('effectifEncadrement', v)}
          erreur={erreurs['effectifEncadrement']}
        />
      </div>

      <ChampNombre
        libelle="Heures travaillées"
        aide="Total des heures de tous les ouvriers de la journée."
        unite="h"
        valeur={etat.heuresTravaillees}
        surChangement={(v) => modifier('heuresTravaillees', v)}
        erreur={erreurs['heuresTravaillees']}
      />
      {proposees !== '' && etat.heuresTravaillees !== proposees && (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={() => modifier('heuresTravaillees', proposees)}
        >
          Journée normale : {proposees} h
        </Button>
      )}
    </>
  )
}

/**
 * Une tache est proposee d'emblee si elle est entamee sans etre soldee, ou
 * si sa fenetre prevue encadre la date du releve a quinze jours pres. Les
 * autres restent accessibles, repliees : un chantier reel ne suit jamais
 * exactement son planning.
 */
function tacheActive(t: TacheSaisie, date: string): boolean {
  const entamee = t.lignes.some((l) => l.cumulValide + l.cumulEnAttente > 0)
  const soldee = t.lignes.every((l) => l.cumulValide + l.cumulEnAttente >= l.quantitePrevue)
  if (entamee && !soldee) return true
  const marge = 15 * 86_400_000
  const jour = Date.parse(date)
  return (
    Date.parse(t.dateDebutPrevue) - marge <= jour && jour <= Date.parse(t.dateFinPrevue) + marge
  )
}

function EtapeQuantites({
  etat,
  taches,
  erreurs,
  surQuantite,
}: {
  etat: EtatFormulaire
  taches: TacheSaisie[]
  erreurs: Record<string, string>
  surQuantite: (ligneId: string, q: EtatQuantite) => void
}) {
  if (!etat.journeeTravaillee) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        Journée déclarée non travaillée : aucune quantité à saisir.
      </p>
    )
  }

  const actives = taches.filter((t) => tacheActive(t, etat.date) || saisieSur(t, etat))
  const autres = taches.filter((t) => !actives.includes(t))

  /** Les erreurs du schema sont indexees par rang dans la liste envoyee. */
  const ordreEnvoye = Object.entries(etat.quantites)
    .filter(([, q]) => q.quantite.trim() !== '')
    .map(([id]) => id)
  const erreurLigne = (ligneId: string) => {
    const rang = ordreEnvoye.indexOf(ligneId)
    return rang < 0 ? undefined : erreurs[`quantites.${rang}.quantite`]
  }

  const bloc = (t: TacheSaisie) => (
    <section key={t.id} className="border-border/80 rounded-xl border p-3">
      <h3 className="text-sm font-bold">
        <span className="text-muted-foreground mr-2 font-mono text-xs">{t.codeWbs}</span>
        {t.nom}
      </h3>
      <p className="text-muted-foreground mt-0.5 text-xs">
        Prévu du {dateCourte(t.dateDebutPrevue)} au {dateCourte(t.dateFinPrevue)}
      </p>
      <div className="mt-3 space-y-4">
        {t.lignes.map((l) => {
          const saisie = etat.quantites[l.id] ?? { quantite: '', commentaire: '' }
          const c = controlerQuantite({
            quantitePrevue: l.quantitePrevue,
            cumulValide: l.cumulValide,
            cumulEnAttente: l.cumulEnAttente,
            saisie: lireNombre(saisie.quantite),
          })
          const unite = LIBELLE_UNITE[l.unite]
          return (
            <div key={l.id} className="space-y-1">
              <ChampNombre
                libelle={l.designation}
                unite={unite}
                valeur={saisie.quantite}
                surChangement={(v) => surQuantite(l.id, { ...saisie, quantite: v })}
                erreur={erreurLigne(l.id)}
                aide={`Prévu ${quantite(l.quantitePrevue, l.unite)} · réalisé ${quantite(
                  l.cumulValide,
                  l.unite,
                )}${l.cumulEnAttente > 0 ? ` (+ ${quantite(l.cumulEnAttente, l.unite)} en attente)` : ''} · reste ${quantite(c.resteAvant, l.unite)}`}
              />
              {c.niveau === 'depassement' && (
                <p
                  role="status"
                  className="[&>svg]:text-etat-retard flex items-start gap-1.5 text-sm"
                >
                  <Icone.alerte className="mt-0.5 size-4 shrink-0" />
                  Dépasse la quantité prévue de {quantite(c.depassement, l.unite)}. Vérifier la
                  saisie ; si elle est juste, le préciser en commentaire.
                </p>
              )}
              {c.niveau === 'solde' && (
                <p
                  role="status"
                  className="[&>svg]:text-etat-acheve flex items-center gap-1.5 text-sm"
                >
                  <Icone.valide className="size-4 shrink-0" />
                  Cette saisie solde la ligne.
                </p>
              )}
              {(c.niveau === 'depassement' || saisie.commentaire !== '') && (
                <input
                  type="text"
                  aria-label={`Commentaire sur ${l.designation}`}
                  placeholder="Commentaire"
                  value={saisie.commentaire}
                  onChange={(e) => surQuantite(l.id, { ...saisie, commentaire: e.target.value })}
                  className={cn(CLASSE_CHAMP, 'h-10 text-sm')}
                />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )

  return (
    <>
      {erreurs['quantites'] && (
        <p role="alert" className="text-destructive text-sm">
          {erreurs['quantites']}
        </p>
      )}
      {actives.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Aucune tâche de ce lot n’est en cours à cette date. Les tâches du lot sont listées
          ci-dessous.
        </p>
      )}
      {actives.map(bloc)}
      {autres.length > 0 && (
        <details className="group" open={actives.length === 0}>
          <summary className="text-muted-foreground flex min-h-12 cursor-pointer items-center gap-2 text-sm">
            <Icone.deplier className="size-4 transition-transform group-open:rotate-90" />
            Autres tâches du lot ({autres.length})
          </summary>
          <div className="mt-2 space-y-3">{autres.map(bloc)}</div>
        </details>
      )}
    </>
  )
}

function saisieSur(t: TacheSaisie, etat: EtatFormulaire): boolean {
  return t.lignes.some((l) => (etat.quantites[l.id]?.quantite ?? '').trim() !== '')
}

function EtapeAlea({
  etat,
  erreurs,
  modifier,
}: {
  etat: EtatFormulaire
  erreurs: Record<string, string>
  modifier: Modifier
}) {
  const alea = etat.alea
  const changer = <K extends keyof EtatFormulaire['alea']>(cle: K, v: EtatFormulaire['alea'][K]) =>
    modifier('alea', { ...alea, [cle]: v })

  return (
    <>
      <Bascule
        libelle="Un aléa est-il survenu ?"
        valeur={etat.aleaDeclare}
        surChangement={(v) => modifier('aleaDeclare', v)}
        oui="Oui, le déclarer"
        non="Non"
      />
      {etat.aleaDeclare && (
        <>
          <Champ libelle="Nature" erreur={erreurs['alea.type']}>
            {(a) => (
              <select
                {...a}
                value={alea.type}
                onChange={(e) => changer('type', e.target.value as EtatFormulaire['alea']['type'])}
                className={CLASSE_CHAMP}
              >
                {typeAlea.enumValues.map((t) => (
                  <option key={t} value={t}>
                    {LIBELLE_TYPE_ALEA[t]}
                  </option>
                ))}
              </select>
            )}
          </Champ>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Gravité</legend>
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={alea.gravite === String(g)}
                  onClick={() => changer('gravite', String(g))}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center rounded-lg border text-xs',
                    alea.gravite === String(g)
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-input hover:bg-accent',
                  )}
                >
                  <span className="text-base font-semibold">{g}</span>
                  {LIBELLE_GRAVITE[g]}
                </button>
              ))}
            </div>
          </fieldset>

          <Champ libelle="Description" erreur={erreurs['alea.description']}>
            {(a) => (
              <textarea
                {...a}
                rows={3}
                value={alea.description}
                onChange={(e) => changer('description', e.target.value)}
                className={cn(CLASSE_CHAMP, 'h-auto py-2.5')}
              />
            )}
          </Champ>

          <div className="grid grid-cols-2 gap-3">
            <ChampNombre
              libelle="Impact sur le délai"
              unite="j"
              decimal={false}
              valeur={alea.impactDelaiJ}
              surChangement={(v) => changer('impactDelaiJ', v)}
              erreur={erreurs['alea.impactDelaiJ']}
            />
            <ChampNombre
              libelle="Coût estimé"
              unite="FCFA"
              decimal={false}
              valeur={alea.impactCoutXof}
              surChangement={(v) => changer('impactCoutXof', v)}
              erreur={erreurs['alea.impactCoutXof']}
            />
          </div>
        </>
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Recapitulatif                                                              */
/* -------------------------------------------------------------------------- */

function Recapitulatif({
  etat,
  referentiel,
  lotNom,
  photos,
}: {
  etat: EtatFormulaire
  referentiel: ReferentielSaisie
  lotNom: string
  photos: number
}) {
  const lignes = new Map(referentiel.taches.flatMap((t) => t.lignes.map((l) => [l.id, l])))
  const saisies = Object.entries(etat.quantites).filter(([, q]) => q.quantite.trim() !== '')
  const coutAlea = lireNombre(etat.alea.impactCoutXof) ?? 0

  return (
    <dl className="divide-border/70 divide-y rounded-xl border text-sm">
      <Ligne terme="Journée">{dateLongue(etat.date)}</Ligne>
      <Ligne terme="Lot">{lotNom}</Ligne>
      <Ligne terme="Météo">
        {etat.precipitationsMm === ''
          ? 'Non renseignée'
          : `${etat.precipitationsMm} mm de pluie, ${etat.temperatureC} °C`}
        {etat.meteoCorrigee && ' (corrigée)'}
      </Ligne>
      <Ligne terme="Activité">
        {etat.journeeTravaillee
          ? `${etat.effectifOuvriers || 0} ouvriers, ${etat.effectifEncadrement || 0} encadrants, ${etat.heuresTravaillees || 0} h`
          : `Arrêt : ${etat.motifArret}`}
      </Ligne>
      <Ligne terme="Quantités">
        {saisies.length === 0 ? (
          'Aucune'
        ) : (
          <ul className="space-y-0.5">
            {saisies.map(([id, q]) => {
              const l = lignes.get(id)
              return (
                <li key={id}>
                  {l?.designation} : {q.quantite} {l ? LIBELLE_UNITE[l.unite] : ''}
                </li>
              )
            })}
          </ul>
        )}
      </Ligne>
      <Ligne terme="Photos">{photos === 0 ? 'Aucune' : photos}</Ligne>
      {etat.observations.trim() !== '' && <Ligne terme="Observations">{etat.observations}</Ligne>}
      {etat.journeeTravaillee && (etat.coulages ?? []).length > 0 && (
        <Ligne terme="Coulages">
          <ul className="space-y-0.5">
            {(etat.coulages ?? []).map((c, i) => (
              <li key={i}>
                {c.ouvrage} : {c.volumeM3} m3 de {c.classeBeton}
              </li>
            ))}
          </ul>
        </Ligne>
      )}
      {(etat.livraisons ?? []).length > 0 && (
        <Ligne terme="Livraisons">
          <ul className="space-y-0.5">
            {(etat.livraisons ?? []).map((l, i) => (
              <li key={i}>
                {l.designation} : {l.quantite} {LIBELLE_UNITE[l.unite]}
                {!l.conforme && ', sous réserve'}
              </li>
            ))}
          </ul>
        </Ligne>
      )}
      <Ligne terme="Aléa">
        {etat.aleaDeclare
          ? `${LIBELLE_TYPE_ALEA[etat.alea.type]}, gravité ${etat.alea.gravite}${coutAlea > 0 ? `, ${fcfa(coutAlea)}` : ''}`
          : 'Aucun'}
      </Ligne>
    </dl>
  )
}

function Ligne({ terme, children }: { terme: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 px-3 py-2.5">
      <dt className="text-muted-foreground">{terme}</dt>
      <dd>{children}</dd>
    </div>
  )
}
