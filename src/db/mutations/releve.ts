/**
 * Ecritures sur les releves journaliers.
 *
 * Toute mutation suit le meme schema : une seule transaction, l'identite de
 * l'auteur posee en tete pour alimenter le journal d'audit, l'ecriture, puis
 * le recalcul du cache. Si le recalcul echoue, l'ecriture est annulee : on ne
 * laisse jamais la base dans un etat ou les indicateurs contrediraient les
 * donnees.
 */

import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier, estGel, estViolationUnicite } from '@/db/mutations/erreurs'
import { recompute, type Recalcul } from '@/db/recompute'
import { verrouillerProjet } from '@/db/verrou'
import { proposerIntemperies } from '@/db/mutations/contrat'
import { dateCourte } from '@/lib/format'
import type { AleaSaisi, ReleveSaisi } from '@/lib/releve'

type Db = ReturnType<typeof instanceDb>
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Pose l'identite de l'auteur pour la duree de la transaction.
 *
 * Le declencheur d'audit lit ce parametre. `set_config` avec le troisieme
 * argument a vrai limite la portee a la transaction courante, ce qui evite
 * qu'une identite reste collee a une connexion reutilisee par le pooler —
 * bug redoutable, car il attribuerait des actions au mauvais utilisateur.
 *
 * La valeur passe par un parametre lie et non par interpolation : un
 * identifiant construit a partir d'une entree non fiable ne doit pas pouvoir
 * devenir du SQL.
 */
export async function poserAuteur(tx: Transaction, utilisateurId: string | null): Promise<void> {
  await tx.execute(sql`select set_config('app.user_id', ${utilisateurId ?? ''}, true)`)
}

export type ResultatValidation = {
  /** Faux si le releve etait deja valide : l'appel n'a alors rien change. */
  modifie: boolean
  releveId: string
  projetId: string
  date: string
  recalcul: Recalcul | null
}

/**
 * Valide un releve soumis, puis recalcule le cache du projet.
 *
 * Idempotente par construction : le filtre porte sur le statut `SOUMIS`, donc
 * un second appel ne trouve rien a mettre a jour et ressort sans rien
 * modifier. Un double clic, un renvoi de formulaire ou une reprise apres
 * coupure reseau ne peuvent pas valider deux fois.
 */
export async function validerReleve(
  db: Db,
  releveId: string,
  utilisateurId: string,
  /**
   * Version que le conducteur a sous les yeux : `modifie_le` tel que la fiche
   * l'a lu. Fournie, la validation est refusee si le releve a change depuis,
   * par exemple parce que la file hors ligne du chef a pousse une nouvelle
   * version entre-temps : on ne gele pas ce qu'on n'a pas relu.
   */
  versionVue?: string,
): Promise<ResultatValidation> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, utilisateurId)

    // Le projet est lu avant toute ecriture, pour poser le verrou en tete.
    const [cible] = await tx.execute<{ projetId: string }>(sql`
      select projet_id as "projetId" from releve_journalier where id = ${releveId}::uuid`)
    if (cible) await verrouillerProjet(tx, cible.projetId)

    const lignes = await tx.execute<{ id: string; projetId: string; date: string }>(sql`
      update releve_journalier
         set statut = 'VALIDE', valide_par_id = ${utilisateurId}::uuid, valide_le = now()
       where id = ${releveId}::uuid and statut = 'SOUMIS'
         and (${versionVue ?? null}::timestamptz is null
              or modifie_le = ${versionVue ?? null}::timestamptz)
       returning id, projet_id as "projetId", date`)

    const modifie = lignes[0]
    if (!modifie) {
      const existant = await tx.execute<{ projetId: string; date: string; statut: string }>(sql`
        select projet_id as "projetId", date, statut::text as statut
          from releve_journalier where id = ${releveId}::uuid`)
      const releve = existant[0]
      if (!releve) throw new RefusMetier('INTROUVABLE', 'Relevé introuvable.')
      if (releve.statut === 'BROUILLON') {
        throw new RefusMetier(
          'INCOHERENT',
          'Un relevé en brouillon doit d’abord être soumis avant validation.',
        )
      }
      if (releve.statut === 'SOUMIS') {
        throw new RefusMetier(
          'PERIME',
          'Le relevé a été modifié depuis son ouverture : le relire avant de le valider.',
        )
      }
      return {
        modifie: false,
        releveId,
        projetId: releve.projetId,
        date: releve.date,
        recalcul: null,
      }
    }

    // Une journee arretee par la meteo devient une intemperie a reconnaitre.
    await proposerIntemperies(tx, modifie.projetId)
    const recalcul = await recompute(tx as unknown as Db, modifie.projetId)

    return {
      modifie: true,
      releveId: modifie.id,
      projetId: modifie.projetId,
      date: modifie.date,
      recalcul,
    }
  })
}

export type ResultatValidationGroupee = {
  /** Releves effectivement valides par cet appel. */
  valides: string[]
  /** Releves modifies depuis leur affichage : non valides, a relire. */
  perimes: string[]
  recalcul: Recalcul | null
}

/**
 * Valide plusieurs releves soumis d'un meme projet, en une transaction et un
 * seul recalcul.
 *
 * Valider une semaine releve par releve coutait une trentaine de clics et
 * sept recalculs complets. Ici, chaque releve n'est valide que s'il est
 * encore SOUMIS et dans la version affichee ; les autres sont rendus a part,
 * pour que le conducteur relise ceux qui ont change.
 */
export async function validerReleves(
  db: Db,
  projetId: string,
  selection: readonly { id: string; version: string }[],
  utilisateurId: string,
): Promise<ResultatValidationGroupee> {
  if (selection.length === 0) return { valides: [], perimes: [], recalcul: null }
  return db.transaction(async (tx) => {
    await poserAuteur(tx, utilisateurId)
    await verrouillerProjet(tx, projetId)

    const valeurs = sql.join(
      selection.map((s) => sql`(${s.id}::uuid, ${s.version}::timestamptz)`),
      sql`, `,
    )
    const lignes = await tx.execute<{ id: string }>(sql`
      update releve_journalier r
         set statut = 'VALIDE', valide_par_id = ${utilisateurId}::uuid, valide_le = now()
        from (values ${valeurs}) as v(id, version)
       where r.id = v.id and r.projet_id = ${projetId}::uuid
         and r.statut = 'SOUMIS' and r.modifie_le = v.version
       returning r.id`)
    const valides = lignes.map((l) => l.id)

    const restants = selection.filter((s) => !valides.includes(s.id)).map((s) => s.id)
    const perimes =
      restants.length === 0
        ? []
        : (
            await tx.execute<{ id: string }>(sql`
              select id from releve_journalier
               where projet_id = ${projetId}::uuid and statut = 'SOUMIS'
                 and id in (${sql.join(
                   restants.map((id) => sql`${id}::uuid`),
                   sql`, `,
                 )})`)
          ).map((l) => l.id)

    if (valides.length > 0) await proposerIntemperies(tx, projetId)
    const recalcul = valides.length > 0 ? await recompute(tx as unknown as Db, projetId) : null
    return { valides, perimes, recalcul }
  })
}

/**
 * Passe un releve de brouillon a soumis. N'affecte pas les indicateurs : un
 * releve soumis n'est pas encore engage, donc pas encore compte.
 */
export async function soumettreReleve(
  db: Db,
  releveId: string,
  utilisateurId: string,
): Promise<{ modifie: boolean }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, utilisateurId)
    const lignes = await tx.execute<{ id: string }>(sql`
      update releve_journalier set statut = 'SOUMIS'
       where id = ${releveId}::uuid and statut = 'BROUILLON'
       returning id`)
    return { modifie: lignes.length > 0 }
  })
}

/**
 * Recalcule le cache d'un projet hors de toute mutation.
 *
 * Employee par la tache planifiee nocturne et par les outils de maintenance.
 */
export async function recalculerProjet(
  db: Db,
  projetId: string,
  utilisateurId: string | null = null,
): Promise<Recalcul> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, utilisateurId)
    await verrouillerProjet(tx, projetId)
    await proposerIntemperies(tx, projetId)
    return recompute(tx as unknown as Db, projetId)
  })
}

/* -------------------------------------------------------------------------- */
/* Saisie                                                                     */
/* -------------------------------------------------------------------------- */

export type ResultatEnregistrement = {
  releveId: string
  /** Vrai a la premiere reception, faux pour une mise a jour. */
  cree: boolean
  statut: 'BROUILLON' | 'SOUMIS'
  /**
   * Vrai si l'envoi portait une version plus ancienne que celle deja recue :
   * rien n'a ete ecrit, la version recente est conservee.
   */
  depasse?: boolean
}

/**
 * Enregistre un releve saisi : creation, ou mise a jour tant qu'il n'est pas
 * valide.
 *
 * L'identifiant est fourni par le navigateur. C'est ce qui rend l'envoi
 * idempotent : un releve mis en file hors ligne, envoye, dont la reponse se
 * perd, puis renvoye au retour du reseau, retrouve sa propre ligne et la
 * met a jour au lieu d'en creer une seconde.
 *
 * Trois refus, tous explicites :
 *
 * - CONFLIT : un autre releve actif existe deja pour ce lot et ce jour. La
 *   contrainte d'unicite de la base tranche, pas une lecture prealable qui
 *   laisserait passer deux envois simultanes.
 * - GELE : le releve a deja ete valide ; il se corrige par rectification.
 * - INCOHERENT : le lot n'appartient pas au projet, ou une ligne saisie
 *   n'appartient pas au lot. Une charge utile forgee ne doit pas pouvoir
 *   imputer des quantites a un autre ouvrage.
 *
 * Aucun recalcul n'est necessaire pour les quantites : seuls les releves
 * VALIDES alimentent les indicateurs. Un alea declare, en revanche, entre
 * dans le cout reel des sa declaration ; s'il change, le cache est recalcule
 * dans la meme transaction.
 */
export async function enregistrerReleve(
  db: Db,
  projetId: string,
  saisie: ReleveSaisi,
  auteurId: string,
): Promise<ResultatEnregistrement> {
  try {
    return await db.transaction(async (tx) => {
      await poserAuteur(tx, auteurId)
      // Pose en tete : deux envois du meme releve, ou un envoi et une
      // validation, s'executent l'un apres l'autre, jamais en parallele.
      await verrouillerProjet(tx, projetId)
      await verifierCoherence(tx, projetId, saisie)

      const existants = await tx.execute<{
        statut: string
        lotId: string
        date: string
        projetId: string
        revision: number
      }>(sql`
        select statut::text as statut, lot_id as "lotId", date, projet_id as "projetId",
               revision::float8 as revision
          from releve_journalier where id = ${saisie.id}::uuid
         for update`)
      const existant = existants[0]

      // Un identifiant qui designe le releve d'un autre projet ne donne aucun
      // droit sur lui. On repond comme s'il n'existait pas, pour ne pas
      // confirmer son existence.
      if (existant && existant.projetId !== projetId) {
        throw new RefusMetier('INTROUVABLE', 'Relevé introuvable.')
      }

      if (existant && (existant.statut === 'VALIDE' || existant.statut === 'RECTIFIE')) {
        throw new RefusMetier(
          'GELE',
          `Le relevé du ${dateCourte(existant.date)} est déjà validé : il ne se modifie plus. ` +
            'Une correction passe par un relevé rectificatif.',
        )
      }

      // Une version plus ancienne que celle deja recue n'ecrase rien : la file
      // hors ligne peut rejouer un envoi depasse par un envoi direct.
      if (existant && saisie.revision !== undefined && existant.revision > saisie.revision) {
        return {
          releveId: saisie.id,
          cree: false,
          statut: existant.statut === 'SOUMIS' ? 'SOUMIS' : 'BROUILLON',
          depasse: true,
        }
      }

      let statut: 'BROUILLON' | 'SOUMIS'
      if (existant) {
        // Un releve soumis ne redevient pas brouillon par un simple
        // enregistrement : il attend deja la validation.
        statut = saisie.soumettre || existant.statut === 'SOUMIS' ? 'SOUMIS' : 'BROUILLON'
        await tx.execute(sql`
          update releve_journalier set
            lot_id = ${saisie.lotId}::uuid,
            date = ${saisie.date}::date,
            ${colonnesSaisie(saisie)},
            statut = ${statut}::statut_releve,
            revision = ${saisie.revision ?? existant.revision},
            modifie_le = now()
          where id = ${saisie.id}::uuid and projet_id = ${projetId}::uuid`)
        await tx.execute(sql`
          delete from releve_quantite where releve_journalier_id = ${saisie.id}::uuid`)
        await tx.execute(sql`
          delete from releve_coulage where releve_journalier_id = ${saisie.id}::uuid`)
        await tx.execute(sql`
          delete from releve_livraison where releve_journalier_id = ${saisie.id}::uuid`)
        await tx.execute(sql`
          delete from releve_engin where releve_journalier_id = ${saisie.id}::uuid`)
      } else {
        statut = saisie.soumettre ? 'SOUMIS' : 'BROUILLON'
        await tx.execute(sql`
          insert into releve_journalier (id, projet_id, lot_id, date, auteur_id, statut, revision)
          values (${saisie.id}::uuid, ${projetId}::uuid, ${saisie.lotId}::uuid,
                  ${saisie.date}::date, ${auteurId}::uuid, ${statut}::statut_releve,
                  ${saisie.revision ?? 0})`)
        await tx.execute(sql`
          update releve_journalier set ${colonnesSaisie(saisie)}
           where id = ${saisie.id}::uuid`)
      }

      await ecrireQuantites(tx, saisie.id, saisie)
      await ecrireJournal(tx, saisie.id, saisie)
      await ecrireEngins(tx, projetId, saisie.id, saisie)
      const aleaModifie = await ecrireAlea(tx, projetId, saisie.id, saisie, auteurId)
      if (aleaModifie) await recompute(tx as unknown as Db, projetId)

      return { releveId: saisie.id, cree: !existant, statut }
    })
  } catch (e) {
    throw traduireRefus(e, saisie)
  }
}

export type ResultatRectification = {
  ancienId: string
  nouveauId: string
  recalcul: Recalcul
}

/**
 * Corrige un releve valide par un releve rectificatif.
 *
 * L'ancien releve n'est ni modifie ni supprime : il passe au statut
 * `RECTIFIE`, designe son remplacant, et reste consultable comme trace. Le
 * rectificatif est valide d'emblee par son auteur, qui doit donc etre habilite
 * a valider ; c'est a l'appelant de l'avoir verifie.
 *
 * L'ordre des ecritures est impose par les regles de la base. L'ancien passe
 * d'abord a `RECTIFIE`, sans quoi l'unicite du releve actif refuserait le
 * nouveau ; le nouveau recoit ses quantites avant d'etre valide, puisqu'un
 * releve valide n'en accepte plus ; l'ancien designe enfin son remplacant.
 *
 * Idempotente : un second envoi du meme rectificatif retrouve l'ancien deja
 * remplace par lui et ressort sans rien modifier.
 */
export async function rectifierReleve(
  db: Db,
  projetId: string,
  ancienId: string,
  saisie: ReleveSaisi,
  auteurId: string,
): Promise<ResultatRectification> {
  try {
    return await db.transaction(async (tx) => {
      await poserAuteur(tx, auteurId)
      await verrouillerProjet(tx, projetId)

      const anciens = await tx.execute<{
        statut: string
        lotId: string
        date: string
        projetId: string
        remplacePar: string | null
      }>(sql`
        select statut::text as statut, lot_id as "lotId", date, projet_id as "projetId",
               remplace_par as "remplacePar"
          from releve_journalier where id = ${ancienId}::uuid
         for update`)
      const ancien = anciens[0]
      if (!ancien || ancien.projetId !== projetId) {
        throw new RefusMetier('INTROUVABLE', 'Relevé introuvable.')
      }
      if (ancien.statut === 'RECTIFIE' && ancien.remplacePar === saisie.id) {
        return {
          ancienId,
          nouveauId: saisie.id,
          recalcul: await recompute(tx as unknown as Db, projetId),
        }
      }
      if (ancien.statut !== 'VALIDE') {
        throw new RefusMetier(
          'INCOHERENT',
          ancien.statut === 'RECTIFIE'
            ? 'Ce relevé a déjà été rectifié : corriger plutôt le relevé qui le remplace.'
            : 'Seul un relevé validé se rectifie. Celui-ci se modifie directement.',
        )
      }
      if (saisie.lotId !== ancien.lotId || saisie.date !== ancien.date) {
        throw new RefusMetier(
          'INCOHERENT',
          'Un relevé rectificatif porte sur le même lot et le même jour que le relevé corrigé.',
        )
      }
      await verifierCoherence(tx, projetId, saisie)

      await tx.execute(sql`
        update releve_journalier set statut = 'RECTIFIE', modifie_le = now()
         where id = ${ancienId}::uuid`)

      await tx.execute(sql`
        insert into releve_journalier (id, projet_id, lot_id, date, auteur_id, statut)
        values (${saisie.id}::uuid, ${projetId}::uuid, ${saisie.lotId}::uuid,
                ${saisie.date}::date, ${auteurId}::uuid, 'SOUMIS')`)
      await tx.execute(sql`
        update releve_journalier set ${colonnesSaisie(saisie)}
         where id = ${saisie.id}::uuid`)
      await ecrireQuantites(tx, saisie.id, saisie)
      await ecrireJournal(tx, saisie.id, saisie)
      await ecrireEngins(tx, projetId, saisie.id, saisie)

      await tx.execute(sql`
        update releve_journalier
           set statut = 'VALIDE', valide_par_id = ${auteurId}::uuid, valide_le = now()
         where id = ${saisie.id}::uuid`)
      await tx.execute(sql`
        update releve_journalier set remplace_par = ${saisie.id}::uuid
         where id = ${ancienId}::uuid`)

      // L'alea declare sur l'ancien releve le suit : il decrit le meme fait.
      await tx.execute(sql`
        update alea set releve_journalier_id = ${saisie.id}::uuid
         where releve_journalier_id = ${ancienId}::uuid`)
      await ecrireAlea(tx, projetId, saisie.id, saisie, auteurId)

      const recalcul = await recompute(tx as unknown as Db, projetId)
      return { ancienId, nouveauId: saisie.id, recalcul }
    })
  } catch (e) {
    throw traduireRefus(e, saisie)
  }
}

/** Projet auquel appartient un releve, pour appliquer la garde avant d'agir. */
export async function projetDuReleve(db: Db, releveId: string): Promise<string | null> {
  const lignes = await db.execute<{ projetId: string }>(sql`
    select projet_id as "projetId" from releve_journalier where id = ${releveId}::uuid`)
  return lignes[0]?.projetId ?? null
}

/** Identifiant neuf, pour un releve cree cote serveur. */
export function nouvelIdentifiant(): string {
  return randomUUID()
}

/* -------------------------------------------------------------------------- */
/* Ecritures elementaires                                                     */
/* -------------------------------------------------------------------------- */

function colonnesSaisie(s: ReleveSaisi) {
  return sql`
    effectif_ouvriers = ${s.effectifOuvriers},
    effectif_encadrement = ${s.effectifEncadrement},
    heures_travaillees = ${s.heuresTravaillees},
    meteo_code = ${s.meteoCode},
    temperature_c = ${s.temperatureC},
    precipitations_mm = ${s.precipitationsMm},
    rafales_kmh = ${s.rafalesKmh},
    meteo_corrigee = ${s.meteoCorrigee},
    journee_travaillee = ${s.journeeTravaillee},
    motif_arret = ${s.journeeTravaillee ? null : s.motifArret},
    observations = ${vide(s.observations)}`
}

async function ecrireQuantites(tx: Transaction, releveId: string, s: ReleveSaisi): Promise<void> {
  if (s.quantites.length === 0) return
  const valeurs = sql.join(
    s.quantites.map(
      (q) =>
        sql`(${releveId}::uuid, ${q.ligneId}::uuid, ${q.quantite}::numeric, ${vide(q.commentaire)})`,
    ),
    sql`, `,
  )
  await tx.execute(sql`
    insert into releve_quantite (releve_journalier_id, ligne_quantitatif_id, quantite_realisee, commentaire)
    values ${valeurs}`)
}

/**
 * Heures d'engin de la journee. Seules les ressources du projet, hors frais
 * de chantier, se relevent : une autre serait comptee a tort, ou deux fois.
 */
async function ecrireEngins(
  tx: Transaction,
  projetId: string,
  releveId: string,
  s: ReleveSaisi,
): Promise<void> {
  if (s.engins.length === 0) return
  const valeurs = sql.join(
    s.engins.map((e) => sql`(${e.ressourceId}::uuid, ${e.heures}::numeric)`),
    sql`, `,
  )
  const lignes = await tx.execute(sql`
    insert into releve_engin (releve_journalier_id, ressource_id, heures)
    select ${releveId}::uuid, v.id, v.heures
      from (values ${valeurs}) v(id, heures)
      join ressource r on r.id = v.id
     where r.projet_id = ${projetId}::uuid and not r.dans_frais_chantier
    returning ressource_id`)
  if (lignes.length !== s.engins.length) {
    throw new RefusMetier('INCOHERENT', 'Un engin saisi n’appartient pas à ce projet.')
  }
}

/** Coulages et livraisons de la journee, dans l'ordre de saisie. */
async function ecrireJournal(tx: Transaction, releveId: string, s: ReleveSaisi): Promise<void> {
  if (s.coulages.length > 0) {
    const valeurs = sql.join(
      s.coulages.map(
        (c, rang) =>
          sql`(${releveId}::uuid, ${rang}, ${c.ouvrage}, ${c.classeBeton}, ${c.volumeM3}::numeric,
               ${vide(c.bonLivraison)}, ${c.affaissementMm}, ${c.eprouvettes},
               ${c.ferraillageReceptionne})`,
      ),
      sql`, `,
    )
    await tx.execute(sql`
      insert into releve_coulage (releve_journalier_id, rang, ouvrage, classe_beton, volume_m3,
                                  bon_livraison, affaissement_mm, eprouvettes,
                                  ferraillage_receptionne)
      values ${valeurs}`)
  }
  if (s.livraisons.length > 0) {
    const valeurs = sql.join(
      s.livraisons.map(
        (l, rang) =>
          sql`(${releveId}::uuid, ${rang}, ${l.designation}, ${vide(l.fournisseur)},
               ${l.quantite}::numeric, ${l.unite}::unite_mesure, ${vide(l.bonLivraison)},
               ${l.conforme}, ${l.conforme ? vide(l.reserve) : l.reserve})`,
      ),
      sql`, `,
    )
    await tx.execute(sql`
      insert into releve_livraison (releve_journalier_id, rang, designation, fournisseur, quantite,
                                    unite, bon_livraison, conforme, reserve)
      values ${valeurs}`)
  }
}

/**
 * Cree, met a jour ou retire l'alea declare depuis un releve. Renvoie vrai
 * si quelque chose a change, ce qui impose un recalcul.
 */
async function ecrireAlea(
  tx: Transaction,
  projetId: string,
  releveId: string,
  s: ReleveSaisi,
  auteurId: string,
): Promise<boolean> {
  const a: AleaSaisi | null = s.alea
  if (!a) {
    const retires = await tx.execute<{ id: string }>(sql`
      delete from alea where releve_journalier_id = ${releveId}::uuid returning id`)
    return retires.length > 0
  }
  await tx.execute(sql`
    insert into alea (projet_id, lot_id, releve_journalier_id, date, type, gravite, description,
                      impact_delai_j, impact_cout_xof, declare_par_id, decision_intemperie)
    values (${projetId}::uuid, ${s.lotId}::uuid, ${releveId}::uuid, ${s.date}::date,
            ${a.type}::type_alea, ${a.gravite}, ${a.description}, ${a.impactDelaiJ},
            ${a.impactCoutXof}, ${auteurId}::uuid,
            -- Une intemperie declaree du terrain reste a reconnaitre.
            case when ${a.type} = 'INTEMPERIE' then 'PROPOSEE'::decision_intemperie end)
    on conflict (releve_journalier_id) do update set
      decision_intemperie = case when excluded.type = 'INTEMPERIE'
                                 then coalesce(alea.decision_intemperie, 'PROPOSEE') end,
      lot_id = excluded.lot_id, date = excluded.date, type = excluded.type,
      gravite = excluded.gravite, description = excluded.description,
      impact_delai_j = excluded.impact_delai_j, impact_cout_xof = excluded.impact_cout_xof`)
  return true
}

/**
 * Le lot appartient au projet, et chaque ligne saisie appartient a une tache
 * de ce lot. Une seule requete pour l'ensemble des lignes.
 */
async function verifierCoherence(tx: Transaction, projetId: string, s: ReleveSaisi): Promise<void> {
  const lots = await tx.execute<{ id: string }>(sql`
    select id from lot where id = ${s.lotId}::uuid and projet_id = ${projetId}::uuid`)
  if (lots.length === 0) {
    throw new RefusMetier('INCOHERENT', 'Ce lot n’appartient pas au projet.')
  }
  if (s.quantites.length === 0) return

  const ids = sql.join(
    s.quantites.map((q) => sql`${q.ligneId}::uuid`),
    sql`, `,
  )
  const [compte] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n
      from ligne_quantitatif l
      join tache t on t.id = l.tache_id
     where l.id in (${ids}) and t.lot_id = ${s.lotId}::uuid`)
  if (Number(compte?.n) !== s.quantites.length) {
    throw new RefusMetier(
      'INCOHERENT',
      'Une ligne saisie n’appartient pas au lot du relevé. Recharger le formulaire.',
    )
  }
}

/** Traduit les refus de la base en refus metier lisibles. */
function traduireRefus(e: unknown, s: ReleveSaisi): unknown {
  if (e instanceof RefusMetier) return e
  if (estViolationUnicite(e)) {
    return new RefusMetier(
      'CONFLIT',
      `Un relevé existe déjà pour ce lot le ${dateCourte(s.date)}. ` +
        'Ouvrir ce relevé pour le compléter plutôt que d’en saisir un second.',
    )
  }
  if (estGel(e)) {
    return new RefusMetier(
      'GELE',
      'Ce relevé est validé et gelé. Une correction passe par un relevé rectificatif.',
    )
  }
  return e
}

function vide(v: string | null): string | null {
  return v === null || v.trim() === '' ? null : v.trim()
}
