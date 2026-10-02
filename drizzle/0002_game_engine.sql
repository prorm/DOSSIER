CREATE TABLE "artifacts" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'object' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	CONSTRAINT "artifacts_event_id_id_pk" PRIMARY KEY("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "challenge_dependencies" (
	"event_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"depends_on" text NOT NULL,
	"kind" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "challenge_dependencies_event_id_challenge_id_depends_on_kind_pk" PRIMARY KEY("event_id","challenge_id","depends_on","kind")
);
--> statement-breakpoint
CREATE TABLE "challenge_instances" (
	"event_id" text NOT NULL,
	"team_id" uuid NOT NULL,
	"challenge_id" text NOT NULL,
	"primitive" text NOT NULL,
	"blueprint_version" integer NOT NULL,
	"seed_fingerprint" text NOT NULL,
	"answer_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_instances_team_id_challenge_id_pk" PRIMARY KEY("team_id","challenge_id")
);
--> statement-breakpoint
CREATE TABLE "challenge_types" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"family" text NOT NULL,
	"label" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"is_suspect" boolean DEFAULT false NOT NULL,
	"relationships" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "characters_event_id_id_pk" PRIMARY KEY("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"about" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_gate" jsonb,
	CONSTRAINT "evidence_event_id_id_pk" PRIMARY KEY("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"event_id" text NOT NULL,
	"team_id" uuid NOT NULL,
	"link_id" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"relation" text DEFAULT '' NOT NULL,
	"valid" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_links_team_id_link_id_pk" PRIMARY KEY("team_id","link_id")
);
--> statement-breakpoint
CREATE TABLE "game_state_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"team_id" uuid NOT NULL,
	"type" text NOT NULL,
	"node_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor" text DEFAULT 'team' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_states" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hints" (
	"event_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"idx" integer NOT NULL,
	"level" text NOT NULL,
	"cost" integer NOT NULL,
	CONSTRAINT "hints_event_id_challenge_id_idx_pk" PRIMARY KEY("event_id","challenge_id","idx")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lon" double precision,
	CONSTRAINT "locations_event_id_id_pk" PRIMARY KEY("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "narrative_acts" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"phase" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "narrative_acts_event_id_id_pk" PRIMARY KEY("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"university" text DEFAULT '' NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"act_id" text NOT NULL,
	"title" text NOT NULL,
	"family" text NOT NULL,
	"tier" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rounds_event_id_id_pk" PRIMARY KEY("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"event_id" text PRIMARY KEY NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suspects" (
	"event_id" text NOT NULL,
	"character_id" text NOT NULL,
	"is_culprit" boolean DEFAULT false NOT NULL,
	"motive" text DEFAULT '' NOT NULL,
	"red_herring" text,
	CONSTRAINT "suspects_event_id_character_id_pk" PRIMARY KEY("event_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"at" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"actors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location_id" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "timeline_events_event_id_id_pk" PRIMARY KEY("event_id","id")
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "primitive" text DEFAULT 'static-answer' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "round_id" text;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "act_id" text;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "difficulty" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "estimated_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "kind" text DEFAULT 'qr' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "lon" double precision;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "radius_m" double precision;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "claim_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "team_scoped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "kind" text DEFAULT 'pack' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "blueprint" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "blueprint_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "kind" text DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_dependencies" ADD CONSTRAINT "challenge_dependencies_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_instances" ADD CONSTRAINT "challenge_instances_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_states" ADD CONSTRAINT "game_states_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hints" ADD CONSTRAINT "hints_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_acts" ADD CONSTRAINT "narrative_acts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspects" ADD CONSTRAINT "suspects_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_deps_target_idx" ON "challenge_dependencies" USING btree ("event_id","depends_on");--> statement-breakpoint
CREATE INDEX "gse_team_idx" ON "game_state_events" USING btree ("event_id","team_id","id");--> statement-breakpoint
CREATE INDEX "gse_event_recent_idx" ON "game_state_events" USING btree ("event_id","id");--> statement-breakpoint
CREATE INDEX "gse_node_idx" ON "game_state_events" USING btree ("event_id","node_id","type");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;