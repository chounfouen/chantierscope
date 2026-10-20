/**
 * Peuplement du chantier de demonstration.
 *
 * Deterministe : deux executions produisent des donnees strictement
 * identiques, aux identifiants UUID pres, qui sont eux tires par PostgreSQL.
 *
 * Les declencheurs d'audit sont desactives pendant le chargement, puis
 * reactives. Le journal d'audit doit tracer des actions humaines ; y verser
 * les quinze mille ecritures du peuplement le rendrait illisible et sans
 * valeur probante.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import { addDays, differenceInCalendarDays, formatISO, parseISO } from 'date-fns'
import { sql } from 'drizzle-orm'
import { env } from '@/lib/env'
import { dbScript } from '@/db/index'
import * as t from '@/db/schema'
import {
  COMPTES,
  DATE_ANALYSE,
  DATE_ORDRE_SERVICE,
  JALONS,
  LOTS,
  POINTS_DE_VUE,
  PROJET,
  RESSOURCES,
  EQUIPE_PAR_NATURE,
  INDICES_REVISION,
  ZONES,
} from '@/db/seed/catalogue'
import { COUT } from '@/db/compute/evm'
import { NON_CONFORMITES, simulerExecution } from '@/db/seed/execution'
import { presenterDecompte, statuerDecompte } from '@/db/mutations/decompte'
import { recompute } from '@/db/recompute'
import { fabriquerPlanches } from '@/db/seed/photos'
import { montantLigne } from '@/db/seed/planning'
import { extraireMaquette, glbMaquette } from '@/lib/maquette/ifc'
import { classer, proposerRegles } from '@/lib/maquette/regles'
import { IfcAPI } from 'web-ifc'

/**
 * Mot de passe des cinq comptes de demonstration.
 *
 * Valeur de developpement, utilisee uniquement en local. Elle n'ouvre aucun
 * service reel et n'est jamais deployee : le peuplement ne s'execute qu'une
 * fois en production, ou les comptes sont recrees avec d'autres valeurs.
 */
const MOT_DE_PASSE_DEMO = 'chantier2026'

/** Tables videes avant rechargement, dans l'ordre inverse des dependances. */
const TABLES_A_VIDER = [
  'journal_audit',
  'tentative_connexion',
  'evenement_securite',
  'decompte',
  'indice_revision',
  'reserve',
  'non_conformite',
  'essai_beton',
  'sous_traitant_lot',
  'sous_traitant',
  'snapshot_avancement',
  'ordre_service',
  'avenant',
  'reference_tache',
  'reference_planning',
  'photo',
  'point_de_vue',
  'regle_maquette',
  'element_maquette',
  'maquette',
  'plan_niveau',
  'zone_tache',
  'zone',
  'affectation',
  'ressource',
  'alea',
  'jalon',
  'releve_quantite',
  'releve_coulage',
  'releve_livraison',
  'releve_engin',
  'releve_journalier',
  'ligne_quantitatif',
  'liaison',
  'tache',
  'lot',
  'acces_projet',
  'projet',
  'utilisateur',
]

const TABLES_AUDITEES = [
  'alea',
  'essai_beton',
  'non_conformite',
  'reserve',
  'decompte',
  'sous_traitant',
  'evenement_securite',
  'avenant',
  'ordre_service',
  'releve_journalier',
  'releve_quantite',
  'releve_coulage',
  'releve_livraison',
  'releve_engin',
  'ligne_quantitatif',
  'tache',
  'liaison',
  'zone',
  'plan_niveau',
  'maquette',
  'regle_maquette',
]

/** Maquette de demonstration : source IFC, et GLB produit dans le dossier public. */
const IFC_DEMO = 'src/db/seed/residence-palmiers.ifc'
const CHEMIN_GLB_DEMO = '/uploads/demo/residence-palmiers.glb'

const COUT_HEURES_JOUR = COUT.heuresParJour

const jourDepuisOs = (n: number): string =>
  formatISO(addDays(parseISO(DATE_ORDRE_SERVICE), n), { representation: 'date' })

async function peupler(): Promise<void> {
  const debut = Date.now()
  const { db, client, fermer } = dbScript()

  try {
    console.log('Simulation de l’execution du chantier...')
    const e = simulerExecution()
    const { planning } = e

    // Peuplement unique en production : sur une base distante, le vidage
    // n'est permis que si elle ne contient encore aucun projet. Relance par
    // erreur apres la mise en service, il effacerait le chantier reel.
    const hote = new URL(env().DIRECT_URL).hostname
    if (hote !== 'localhost' && hote !== '127.0.0.1') {
      const [existant] = await client<{ n: number }[]>`select count(*)::int as n from projet`
      if ((existant?.n ?? 0) > 0) {
        throw new Error(
          `Refus de repeupler une base distante deja peuplee (${hote}) : ` +
            'le peuplement de production est unique. Restaurer une sauvegarde au besoin.',
        )
      }
    }

    console.log('Vidage des tables...')
    await client.unsafe(`truncate ${TABLES_A_VIDER.join(', ')} restart identity cascade`)

    console.log('Désactivation des déclencheurs d’audit...')
    for (const table of TABLES_AUDITEES) {
      await client.unsafe(`alter table ${table} disable trigger user`)
    }

    /* --- Utilisateurs --------------------------------------------------- */

    const hash = bcrypt.hashSync(MOT_DE_PASSE_DEMO, 10)
    const utilisateurs = await db
      .insert(t.utilisateur)
      .values(COMPTES.map((c) => ({ ...c, motDePasseHash: hash })))
      .returning({ id: t.utilisateur.id, role: t.utilisateur.role })

    const parRole = new Map(utilisateurs.map((u) => [u.role, u.id]))
    const idChef = parRole.get('CHEF_CHANTIER') as string
    const idConducteur = parRole.get('CONDUCTEUR') as string

    /* --- Projet ---------------------------------------------------------- */

    const dureeContractuelle = planning.dureeTotale
    const [projetInsere] = await db
      .insert(t.projet)
      .values({
        ...PROJET,
        dateOrdreService: DATE_ORDRE_SERVICE,
        dureeContractuelleJ: dureeContractuelle,
        dateFinContractuelle: jourDepuisOs(dureeContractuelle - 1),
        montantMarcheXof: planning.budgetTotal,
      })
      .returning({ id: t.projet.id })
    const projetId = (projetInsere as { id: string }).id

    await db
      .insert(t.accesProjet)
      .values(utilisateurs.map((u) => ({ utilisateurId: u.id, projetId })))

    /* --- Lots ------------------------------------------------------------ */

    const lotsInseres = await db
      .insert(t.lot)
      .values(
        LOTS.map((l, i) => ({
          projetId,
          code: l.code,
          nom: l.nom,
          ordre: i,
          budgetXof: planning.budgetParLot.get(l.code) ?? 0,
          rangCouleur: l.rangCouleur,
        })),
      )
      .returning({ id: t.lot.id, code: t.lot.code })
    const idLot = new Map(lotsInseres.map((l) => [l.code, l.id]))

    /* --- Taches : noeuds de WBS puis feuilles ----------------------------- */

    // Un noeud intermediaire herite de l'enveloppe temporelle de ses enfants.
    const noeudsAvecDates = planning.noeuds.map((n) => {
      const enfants = planning.taches.filter((x) => x.parent === n.code)
      const debutN = Math.min(...enfants.map((x) => x.debut))
      const finN = Math.max(...enfants.map((x) => x.fin))
      return { ...n, debut: debutN, fin: finN }
    })

    const noeudsInseres = await db
      .insert(t.tache)
      .values(
        noeudsAvecDates.map((n) => ({
          lotId: idLot.get(n.lot) as string,
          parentId: null,
          codeWbs: n.code,
          nom: n.nom,
          nature: 'SUPPORT' as const,
          methodeAvancement: 'UNITES_PHYSIQUES' as const,
          dateDebutPrevue: jourDepuisOs(n.debut),
          dateFinPrevue: jourDepuisOs(n.fin),
          dureePrevueJ: n.fin - n.debut + 1,
        })),
      )
      .returning({ id: t.tache.id, codeWbs: t.tache.codeWbs })
    const idTache = new Map(noeudsInseres.map((n) => [n.codeWbs, n.id]))

    const feuillesInserees = await db
      .insert(t.tache)
      .values(
        planning.taches.map((x) => {
          const reel = e.reelles.get(x.code)
          return {
            lotId: idLot.get(x.lot) as string,
            parentId: idTache.get(x.parent) as string,
            codeWbs: x.code,
            nom: x.nom,
            nature: x.nature,
            methodeAvancement: x.methode,
            dateDebutPrevue: jourDepuisOs(x.debut),
            dateFinPrevue: jourDepuisOs(x.fin),
            dureePrevueJ: x.duree,
            dateDebutReelle: reel?.debut ?? null,
            dateFinReelle: reel?.fin ?? null,
            poidsBudgetaireXof: x.budget,
          }
        }),
      )
      .returning({ id: t.tache.id, codeWbs: t.tache.codeWbs })
    for (const f of feuillesInserees) idTache.set(f.codeWbs, f.id)

    /* --- Quantitatif ------------------------------------------------------ */

    const lignes = planning.taches.flatMap((x) =>
      x.lignes.map((l) => ({
        tacheId: idTache.get(x.code) as string,
        designation: l.designation,
        unite: l.unite,
        quantitePrevue: l.quantite,
        prixUnitaireXof: l.pu,
        /** Cle de rapprochement pour les releves de quantite. */
        cle: `${x.code}#${x.lignes.indexOf(l)}`,
      })),
    )
    const lignesInserees = await db
      .insert(t.ligneQuantitatif)
      .values(lignes.map(({ cle: _cle, ...reste }) => reste))
      .returning({ id: t.ligneQuantitatif.id })
    const idLigne = new Map<string, string>()
    lignes.forEach((l, i) => idLigne.set(l.cle, (lignesInserees[i] as { id: string }).id))

    /* --- Liaisons ---------------------------------------------------------- */

    await db.insert(t.liaison).values(
      planning.liaisons.map((l) => ({
        tacheAmontId: idTache.get(l.amont) as string,
        tacheAvalId: idTache.get(l.aval) as string,
        type: l.type,
        decalageJ: l.decalage,
      })),
    )

    /* --- Planning de reference ------------------------------------------- */

    // Le planning calcule est fige a l'ordre de service : c'est contre lui que
    // se mesure la valeur planifiee, quoi qu'il advienne du planning courant.
    const [reference] = await db
      .insert(t.referencePlanning)
      .values({
        projetId,
        numero: 1,
        motif: 'Planning contractuel initial',
        geleLe: new Date(`${DATE_ORDRE_SERVICE}T08:00:00Z`),
        geleParId: idConducteur,
      })
      .returning({ id: t.referencePlanning.id })
    await db.insert(t.referenceTache).values(
      planning.taches.map((x) => ({
        referenceId: (reference as { id: string }).id,
        tacheId: idTache.get(x.code) as string,
        dateDebut: jourDepuisOs(x.debut),
        dateFin: jourDepuisOs(x.debut + x.duree - 1),
        dureeJ: x.duree,
      })),
    )

    /* --- Jalons ------------------------------------------------------------ */

    await db.insert(t.jalon).values(
      JALONS.map((j) => {
        const declencheur = planning.taches.find((x) => x.code === j.declencheur)
        if (!declencheur) throw new Error(`Jalon sans tâche déclenchante : ${j.declencheur}`)
        const reel = e.reelles.get(j.declencheur)
        return {
          projetId,
          nom: j.nom,
          datePrevue: jourDepuisOs(declencheur.fin),
          dateReelle: reel?.fin ?? null,
          contractuel: j.contractuel,
          tacheDeclenchanteId: idTache.get(j.declencheur) as string,
          penaliteXof: j.contractuel ? 12_000_000 : 0,
          ordre: j.ordre,
        }
      }),
    )

    /* --- Ressources et affectations ---------------------------------------- */

    const ressourcesInserees = await db
      .insert(t.ressource)
      .values(
        RESSOURCES.map((r) => ({
          projetId,
          type: r.type,
          nom: r.nom,
          capacite: r.capacite,
          coutUnitaireXof: r.cout,
          uniteCout: r.unite,
          dansFraisChantier: 'fraisChantier' in r && r.fraisChantier,
        })),
      )
      .returning({ id: t.ressource.id, nom: t.ressource.nom })
    const idRessource = new Map(ressourcesInserees.map((r) => [r.nom, r.id]))

    // Chaque tache mobilise l'equipe type de sa nature, dimensionnee a son
    // effectif : la quantite affectee est l'effectif rapporte a la capacite
    // de l'equipe. Le levage mobilise en plus la grue ; les terrassements, une
    // pelle et deux camions ; les VRD, la pelle.
    const capacite = new Map<string, number>(RESSOURCES.map((r) => [r.nom, r.capacite as number]))
    await db.insert(t.affectation).values(
      planning.taches.flatMap((x) => {
        const equipe = EQUIPE_PAR_NATURE[x.nature]
        const commun = {
          tacheId: idTache.get(x.code) as string,
          dateDebut: jourDepuisOs(x.debut),
          dateFin: jourDepuisOs(x.fin),
        }
        const affectations = [
          {
            ...commun,
            ressourceId: idRessource.get(equipe.ressource) as string,
            quantite:
              Math.round((equipe.ouvriers / (capacite.get(equipe.ressource) ?? 1)) * 100) / 100,
          },
        ]
        if (x.nature === 'LEVAGE') {
          affectations.push({
            ...commun,
            ressourceId: idRessource.get('Grue à tour 40 mètres') as string,
            quantite: 1,
          })
        }
        if (x.nature === 'TERRASSEMENT' || x.nature === 'VRD') {
          affectations.push({
            ...commun,
            ressourceId: idRessource.get('Pelle hydraulique 20 tonnes') as string,
            quantite: 1,
          })
        }
        if (x.nature === 'TERRASSEMENT') {
          affectations.push({
            ...commun,
            ressourceId: idRessource.get('Camion benne 18 tonnes') as string,
            quantite: 2,
          })
        }
        return affectations
      }),
    )

    /* --- Zones -------------------------------------------------------------- */

    const zonesInserees = await db
      .insert(t.zone)
      .values(ZONES.map((z) => ({ projetId, nom: z.nom, niveau: z.niveau, pathSvg: z.path })))
      .returning({ id: t.zone.id, nom: t.zone.nom })
    const idZone = new Map(zonesInserees.map((z) => [z.nom, z.id]))

    const liensZone = ZONES.flatMap((z) =>
      z.taches
        .filter((code) => idTache.has(code))
        .map((code) => ({
          zoneId: idZone.get(z.nom) as string,
          tacheId: idTache.get(code) as string,
        })),
    )
    await db.insert(t.zoneTache).values(liensZone)

    /* --- Maquette ----------------------------------------------------------- */

    // Maquette IFC de demonstration, convertie en GLB comme a l'import et
    // servie par le dossier public, comme les planches photographiques. Les
    // rattachements sont ceux que l'ecran propose automatiquement.
    console.log('Chargement de la maquette de demonstration...')
    const ifc = new IfcAPI()
    await ifc.Init()
    const maq = extraireMaquette(ifc, new Uint8Array(readFileSync(IFC_DEMO)))
    const glb = glbMaquette(maq)
    mkdirSync(dirname(`public${CHEMIN_GLB_DEMO}`), { recursive: true })
    writeFileSync(`public${CHEMIN_GLB_DEMO}`, glb)
    const [maquetteInseree] = await db
      .insert(t.maquette)
      .values({
        projetId,
        chemin: CHEMIN_GLB_DEMO,
        octets: glb.byteLength,
        nomFichier: 'residence-palmiers.ifc',
        schemaIfc: maq.schema,
        etages: maq.etages,
      })
      .returning({ id: t.maquette.id })
    const maquetteId = maquetteInseree?.id as string
    for (let i = 0; i < maq.elements.length; i += 1000) {
      await db
        .insert(t.elementMaquette)
        .values(maq.elements.slice(i, i + 1000).map((el) => ({ maquetteId, ...el })))
    }
    const feuilles = await client<{ id: string; nom: string }[]>`
      select t.id, t.nom from tache t
       where not exists (select 1 from tache e where e.parent_id = t.id) order by t.code_wbs`
    const propositions = proposerRegles(feuilles, classer(maq.elements, maq.etages))
    if (propositions.length > 0) {
      await db.insert(t.regleMaquette).values(
        propositions.map((r) => ({
          projetId,
          tacheId: r.tacheId,
          famille: r.famille,
          niveau: r.niveau,
          nomContient: r.nomContient,
        })),
      )
    }

    /* --- Releves journaliers ------------------------------------------------ */

    console.log(`Chargement de ${e.releves.length} relevés journaliers...`)

    const dernierJourReleve = DATE_ANALYSE
    const troisJoursAvant = formatISO(addDays(parseISO(DATE_ANALYSE), -3), {
      representation: 'date',
    })

    const relevesAInserer = e.releves.map((r) => {
      // Les tout derniers releves ne sont pas encore valides : c'est ce qui
      // rend l'alerte « releve en attente de validation » demontrable.
      const statut =
        r.date === dernierJourReleve
          ? ('BROUILLON' as const)
          : r.date > troisJoursAvant
            ? ('SOUMIS' as const)
            : ('VALIDE' as const)
      const valide = statut === 'VALIDE'
      return {
        projetId,
        lotId: idLot.get(r.lot) as string,
        date: r.date,
        auteurId: idChef,
        effectifOuvriers: r.effectifOuvriers,
        effectifEncadrement: r.effectifEncadrement,
        heuresTravaillees: r.heuresTravaillees,
        meteoCode: r.meteo.code,
        temperatureC: r.meteo.temperatureMaxC,
        precipitationsMm: r.meteo.precipitationsMm,
        rafalesKmh: r.meteo.rafalesKmh,
        journeeTravaillee: r.journeeTravaillee,
        motifArret: r.motifArret,
        observations: r.observations,
        statut,
        valideParId: valide ? idConducteur : null,
        valideLe: valide ? new Date(`${r.date}T17:30:00Z`) : null,
      }
    })

    const relevesInseres: { id: string }[] = []
    for (const paquet of paquets(relevesAInserer, 400)) {
      relevesInseres.push(
        ...(await db.insert(t.releveJournalier).values(paquet).returning({
          id: t.releveJournalier.id,
        })),
      )
    }

    const quantitesAInserer = e.releves.flatMap((r, i) => {
      const releveId = (relevesInseres[i] as { id: string }).id
      return [...r.quantites.entries()].flatMap(([codeTache, lignesJour]) =>
        lignesJour.map((q) => ({
          releveJournalierId: releveId,
          ligneQuantitatifId: idLigne.get(`${codeTache}#${q.ligne}`) as string,
          quantiteRealisee: q.quantite,
        })),
      )
    })

    console.log(`Chargement de ${quantitesAInserer.length} lignes de quantité réalisée...`)
    for (const paquet of paquets(quantitesAInserer, 1000)) {
      await db.insert(t.releveQuantite).values(paquet)
    }

    /* --- Heures d'engin ----------------------------------------------------------- */

    // Un engin affecte a une tache travaille les jours ou la tache avance :
    // huit heures par unite affectee, a quelques pour cent pres selon la
    // journee. Un terrassement qui traine coute donc des journees de pelle.
    const engins = await client`
      insert into releve_engin (releve_journalier_id, ressource_id, heures)
      select r.id, a.ressource_id,
             max(round((${COUT_HEURES_JOUR} * a.quantite
                        * (0.85 + (abs(hashtext(r.date::text || res.nom)) % 20)
                                  / 100.0))::numeric, 1))
        from releve_journalier r
        join releve_quantite q on q.releve_journalier_id = r.id
        join ligne_quantitatif lq on lq.id = q.ligne_quantitatif_id
        join affectation a on a.tache_id = lq.tache_id
        join ressource res on res.id = a.ressource_id
       where r.projet_id = ${projetId}::uuid and r.journee_travaillee
         and res.type in ('ENGIN', 'MATERIEL') and not res.dans_frais_chantier
       group by r.id, a.ressource_id`
    console.log(`  ${engins.count} relevés d’heures d’engin`)

    /* --- Journal : coulages et livraisons -------------------------------------- */

    // Chaque quantite de beton coule devient un coulage trace : classe selon
    // l'ouvrage, bon de la centrale, affaissement au cone, et un prelevement
    // de six eprouvettes (trois a 7 jours, trois a 28) par tranche de 50 m3
    // entamee. Le ferraillage est receptionne avant coulage, sauf pour le
    // beton de proprete, non arme, et pour deux coulages ou le point d'arret
    // a ete franchi. Les valeurs sont tirees de la date et du code de la
    // tache : le jeu reste reproductible.
    const coulages = await client`
      insert into releve_coulage (releve_journalier_id, rang, ouvrage, classe_beton, volume_m3,
                                  bon_livraison, affaissement_mm, eprouvettes,
                                  ferraillage_receptionne)
      select q.releve_journalier_id,
             row_number() over (partition by q.releve_journalier_id order by t.code_wbs) - 1,
             t.nom,
             case when lq.designation ilike '%propret%' then 'C16/20'
                  when t.code_wbs like '03%' then 'C25/30'
                  else 'C30/37' end,
             round(q.quantite_realisee, 2),
             'BL-' || to_char(r.date, 'YYMMDD') || '-' || replace(t.code_wbs, '.', ''),
             80 + abs(hashtext(r.date::text || t.code_wbs)) % 70,
             least(60, 6 * ceil(q.quantite_realisee / 50))::int,
             case when lq.designation ilike '%propret%' then null
                  when t.code_wbs in ('03.1.4', '04.3.1')
                   and r.date = (select min(r2.date) from releve_quantite q2
                                   join releve_journalier r2 on r2.id = q2.releve_journalier_id
                                  where q2.ligne_quantitatif_id = q.ligne_quantitatif_id)
                  then false
                  else true end
        from releve_quantite q
        join releve_journalier r on r.id = q.releve_journalier_id
        join ligne_quantitatif lq on lq.id = q.ligne_quantitatif_id
        join tache t on t.id = lq.tache_id
       where r.projet_id = ${projetId}::uuid and lq.unite = 'M3'
         and lq.designation ilike 'Béton%' and q.quantite_realisee >= 0.5`

    // Livraisons du gros oeuvre : acier le lundi, ciment le jeudi. Une
    // livraison d'acier de juillet est acceptee sous reserve.
    const livraisons = await client`
      with jours as (
        select r.id, r.date, extract(isodow from r.date)::int as jour,
               row_number() over (partition by extract(isodow from r.date) order by r.date) as n
          from releve_journalier r join lot l on l.id = r.lot_id
         where r.projet_id = ${projetId}::uuid and l.code = '04' and r.journee_travaillee
           and extract(isodow from r.date) in (1, 4))
      insert into releve_livraison (releve_journalier_id, rang, designation, fournisseur, quantite,
                                    unite, bon_livraison, conforme, reserve)
      select id, 0,
             case jour when 1 then 'Acier HA haute adhérence, barres de 12 m'
                       else 'Ciment CEM II/A 42,5 R, sacs de 50 kg' end,
             case jour when 1 then 'Aciers de la Lagune' else 'Ciments de la Lagune' end,
             case jour when 1 then 6 + abs(hashtext(date::text)) % 7 else 10 end,
             'T'::unite_mesure,
             case jour when 1 then 'ACV-' else 'CDL-' end || to_char(date, 'YYMMDD'),
             not (jour = 1 and date between '2026-07-01' and '2026-07-07'),
             case when jour = 1 and date between '2026-07-01' and '2026-07-07'
                  then 'Barres HA 12 oxydées sur un paquet de 0,8 t : paquet refusé, avoir demandé.'
             end
        from jours`
    console.log(`  ${coulages.count} coulages et ${livraisons.count} livraisons au journal`)

    // Essais du laboratoire : trois eprouvettes a 7 jours, trois a 28 jours
    // par prelevement. La resistance moyenne vise fck + 3 a fck + 9 MPa, le
    // 7 jours en donne 68 %. Les resultats a 28 jours sont rendus trois jours
    // apres l'echeance : les derniers coulages attendent encore les leurs.
    const essais = await client`
      insert into essai_beton (coulage_id, prelevement, age_j, date_ecrasement, resistance_mpa,
                               laboratoire)
      select c.id, p.k, a.age, r.date + a.age,
             round(((split_part(substr(c.classe_beton, 2), '/', 1)::int
                     + 3 + (abs(hashtext(r.date::text || c.ouvrage || c.rang || p.k)) % 60) / 10.0
                     + ((abs(hashtext(r.date::text || c.ouvrage || c.rang || p.k || e.n)) % 30) - 15) / 10.0)
                    * case a.age when 7 then 0.68 else 1 end)::numeric, 1),
             'Laboratoire d’essais du chantier'
        from releve_coulage c
        join releve_journalier r on r.id = c.releve_journalier_id
        cross join lateral generate_series(1, greatest(1, c.eprouvettes / 6)) p(k)
        cross join (values (7), (28)) a(age)
        cross join generate_series(1, 3) e(n)
       where r.projet_id = ${projetId}::uuid and c.eprouvettes > 0
         and r.date + a.age + 3 <= ${DATE_ANALYSE}::date`
    // Le prelevement des voiles du R+1 coule mi-juin est non conforme : le
    // 7 jours l'annoncait deja.
    const [voile] = await client<{ id: string; date: string }[]>`
      select c.id, r.date::text as date from releve_coulage c
        join releve_journalier r on r.id = c.releve_journalier_id
        join tache t on t.nom = c.ouvrage and t.code_wbs = '04.2.2'
       where r.projet_id = ${projetId}::uuid
       order by abs(r.date - '2026-06-16'::date), r.date limit 1`
    if (voile) {
      await client`delete from essai_beton where coulage_id = ${voile.id}::uuid and prelevement = 1`
      await client`
        insert into essai_beton (coulage_id, prelevement, age_j, date_ecrasement, resistance_mpa,
                                 laboratoire)
        select ${voile.id}::uuid, 1, v.age, ${voile.date}::date + v.age, v.mpa,
               'Laboratoire d’essais du chantier'
          from (values (7, 16.1), (7, 15.2), (7, 16.4), (28, 24.8), (28, 23.6), (28, 24.5))
               v(age, mpa)`
    }
    console.log(`  ${essais.count} éprouvettes au registre des essais`)

    /* --- Aleas ---------------------------------------------------------------- */

    await db.insert(t.alea).values(
      e.aleas.map((a) => ({
        projetId,
        lotId: a.lot === null ? null : ((idLot.get(a.lot) ?? null) as string | null),
        tacheId: a.tache === null ? null : ((idTache.get(a.tache) ?? null) as string | null),
        date: a.date,
        type: a.type,
        gravite: a.gravite,
        description: a.description,
        impactDelaiJ: a.impactDelaiJ,
        impactCoutXof: a.impactCoutXof,
        statut: a.statut,
        // Constatees contradictoirement en reunion de chantier.
        decisionIntemperie: a.type === 'INTEMPERIE' ? ('RECONNUE' as const) : null,
        declareParId: idConducteur,
        resoluLe: a.resoluLe,
      })),
    )

    /* --- Fiches de non-conformite ------------------------------------------- */

    // Une fiche par non-conformite, reliee a l'alea qui porte le cout de la
    // reprise. Traitee sous une semaine ; levee a la resolution de l'alea.
    const aleasNc = await client<{ id: string; date: string; resolu: string | null }[]>`
      select id, date::text as date, resolu_le::text as resolu from alea
       where projet_id = ${projetId}::uuid and type = 'NON_CONFORMITE' order by date`
    let numeroNc = 0
    for (const nc of NON_CONFORMITES) {
      const date = jourDepuisOs(nc.jour)
      const a = aleasNc.find((x) => x.date === date)
      const traitee = nc.cause !== null && nc.action !== null
      numeroNc += 1
      await db.insert(t.nonConformite).values({
        projetId,
        numero: numeroNc,
        dateConstat: date,
        lotId: idLot.get(nc.lot) as string,
        aleaId: a?.id ?? null,
        coulageId: nc.jour === 134 ? (voile?.id ?? null) : null,
        titre: nc.titre,
        constat: nc.description,
        gravite: nc.gravite,
        cause: nc.cause,
        action: nc.action,
        statut: !traitee ? 'OUVERTE' : nc.resolu === null ? 'TRAITEE' : 'LEVEE',
        traiteeLe: traitee ? jourDepuisOs(Math.min(nc.jour + 5, nc.resolu ?? nc.jour + 5)) : null,
        leveeLe: traitee && nc.resolu !== null ? jourDepuisOs(nc.resolu) : null,
        creeParId: idConducteur,
      })
    }

    /* --- Ordres de service -------------------------------------------------- */

    await db.insert(t.ordreService).values({
      projetId,
      numero: 1,
      date: DATE_ORDRE_SERVICE,
      type: 'DEMARRAGE',
      objet: 'Ordre de service de démarrage des travaux',
      creeParId: idConducteur,
    })

    /* --- Sous-traitants -------------------------------------------------------- */

    // Trois sous-traitants : deux agrees avant d'intervenir, un en attente
    // d'agrement sur un lot qui n'a pas commence.
    const SOUS_TRAITANTS = [
      {
        raisonSociale: 'Couvertures et Étanchéité de la Lagune',
        specialite: 'Charpente, couverture et étanchéité',
        montantXof: 58_000_000,
        demandeLe: '2026-06-01',
        statut: 'AGREE' as const,
        statueLe: '2026-06-12',
        lot: '05',
      },
      {
        raisonSociale: 'Fluides Techniques d’Angré',
        specialite: 'Plomberie, électricité, ventilation',
        montantXof: 118_000_000,
        demandeLe: '2026-07-15',
        statut: 'AGREE' as const,
        statueLe: '2026-07-28',
        lot: '07',
      },
      {
        raisonSociale: 'Aménagements du Littoral',
        specialite: 'Revêtements, peinture et espaces extérieurs',
        montantXof: 95_000_000,
        demandeLe: '2026-09-20',
        statut: 'DEMANDE' as const,
        statueLe: null,
        lot: '08',
      },
    ]
    for (const st of SOUS_TRAITANTS) {
      const [ins] = await db
        .insert(t.sousTraitant)
        .values({
          projetId,
          raisonSociale: st.raisonSociale,
          specialite: st.specialite,
          montantXof: st.montantXof,
          demandeLe: st.demandeLe,
          statut: st.statut,
          statueLe: st.statueLe,
          creeParId: idConducteur,
        })
        .returning({ id: t.sousTraitant.id })
      await db
        .insert(t.sousTraitantLot)
        .values({ sousTraitantId: ins?.id as string, lotId: idLot.get(st.lot) as string })
    }

    /* --- Registre de securite ---------------------------------------------------- */

    // Quart d'heure securite chaque lundi travaille, devant l'effectif du
    // jour ; visite du coordonnateur toutes les quatre semaines.
    await client`
      insert into evenement_securite (projet_id, date, type, description, participants, cree_par_id)
      select ${projetId}::uuid, j.date, 'CAUSERIE',
             (array['Port des équipements de protection individuelle',
                    'Travail en hauteur et garde-corps',
                    'Élingage et charges suspendues sous la grue',
                    'Circulation des engins et zones balisées',
                    'Coffrage, décoffrage et étaiement',
                    'Chaleur : hydratation et pauses à l’ombre',
                    'Outils électroportatifs et rallonges',
                    'Ordre et propreté du chantier'])[1 + (row_number() over (order by j.date))::int % 8],
             j.presents, ${idChef}::uuid
        from (select r.date, sum(r.effectif_ouvriers + r.effectif_encadrement)::int as presents
                from releve_journalier r
               where r.projet_id = ${projetId}::uuid and r.statut = 'VALIDE'
                 and r.journee_travaillee and extract(isodow from r.date) = 1
               group by r.date) j
       where j.presents > 0`
    await client`
      insert into evenement_securite (projet_id, date, type, description, cree_par_id)
      select ${projetId}::uuid, d::date, 'VISITE',
             'Visite du coordonnateur sécurité : registre et plan particulier de sécurité tenus à jour.',
             ${idConducteur}::uuid
        from generate_series(${DATE_ORDRE_SERVICE}::date + 14, ${DATE_ANALYSE}::date, interval '28 days') d`
    const EVENEMENTS = [
      {
        date: '2026-05-19',
        type: 'ACCIDENT_AVEC_ARRET' as const,
        lot: '03',
        joursArret: 4,
        description:
          'Entorse de la cheville d’un ouvrier en descendant dans une fouille de semelle sans échelle. Échelles fixées à chaque fouille depuis.',
      },
      {
        date: '2026-07-08',
        type: 'ACCIDENT_SANS_ARRET' as const,
        lot: '04',
        joursArret: 0,
        description:
          'Coupure superficielle à la main lors du façonnage des aciers, gants non portés. Soins sur place.',
      },
      {
        date: '2026-08-21',
        type: 'PRESQU_ACCIDENT' as const,
        lot: '04',
        joursArret: 0,
        description:
          'Balancement d’une banche au levage par vent fort ; personne dans la zone balisée. Levages suspendus au-delà de 50 km/h.',
      },
      {
        date: '2026-09-10',
        type: 'SITUATION_DANGEREUSE' as const,
        lot: '04',
        joursArret: 0,
        description: 'Garde-corps périphérique manquant sur deux travées du plancher haut R+2.',
      },
    ]
    await db.insert(t.evenementSecurite).values(
      EVENEMENTS.map((e) => ({
        projetId,
        date: e.date,
        type: e.type,
        lotId: idLot.get(e.lot) as string,
        description: e.description,
        joursArret: e.joursArret,
        creeParId: idChef,
      })),
    )

    /* --- Reserves ------------------------------------------------------------ */

    // Visite de pre-reception des supports du rez-de-chaussee par le maitre
    // d'oeuvre, avant le second oeuvre : six reserves sur le gros oeuvre,
    // deux deja levees.
    const zonesRdc = await client<{ id: string; nom: string }[]>`
      select id, nom from zone where projet_id = ${projetId}::uuid and niveau = 0 order by nom`
    const zoneRdc = (nom: string) => zonesRdc.find((z) => z.nom.endsWith(nom))?.id ?? null
    const idMoe = parRole.get('MOE') as string
    const RESERVES = [
      [
        'Hall et circulations',
        'Balèvres de coffrage sur le voile de la cage d’escalier, à ragréer.',
        '2026-09-29',
      ],
      [
        'Hall et circulations',
        'Trémie de gaine technique décalée de 6 cm par rapport au plan d’exécution.',
        null,
      ],
      [
        'Logements nord',
        'Nid de cailloux en pied du poteau P4, à reprendre au mortier de réparation.',
        '2026-09-26',
      ],
      ['Logements nord', 'Réservation de porte palière trop étroite de 4 cm.', null],
      ['Logements sud', 'Arase d’allège non horizontale sur la baie B12, écart de 12 mm.', null],
      ['Logements sud', 'Fer en attente non protégé en tête de poteau P9.', null],
    ] as const
    await db.insert(t.reserve).values(
      RESERVES.map(([zone, description, levee], i) => ({
        projetId,
        numero: i + 1,
        phase: 'OPR' as const,
        zoneId: zoneRdc(zone),
        lotId: idLot.get('04') as string,
        description,
        constateeLe: '2026-09-22',
        echeance: '2026-10-06',
        leveeLe: levee,
        creeParId: idMoe,
        leveeParId: levee === null ? null : idMoe,
      })),
    )

    /* --- Points de vue et planches photographiques ----------------------------- */

    const pdvInseres = await db
      .insert(t.pointDeVue)
      .values(
        POINTS_DE_VUE.map((p) => ({
          projetId,
          nom: p.nom,
          latitude: p.lat,
          longitude: p.lon,
          capDegres: p.cap,
        })),
      )
      .returning({ id: t.pointDeVue.id, nom: t.pointDeVue.nom })
    const idPdv = new Map(pdvInseres.map((p) => [p.nom, p.id]))

    // Huit prises de vue reparties sur la periode, chacune portant l'avancement
    // du gros oeuvre reellement constate a cette date.
    const budgetGo = planning.budgetParLot.get('04') ?? 1
    const datesPrises = repartirDates(8).map((date) => ({
      date,
      avancement: avancementGoA(e, date, budgetGo),
    }))

    const planches = fabriquerPlanches(
      POINTS_DE_VUE.map((p) => p.nom),
      datesPrises,
    )

    await db.insert(t.photo).values(
      planches.map((p) => ({
        projetId,
        pointDeVueId: idPdv.get(p.pointDeVue) as string,
        chemin: p.chemin,
        cheminVignette: p.cheminVignette,
        largeur: p.largeur,
        hauteur: p.hauteur,
        octets: p.octets,
        priseLe: new Date(`${p.date}T09:15:00Z`),
        legende: p.legende,
      })),
    )

    /* --- Reactivation des declencheurs ------------------------------------------ */

    for (const table of TABLES_AUDITEES) {
      await client.unsafe(`alter table ${table} enable trigger user`)
    }
    await db.execute(sql`analyze`)

    /* --- Decomptes ------------------------------------------------------------- */

    // Les situations de mars a juillet ont ete presentees en debut de mois
    // suivant et acceptees par le maitre d'oeuvre ; celle d'aout est
    // presentee et attend sa decision. Elles se calculent sur le cache, d'ou
    // un premier calcul ici, par les memes fonctions que l'application.
    await db
      .insert(t.indiceRevision)
      .values(INDICES_REVISION.map(([mois, valeur]) => ({ projetId, mois, valeur })))
    await recompute(db, projetId)
    const idMoeDecompte = parRole.get('MOE') as string
    for (const [mois, accepte] of [
      ['2026-03', true],
      ['2026-04', true],
      ['2026-05', true],
      ['2026-06', true],
      ['2026-07', true],
      ['2026-08', false],
    ] as const) {
      const [a, m] = mois.split('-').map(Number) as [number, number]
      const presente = new Date(Date.UTC(a, m, 5)).toISOString().slice(0, 10)
      const decide = new Date(Date.UTC(a, m, 15)).toISOString().slice(0, 10)
      await presenterDecompte(db, projetId, mois, presente, idConducteur)
      if (accepte) {
        await statuerDecompte(db, projetId, mois, 'ACCEPTEE', decide, idMoeDecompte)
      }
    }

    /* --- Compte rendu ------------------------------------------------------------ */

    const secondes = ((Date.now() - debut) / 1000).toFixed(1)
    console.log()
    console.log('Peuplement termine en ' + secondes + ' s')
    console.log(`  projet            ${PROJET.code}`)
    console.log(`  lots              ${LOTS.length}`)
    console.log(
      `  taches            ${planning.noeuds.length} noeuds + ${planning.taches.length} feuilles`,
    )
    console.log(`  liaisons          ${planning.liaisons.length}`)
    console.log(`  quantitatif       ${lignes.length} lignes`)
    console.log(`  releves           ${e.releves.length}`)
    console.log(`  quantites         ${quantitesAInserer.length}`)
    console.log(`  aleas             ${e.aleas.length}`)
    console.log(`  photos            ${planches.length}`)
    console.log(`  durée calculée    ${dureeContractuelle} jours`)
  } finally {
    await fermer()
  }
}

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                */
/* -------------------------------------------------------------------------- */

function* paquets<T>(elements: readonly T[], taille: number): Generator<T[]> {
  for (let i = 0; i < elements.length; i += taille) yield elements.slice(i, i + taille)
}

/** Huit dates regulierement reparties entre l'ordre de service et l'analyse. */
function repartirDates(combien: number): string[] {
  const total = differenceInCalendarDays(parseISO(DATE_ANALYSE), parseISO(DATE_ORDRE_SERVICE))
  return Array.from({ length: combien }, (_, i) =>
    jourDepuisOs(Math.round((total * (i + 1)) / combien)),
  )
}

/** Avancement du gros oeuvre a une date, en valeur acquise sur budget. */
function avancementGoA(
  e: ReturnType<typeof simulerExecution>,
  date: string,
  budgetGo: number,
): number {
  let acquis = 0
  for (const releve of e.releves) {
    if (releve.lot !== '04' || releve.date > date) continue
    for (const [code, lignesJour] of releve.quantites) {
      const tache = e.planning.taches.find((x) => x.code === code)
      if (!tache) continue
      for (const q of lignesJour) {
        const ligne = tache.lignes[q.ligne]
        if (ligne) acquis += q.quantite * ligne.pu
      }
    }
  }
  return Math.min(1, acquis / budgetGo)
}

/** Garde le montant de la ligne coherent avec la colonne generee. */
export { montantLigne }

peupler().catch((erreur: unknown) => {
  console.error(erreur)
  process.exitCode = 1
})
