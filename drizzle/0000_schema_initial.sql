CREATE TYPE "public"."methode_avancement" AS ENUM('UNITES_PHYSIQUES', 'JALONS_PONDERES', 'PROPORTION_DUREE', 'ZERO_CENT');--> statement-breakpoint
CREATE TYPE "public"."nature_tache" AS ENUM('TERRASSEMENT', 'VRD', 'ENROBES', 'FONDATION', 'BETONNAGE', 'LEVAGE', 'MACONNERIE', 'CHARPENTE', 'ETANCHEITE', 'ENDUIT', 'INTERIEUR', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."role_utilisateur" AS ENUM('CHEF_CHANTIER', 'CONDUCTEUR', 'MOE', 'MOA', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."statut_alea" AS ENUM('OUVERT', 'EN_TRAITEMENT', 'SOLDE');--> statement-breakpoint
CREATE TYPE "public"."statut_releve" AS ENUM('BROUILLON', 'SOUMIS', 'VALIDE', 'RECTIFIE');--> statement-breakpoint
CREATE TYPE "public"."type_alea" AS ENUM('INTEMPERIE', 'INCIDENT', 'NON_CONFORMITE', 'AVENANT', 'PANNE_ENGIN', 'RUPTURE_APPROVISIONNEMENT', 'ADMINISTRATIF');--> statement-breakpoint
CREATE TYPE "public"."type_liaison" AS ENUM('FD', 'DD', 'FF', 'DF');--> statement-breakpoint
CREATE TYPE "public"."type_ressource" AS ENUM('EQUIPE', 'ENGIN', 'MATERIEL', 'MATERIAU');--> statement-breakpoint
CREATE TYPE "public"."unite_cout" AS ENUM('JOUR', 'HEURE', 'UNITE');--> statement-breakpoint
CREATE TYPE "public"."unite_mesure" AS ENUM('M3', 'M2', 'ML', 'KG', 'T', 'U', 'ENS', 'FORFAIT');--> statement-breakpoint
CREATE TABLE "acces_projet" (
	"utilisateur_id" uuid NOT NULL,
	"projet_id" uuid NOT NULL,
	CONSTRAINT "acces_projet_utilisateur_id_projet_id_pk" PRIMARY KEY("utilisateur_id","projet_id")
);
--> statement-breakpoint
CREATE TABLE "affectation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tache_id" uuid NOT NULL,
	"ressource_id" uuid NOT NULL,
	"quantite" numeric(10, 2) DEFAULT 1 NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date NOT NULL,
	CONSTRAINT "affectation_fin_apres_debut" CHECK ("affectation"."date_fin" >= "affectation"."date_debut"),
	CONSTRAINT "affectation_quantite_positive" CHECK ("affectation"."quantite" > 0)
);
--> statement-breakpoint
CREATE TABLE "alea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"lot_id" uuid,
	"tache_id" uuid,
	"date" date NOT NULL,
	"type" "type_alea" NOT NULL,
	"gravite" smallint NOT NULL,
	"description" text NOT NULL,
	"impact_delai_j" integer DEFAULT 0 NOT NULL,
	"impact_cout_xof" bigint DEFAULT 0 NOT NULL,
	"statut" "statut_alea" DEFAULT 'OUVERT' NOT NULL,
	"declare_par_id" uuid,
	"resolu_le" date,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alea_gravite_borne" CHECK ("alea"."gravite" between 1 and 4),
	CONSTRAINT "alea_impact_delai_positif" CHECK ("alea"."impact_delai_j" >= 0),
	CONSTRAINT "alea_resolution_coherente" CHECK ("alea"."statut" <> 'SOLDE' or "alea"."resolu_le" is not null),
	CONSTRAINT "alea_resolution_apres_fait" CHECK ("alea"."resolu_le" is null or "alea"."resolu_le" >= "alea"."date")
);
--> statement-breakpoint
CREATE TABLE "jalon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"date_prevue" date NOT NULL,
	"date_reelle" date,
	"contractuel" boolean DEFAULT false NOT NULL,
	"tache_declenchante_id" uuid,
	"penalite_xof" bigint DEFAULT 0 NOT NULL,
	"ordre" smallint NOT NULL,
	CONSTRAINT "jalon_unique" UNIQUE("projet_id","nom"),
	CONSTRAINT "jalon_penalite_positive" CHECK ("jalon"."penalite_xof" >= 0)
);
--> statement-breakpoint
CREATE TABLE "journal_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"utilisateur_id" uuid,
	"action" text NOT NULL,
	"entite" text NOT NULL,
	"entite_id" uuid,
	"avant" jsonb,
	"apres" jsonb,
	"horodatage" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liaison" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tache_amont_id" uuid NOT NULL,
	"tache_aval_id" uuid NOT NULL,
	"type" "type_liaison" DEFAULT 'FD' NOT NULL,
	"decalage_j" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "liaison_unique" UNIQUE("tache_amont_id","tache_aval_id","type"),
	CONSTRAINT "liaison_pas_reflexive" CHECK ("liaison"."tache_amont_id" <> "liaison"."tache_aval_id")
);
--> statement-breakpoint
CREATE TABLE "ligne_quantitatif" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tache_id" uuid NOT NULL,
	"designation" text NOT NULL,
	"unite" "unite_mesure" NOT NULL,
	"quantite_prevue" numeric(14, 3) NOT NULL,
	"prix_unitaire_xof" bigint NOT NULL,
	"montant_xof" bigint GENERATED ALWAYS AS (round(quantite_prevue * prix_unitaire_xof)::bigint) STORED,
	CONSTRAINT "ligne_quantite_positive" CHECK ("ligne_quantitatif"."quantite_prevue" > 0),
	CONSTRAINT "ligne_prix_positif" CHECK ("ligne_quantitatif"."prix_unitaire_xof" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"ordre" smallint NOT NULL,
	"budget_xof" bigint NOT NULL,
	"rang_couleur" smallint NOT NULL,
	CONSTRAINT "lot_code_unique" UNIQUE("projet_id","code"),
	CONSTRAINT "lot_rang_couleur_unique" UNIQUE("projet_id","rang_couleur"),
	CONSTRAINT "lot_budget_positif" CHECK ("lot"."budget_xof" >= 0),
	CONSTRAINT "lot_rang_couleur_borne" CHECK ("lot"."rang_couleur" between 0 and 7)
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"releve_journalier_id" uuid,
	"tache_id" uuid,
	"zone_id" uuid,
	"point_de_vue_id" uuid,
	"chemin" text NOT NULL,
	"chemin_vignette" text NOT NULL,
	"largeur" smallint,
	"hauteur" smallint,
	"octets" integer,
	"prise_le" timestamp with time zone NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"cap_degres" smallint,
	"legende" text,
	CONSTRAINT "photo_octets_positif" CHECK ("photo"."octets" is null or "photo"."octets" > 0)
);
--> statement-breakpoint
CREATE TABLE "point_de_vue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"cap_degres" smallint,
	CONSTRAINT "point_de_vue_unique" UNIQUE("projet_id","nom"),
	CONSTRAINT "point_de_vue_cap_borne" CHECK ("point_de_vue"."cap_degres" is null or "point_de_vue"."cap_degres" between 0 and 359)
);
--> statement-breakpoint
CREATE TABLE "projet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"nom" text NOT NULL,
	"maitre_ouvrage" text NOT NULL,
	"maitre_oeuvre" text NOT NULL,
	"entreprise" text NOT NULL,
	"lieu" text NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"date_ordre_service" date NOT NULL,
	"duree_contractuelle_j" integer NOT NULL,
	"date_fin_contractuelle" date NOT NULL,
	"montant_marche_xof" bigint NOT NULL,
	"taux_penalite_journaliere" numeric(8, 7) DEFAULT 0.001 NOT NULL,
	"devise" text DEFAULT 'XOF' NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projet_code_unique" UNIQUE("code"),
	CONSTRAINT "projet_devise_xof" CHECK ("projet"."devise" = 'XOF'),
	CONSTRAINT "projet_duree_positive" CHECK ("projet"."duree_contractuelle_j" > 0),
	CONSTRAINT "projet_montant_positif" CHECK ("projet"."montant_marche_xof" > 0),
	CONSTRAINT "projet_penalite_fraction" CHECK ("projet"."taux_penalite_journaliere" >= 0 and "projet"."taux_penalite_journaliere" <= 1),
	CONSTRAINT "projet_fin_apres_debut" CHECK ("projet"."date_fin_contractuelle" > "projet"."date_ordre_service")
);
--> statement-breakpoint
CREATE TABLE "releve_journalier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"date" date NOT NULL,
	"auteur_id" uuid,
	"effectif_ouvriers" smallint DEFAULT 0 NOT NULL,
	"effectif_encadrement" smallint DEFAULT 0 NOT NULL,
	"heures_travaillees" numeric(5, 2) DEFAULT 0 NOT NULL,
	"meteo_code" smallint,
	"temperature_c" numeric(4, 1),
	"precipitations_mm" numeric(6, 2),
	"rafales_kmh" numeric(5, 1),
	"journee_travaillee" boolean DEFAULT true NOT NULL,
	"motif_arret" text,
	"observations" text,
	"statut" "statut_releve" DEFAULT 'BROUILLON' NOT NULL,
	"valide_par_id" uuid,
	"valide_le" timestamp with time zone,
	"remplace_par" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releve_effectifs_positifs" CHECK ("releve_journalier"."effectif_ouvriers" >= 0 and "releve_journalier"."effectif_encadrement" >= 0),
	CONSTRAINT "releve_heures_positives" CHECK ("releve_journalier"."heures_travaillees" >= 0),
	CONSTRAINT "releve_arret_motive" CHECK ("releve_journalier"."journee_travaillee" or "releve_journalier"."motif_arret" is not null),
	CONSTRAINT "releve_validation_complete" CHECK ("releve_journalier"."statut" <> 'VALIDE' or ("releve_journalier"."valide_par_id" is not null and "releve_journalier"."valide_le" is not null))
);
--> statement-breakpoint
CREATE TABLE "releve_quantite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"releve_journalier_id" uuid NOT NULL,
	"ligne_quantitatif_id" uuid NOT NULL,
	"quantite_realisee" numeric(14, 3) NOT NULL,
	"commentaire" text,
	CONSTRAINT "releve_quantite_unique" UNIQUE("releve_journalier_id","ligne_quantitatif_id"),
	CONSTRAINT "releve_quantite_positive" CHECK ("releve_quantite"."quantite_realisee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ressource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"type" "type_ressource" NOT NULL,
	"nom" text NOT NULL,
	"capacite" numeric(10, 2),
	"cout_unitaire_xof" bigint DEFAULT 0 NOT NULL,
	"unite_cout" "unite_cout" DEFAULT 'JOUR' NOT NULL,
	CONSTRAINT "ressource_unique" UNIQUE("projet_id","nom"),
	CONSTRAINT "ressource_cout_positif" CHECK ("ressource"."cout_unitaire_xof" >= 0)
);
--> statement-breakpoint
CREATE TABLE "snapshot_avancement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"lot_id" uuid,
	"date" date NOT NULL,
	"avancement_pct" numeric(7, 6) NOT NULL,
	"valeur_planifiee_xof" bigint NOT NULL,
	"valeur_acquise_xof" bigint NOT NULL,
	"cout_reel_xof" bigint NOT NULL,
	"spi" numeric(10, 6),
	"cpi" numeric(10, 6),
	"date_fin_projetee" date,
	"calcule_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_avancement_fraction" CHECK ("snapshot_avancement"."avancement_pct" between 0 and 1),
	CONSTRAINT "snapshot_montants_positifs" CHECK ("snapshot_avancement"."valeur_planifiee_xof" >= 0 and "snapshot_avancement"."valeur_acquise_xof" >= 0 and "snapshot_avancement"."cout_reel_xof" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"parent_id" uuid,
	"code_wbs" text NOT NULL,
	"nom" text NOT NULL,
	"nature" "nature_tache" NOT NULL,
	"methode_avancement" "methode_avancement" DEFAULT 'UNITES_PHYSIQUES' NOT NULL,
	"date_debut_prevue" date NOT NULL,
	"date_fin_prevue" date NOT NULL,
	"duree_prevue_j" integer NOT NULL,
	"date_debut_reelle" date,
	"date_fin_reelle" date,
	"poids_budgetaire_xof" bigint DEFAULT 0 NOT NULL,
	"avancement_pct" numeric(7, 6) DEFAULT 0 NOT NULL,
	"marge_libre_j" integer,
	"marge_totale_j" integer,
	"critique" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tache_code_wbs_unique" UNIQUE("lot_id","code_wbs"),
	CONSTRAINT "tache_duree_positive" CHECK ("tache"."duree_prevue_j" > 0),
	CONSTRAINT "tache_fin_apres_debut" CHECK ("tache"."date_fin_prevue" >= "tache"."date_debut_prevue"),
	CONSTRAINT "tache_fin_reelle_apres_debut" CHECK ("tache"."date_fin_reelle" is null or "tache"."date_debut_reelle" is null or "tache"."date_fin_reelle" >= "tache"."date_debut_reelle"),
	CONSTRAINT "tache_avancement_fraction" CHECK ("tache"."avancement_pct" between 0 and 1),
	CONSTRAINT "tache_pas_son_propre_parent" CHECK ("tache"."parent_id" is null or "tache"."parent_id" <> "tache"."id")
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nom" text NOT NULL,
	"role" "role_utilisateur" NOT NULL,
	"mot_de_passe_hash" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"niveau" smallint NOT NULL,
	"path_svg" text NOT NULL,
	CONSTRAINT "zone_unique" UNIQUE("projet_id","nom")
);
--> statement-breakpoint
CREATE TABLE "zone_tache" (
	"zone_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	CONSTRAINT "zone_tache_zone_id_tache_id_pk" PRIMARY KEY("zone_id","tache_id")
);
--> statement-breakpoint
ALTER TABLE "acces_projet" ADD CONSTRAINT "acces_projet_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acces_projet" ADD CONSTRAINT "acces_projet_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation" ADD CONSTRAINT "affectation_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affectation" ADD CONSTRAINT "affectation_ressource_id_ressource_id_fk" FOREIGN KEY ("ressource_id") REFERENCES "public"."ressource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alea" ADD CONSTRAINT "alea_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alea" ADD CONSTRAINT "alea_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alea" ADD CONSTRAINT "alea_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alea" ADD CONSTRAINT "alea_declare_par_id_utilisateur_id_fk" FOREIGN KEY ("declare_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jalon" ADD CONSTRAINT "jalon_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jalon" ADD CONSTRAINT "jalon_tache_declenchante_id_tache_id_fk" FOREIGN KEY ("tache_declenchante_id") REFERENCES "public"."tache"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liaison" ADD CONSTRAINT "liaison_tache_amont_id_tache_id_fk" FOREIGN KEY ("tache_amont_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liaison" ADD CONSTRAINT "liaison_tache_aval_id_tache_id_fk" FOREIGN KEY ("tache_aval_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ligne_quantitatif" ADD CONSTRAINT "ligne_quantitatif_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_releve_journalier_id_releve_journalier_id_fk" FOREIGN KEY ("releve_journalier_id") REFERENCES "public"."releve_journalier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_point_de_vue_id_point_de_vue_id_fk" FOREIGN KEY ("point_de_vue_id") REFERENCES "public"."point_de_vue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_de_vue" ADD CONSTRAINT "point_de_vue_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_journalier" ADD CONSTRAINT "releve_journalier_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_journalier" ADD CONSTRAINT "releve_journalier_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_journalier" ADD CONSTRAINT "releve_journalier_auteur_id_utilisateur_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_journalier" ADD CONSTRAINT "releve_journalier_valide_par_id_utilisateur_id_fk" FOREIGN KEY ("valide_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_journalier" ADD CONSTRAINT "releve_journalier_remplace_par_releve_journalier_id_fk" FOREIGN KEY ("remplace_par") REFERENCES "public"."releve_journalier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_quantite" ADD CONSTRAINT "releve_quantite_releve_journalier_id_releve_journalier_id_fk" FOREIGN KEY ("releve_journalier_id") REFERENCES "public"."releve_journalier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_quantite" ADD CONSTRAINT "releve_quantite_ligne_quantitatif_id_ligne_quantitatif_id_fk" FOREIGN KEY ("ligne_quantitatif_id") REFERENCES "public"."ligne_quantitatif"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ressource" ADD CONSTRAINT "ressource_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_avancement" ADD CONSTRAINT "snapshot_avancement_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_avancement" ADD CONSTRAINT "snapshot_avancement_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache" ADD CONSTRAINT "tache_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tache" ADD CONSTRAINT "tache_parent_id_tache_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_tache" ADD CONSTRAINT "zone_tache_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_tache" ADD CONSTRAINT "zone_tache_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acces_projet_projet_idx" ON "acces_projet" USING btree ("projet_id");--> statement-breakpoint
CREATE INDEX "affectation_tache_idx" ON "affectation" USING btree ("tache_id");--> statement-breakpoint
CREATE INDEX "affectation_ressource_idx" ON "affectation" USING btree ("ressource_id","date_debut");--> statement-breakpoint
CREATE INDEX "alea_projet_date_idx" ON "alea" USING btree ("projet_id","date");--> statement-breakpoint
CREATE INDEX "alea_statut_idx" ON "alea" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "jalon_date_idx" ON "jalon" USING btree ("projet_id","date_prevue");--> statement-breakpoint
CREATE INDEX "audit_entite_idx" ON "journal_audit" USING btree ("entite","entite_id");--> statement-breakpoint
CREATE INDEX "audit_horodatage_idx" ON "journal_audit" USING btree ("horodatage");--> statement-breakpoint
CREATE INDEX "audit_utilisateur_idx" ON "journal_audit" USING btree ("utilisateur_id");--> statement-breakpoint
CREATE INDEX "liaison_amont_idx" ON "liaison" USING btree ("tache_amont_id");--> statement-breakpoint
CREATE INDEX "liaison_aval_idx" ON "liaison" USING btree ("tache_aval_id");--> statement-breakpoint
CREATE INDEX "ligne_quantitatif_tache_idx" ON "ligne_quantitatif" USING btree ("tache_id");--> statement-breakpoint
CREATE INDEX "photo_point_de_vue_idx" ON "photo" USING btree ("point_de_vue_id","prise_le");--> statement-breakpoint
CREATE INDEX "photo_projet_idx" ON "photo" USING btree ("projet_id","prise_le");--> statement-breakpoint
CREATE UNIQUE INDEX "releve_actif_unique" ON "releve_journalier" USING btree ("lot_id","date") WHERE statut <> 'RECTIFIE';--> statement-breakpoint
CREATE INDEX "releve_projet_date_idx" ON "releve_journalier" USING btree ("projet_id","date");--> statement-breakpoint
CREATE INDEX "releve_statut_idx" ON "releve_journalier" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "releve_quantite_ligne_idx" ON "releve_quantite" USING btree ("ligne_quantitatif_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_lot_unique" ON "snapshot_avancement" USING btree ("projet_id","lot_id","date") WHERE lot_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_projet_unique" ON "snapshot_avancement" USING btree ("projet_id","date") WHERE lot_id is null;--> statement-breakpoint
CREATE INDEX "snapshot_lecture_idx" ON "snapshot_avancement" USING btree ("projet_id","lot_id","date");--> statement-breakpoint
CREATE INDEX "tache_lot_idx" ON "tache" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "tache_parent_idx" ON "tache" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "utilisateur_email_unique" ON "utilisateur" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "zone_niveau_idx" ON "zone" USING btree ("projet_id","niveau");--> statement-breakpoint
CREATE INDEX "zone_tache_tache_idx" ON "zone_tache" USING btree ("tache_id");