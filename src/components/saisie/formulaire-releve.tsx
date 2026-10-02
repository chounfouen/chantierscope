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
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { controlerQuantite } from '@/db/compute/saisie'
import type { ReferentielSaisie, TacheSaisie } from '@/db/queries/saisie'
import { typeAlea } from '@/db/schema'
import { dateCourte, dateLongue, fcfa, LIBELLE_UNITE, libelleMeteo, quantite } from '@/lib/format'
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

export function FormulaireReleve({ referentiel, initial, mode, aujourdhui, envoyer }: Proprietes) {
  const router = useRouter()
  // Un nouveau releve recoit son identifiant ici, dans le navigateur, et non
  // de la page : voir `nouvelIdentifiant`.
  const [etat, setEtat] = useState<EtatFormulaire>(() =>
    mode === 'creation' ? { ...initial, id: nouvelIdentifiant() } : initial,
  )
  const [indice, setIndice] = useState(mode === 'creation' ? 0 : 1)
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<PhotoAEnvoyer[]>([])
  const [enCours, demarrer] = useTransition()
  const [meteo, setMeteo] = useState<'inutile' | 'chargement' | 'chargee' | 'indisponible'>(
    initial.precipitationsMm === '' ? 'inutile' : 'chargee',
  )

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
    if (!validerEtape(etape)) return
    if (ORDRE[indice + 1] === 'meteo') chargerMeteo()
    setIndice((i) => Math.min(i + 1, ORDRE.length - 1))
    window.scrollTo({ top: 0 })
  }

  function precedent() {
    setErreurs({})
    setIndice((i) => Math.max(i - 1, mode === 'creation' ? 0 : 1))
    window.scrollTo({ top: 0 })
  }

  /* --- Envoi --------------------------------------------------------------- */

  function terminer(soumettre: boolean) {
    const analyse = ReleveSaisi.safeParse(versReleve(etat, soumettre))
    if (!analyse.success) {
      const e = erreursParChamp(analyse.error)
      setErreurs(e)
      // Retour a la premiere etape fautive.
      const fautive = ETAPES.findIndex(
        (et) => !et.schema.safeParse(versReleve(etat, false)).success,
      )
      if (fautive >= 0) setIndice(fautive)
      toast.error('Le relevé est incomplet : corriger les champs signalés.')
      return
    }

    demarrer(async () => {
      const issue = await envoyer(analyse.data, photos)
      if (issue.issue === 'enregistre') {
        toast.success(
          mode === 'rectification'
            ? 'Relevé rectifié et validé.'
            : soumettre
              ? 'Relevé soumis à la validation.'
              : 'Brouillon enregistré.',
        )
        router.push(`/projet/${referentiel.projet.id}/releve/${issue.releveId}`)
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
          className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-20 border-t px-4 py-3 backdrop-blur md:left-[15rem]"
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
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Étape {indice + 1} sur {ORDRE.length}
        {mode === 'rectification' && ' — rectification'}
      </p>
      <h2 className="mt-1 text-lg font-semibold">{TITRES[etape]}</h2>
      <ol aria-hidden className="mt-3 flex gap-1">
        {ORDRE.map((e, i) => (
          <li
            key={e}
            className={cn('h-1 flex-1 rounded-full', i <= indice ? 'bg-foreground' : 'bg-border')}
          />
        ))}
      </ol>
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
        <legend className="text-sm font-medium">Lot</legend>
        <div className="grid gap-2">
          {referentiel.lots.map((l) => (
            <label
              key={l.id}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
                etat.lotId === l.id
                  ? 'border-foreground bg-accent'
                  : 'border-input hover:bg-accent/60',
              )}
            >
              <input
                type="radio"
                name="lot"
                value={l.id}
                checked={etat.lotId === l.id}
                onChange={() => surLot(l.id)}
                className="size-4"
              />
              <span
                aria-hidden
                className="h-4 w-1 shrink-0 rounded-full"
                style={{ background: teinteSerie(l.rangCouleur) }}
              />
              <span className="text-muted-foreground font-mono text-xs">{l.code}</span>
              <span className="text-base">{l.nom}</span>
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
      <h3 className="text-sm font-medium">
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
