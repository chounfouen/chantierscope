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

import bcrypt from 'bcryptjs'
import { addDays, differenceInCalendarDays, formatISO, parseISO } from 'date-fns'
import { sql } from 'drizzle-orm'
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
  ZONES,
} from '@/db/seed/catalogue'
import { simulerExecution } from '@/db/seed/execution'
import { fabriquerPlanches } from '@/db/seed/photos'
import { montantLigne } from '@/db/seed/planning'

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
  'snapshot_avancement',
  'photo',
  'point_de_vue',
  'zone_tache',
  'zone',
  'affectation',
  'ressource',
  'alea',
  'jalon',
  'releve_quantite',
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
  'releve_journalier',
  'releve_quantite',
  'ligne_quantitatif',
  'tache',
  'liaison',
]

const jourDepuisOs = (n: number): string =>
  formatISO(addDays(parseISO(DATE_ORDRE_SERVICE), n), { representation: 'date' })

async function peupler(): Promise<void> {
  const debut = Date.now()
  const { db, client, fermer } = dbScript()

  try {
    console.log('Simulation de l’execution du chantier...')
    const e = simulerExecution()
    const { planning } = e

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
        })),
      )
      .returning({ id: t.ressource.id, nom: t.ressource.nom })
    const idRessource = new Map(ressourcesInserees.map((r) => [r.nom, r.id]))

    // Chaque tache mobilise l'equipe type de sa nature, dimensionnee a son
    // effectif : la quantite affectee est l'effectif rapporte a la capacite
    // de l'equipe. Le levage mobilise en plus la grue.
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
        declareParId: idConducteur,
        resoluLe: a.resoluLe,
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
