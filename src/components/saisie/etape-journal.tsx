'use client'

/**
 * Journal de la journee : coulages de beton et livraisons de materiaux.
 *
 * Facultatif : la plupart des journees n'en portent pas, et l'etape se
 * franchit sans rien saisir. Quand il y a un coulage, il se consigne le jour
 * meme : c'est la seule trace de la classe du beton en place, du bon de la
 * centrale et des eprouvettes prelevees pour l'essai a 28 jours.
 */

import { Button } from '@/components/ui/button'
import { uniteMesure } from '@/db/schema'
import { LIBELLE_UNITE } from '@/lib/format'
import { Icone } from '@/lib/icones'
import {
  COULAGE_VIDE,
  LIVRAISON_VIDE,
  type EtatCoulage,
  type EtatLivraison,
} from '@/lib/releve-formulaire'
import { cn } from '@/lib/utils'
import { Bascule, Champ, ChampNombre, CLASSE_CHAMP } from './champs'

/** Classes courantes en batiment ; toute autre classe se saisit au clavier. */
const CLASSES_COURANTES = ['C20/25', 'C25/30', 'C30/37', 'C35/45']

export function EtapeJournal({
  coulages,
  livraisons,
  journeeTravaillee,
  erreurs,
  surCoulages,
  surLivraisons,
}: {
  coulages: EtatCoulage[]
  livraisons: EtatLivraison[]
  journeeTravaillee: boolean
  erreurs: Record<string, string>
  surCoulages: (c: EtatCoulage[]) => void
  surLivraisons: (l: EtatLivraison[]) => void
}) {
  const changerCoulage = <K extends keyof EtatCoulage>(i: number, cle: K, v: EtatCoulage[K]) =>
    surCoulages(coulages.map((c, j) => (j === i ? { ...c, [cle]: v } : c)))
  const changerLivraison = <K extends keyof EtatLivraison>(
    i: number,
    cle: K,
    v: EtatLivraison[K],
  ) => surLivraisons(livraisons.map((l, j) => (j === i ? { ...l, [cle]: v } : l)))

  return (
    <>
      <section aria-labelledby="titre-coulages" className="space-y-3">
        <h3 id="titre-coulages" className="text-base font-extrabold">
          Coulages de béton
        </h3>
        {!journeeTravaillee ? (
          <p className="text-muted-foreground text-sm">Journée arrêtée : aucun coulage.</p>
        ) : (
          <>
            {erreurs['coulages'] && (
              <p role="alert" className="text-destructive text-sm">
                {erreurs['coulages']}
              </p>
            )}
            {coulages.map((c, i) => {
              const e = (cle: string) => erreurs[`coulages.${i}.${cle}`]
              return (
                <fieldset key={i} className="bg-card space-y-3 rounded-2xl border-2 p-4">
                  <legend className="px-1 text-sm font-bold">Coulage {i + 1}</legend>
                  <Champ
                    libelle="Ouvrage coulé"
                    aide="Élément et position : « Voiles R+2, files A à C »."
                    erreur={e('ouvrage')}
                  >
                    {(a) => (
                      <input
                        {...a}
                        type="text"
                        value={c.ouvrage}
                        onChange={(ev) => changerCoulage(i, 'ouvrage', ev.target.value)}
                        className={CLASSE_CHAMP}
                      />
                    )}
                  </Champ>
                  <div className="grid grid-cols-2 gap-3">
                    <Champ libelle="Classe du béton" erreur={e('classeBeton')}>
                      {(a) => (
                        <>
                          <input
                            {...a}
                            type="text"
                            list={`classes-${i}`}
                            autoCapitalize="characters"
                            value={c.classeBeton}
                            onChange={(ev) => changerCoulage(i, 'classeBeton', ev.target.value)}
                            className={CLASSE_CHAMP}
                          />
                          <datalist id={`classes-${i}`}>
                            {CLASSES_COURANTES.map((k) => (
                              <option key={k} value={k} />
                            ))}
                          </datalist>
                        </>
                      )}
                    </Champ>
                    <ChampNombre
                      libelle="Volume"
                      unite="m3"
                      valeur={c.volumeM3}
                      surChangement={(v) => changerCoulage(i, 'volumeM3', v)}
                      erreur={e('volumeM3')}
                    />
                    <ChampNombre
                      libelle="Affaissement"
                      unite="mm"
                      aide="Cône d’Abrams, facultatif."
                      decimal={false}
                      valeur={c.affaissementMm}
                      surChangement={(v) => changerCoulage(i, 'affaissementMm', v)}
                      erreur={e('affaissementMm')}
                    />
                    <ChampNombre
                      libelle="Éprouvettes"
                      decimal={false}
                      aide="Prélevées pour l’essai."
                      valeur={c.eprouvettes}
                      surChangement={(v) => changerCoulage(i, 'eprouvettes', v)}
                      erreur={e('eprouvettes')}
                    />
                  </div>
                  <Champ
                    libelle="Ferraillage avant coulage"
                    aide="Point d’arrêt : réception par le bureau de contrôle ou le maître d’œuvre."
                    erreur={e('ferraillageReceptionne')}
                  >
                    {(a) => (
                      <select
                        {...a}
                        value={c.ferraillage ?? 'NON_ARME'}
                        onChange={(ev) =>
                          changerCoulage(
                            i,
                            'ferraillage',
                            ev.target.value as NonNullable<EtatCoulage['ferraillage']>,
                          )
                        }
                        className={CLASSE_CHAMP}
                      >
                        <option value="RECEPTIONNE">Réceptionné</option>
                        <option value="NON_RECEPTIONNE">Non réceptionné</option>
                        <option value="NON_ARME">Béton non armé</option>
                      </select>
                    )}
                  </Champ>
                  <Champ libelle="Bon de livraison de la centrale" erreur={e('bonLivraison')}>
                    {(a) => (
                      <input
                        {...a}
                        type="text"
                        value={c.bonLivraison}
                        onChange={(ev) => changerCoulage(i, 'bonLivraison', ev.target.value)}
                        className={CLASSE_CHAMP}
                      />
                    )}
                  </Champ>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => surCoulages(coulages.filter((_, j) => j !== i))}
                  >
                    <Icone.supprimer className="size-4" />
                    Retirer ce coulage
                  </Button>
                </fieldset>
              )
            })}
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base"
              onClick={() => surCoulages([...coulages, { ...COULAGE_VIDE }])}
            >
              <Icone.ajouter className="size-4" />
              Ajouter un coulage
            </Button>
          </>
        )}
      </section>

      <section aria-labelledby="titre-livraisons" className="space-y-3">
        <h3 id="titre-livraisons" className="text-base font-extrabold">
          Livraisons
        </h3>
        {livraisons.map((l, i) => {
          const e = (cle: string) => erreurs[`livraisons.${i}.${cle}`]
          return (
            <fieldset key={i} className="bg-card space-y-3 rounded-2xl border-2 p-4">
              <legend className="px-1 text-sm font-bold">Livraison {i + 1}</legend>
              <Champ
                libelle="Matériau livré"
                aide="« Ciment CEM II 42,5 », « Acier HA 12 »…"
                erreur={e('designation')}
              >
                {(a) => (
                  <input
                    {...a}
                    type="text"
                    value={l.designation}
                    onChange={(ev) => changerLivraison(i, 'designation', ev.target.value)}
                    className={CLASSE_CHAMP}
                  />
                )}
              </Champ>
              <div className="grid grid-cols-2 gap-3">
                <ChampNombre
                  libelle="Quantité"
                  valeur={l.quantite}
                  surChangement={(v) => changerLivraison(i, 'quantite', v)}
                  erreur={e('quantite')}
                />
                <Champ libelle="Unité" erreur={e('unite')}>
                  {(a) => (
                    <select
                      {...a}
                      value={l.unite}
                      onChange={(ev) =>
                        changerLivraison(i, 'unite', ev.target.value as EtatLivraison['unite'])
                      }
                      className={CLASSE_CHAMP}
                    >
                      {uniteMesure.enumValues.map((u) => (
                        <option key={u} value={u}>
                          {LIBELLE_UNITE[u]}
                        </option>
                      ))}
                    </select>
                  )}
                </Champ>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ libelle="Fournisseur" erreur={e('fournisseur')}>
                  {(a) => (
                    <input
                      {...a}
                      type="text"
                      value={l.fournisseur}
                      onChange={(ev) => changerLivraison(i, 'fournisseur', ev.target.value)}
                      className={CLASSE_CHAMP}
                    />
                  )}
                </Champ>
                <Champ libelle="Bon de livraison" erreur={e('bonLivraison')}>
                  {(a) => (
                    <input
                      {...a}
                      type="text"
                      value={l.bonLivraison}
                      onChange={(ev) => changerLivraison(i, 'bonLivraison', ev.target.value)}
                      className={CLASSE_CHAMP}
                    />
                  )}
                </Champ>
              </div>
              <Bascule
                libelle="Livraison conforme ?"
                valeur={l.conforme}
                surChangement={(v) => changerLivraison(i, 'conforme', v)}
                oui="Oui"
                non="Non, réserve"
              />
              {!l.conforme && (
                <Champ
                  libelle="Réserve"
                  aide="Ce qui ne va pas, et la suite donnée : refus, retour, avoir."
                  erreur={e('reserve')}
                >
                  {(a) => (
                    <textarea
                      {...a}
                      rows={3}
                      value={l.reserve}
                      onChange={(ev) => changerLivraison(i, 'reserve', ev.target.value)}
                      className={cn(CLASSE_CHAMP, 'h-auto py-2.5')}
                    />
                  )}
                </Champ>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => surLivraisons(livraisons.filter((_, j) => j !== i))}
              >
                <Icone.supprimer className="size-4" />
                Retirer cette livraison
              </Button>
            </fieldset>
          )
        })}
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() => surLivraisons([...livraisons, { ...LIVRAISON_VIDE }])}
        >
          <Icone.ajouter className="size-4" />
          Ajouter une livraison
        </Button>
      </section>
    </>
  )
}
