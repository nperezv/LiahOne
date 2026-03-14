-- ============================================================
-- 0054_mission_senda_convenios.sql
-- Nuevo módulo: Progreso de la senda de los convenios
-- ============================================================

-- ENUMs
CREATE TYPE "mission_persona_tipo" AS ENUM ('nuevo', 'regresando', 'enseñando');
CREATE TYPE "mission_sacerdocio_oficio" AS ENUM ('diacono', 'maestro', 'sacerdote', 'elder', 'sumo_sacerdote');
CREATE TYPE "mission_sacerdocio_estado" AS ENUM ('ordenado', 'califica', 'pendiente');

-- 1. Personas
CREATE TABLE "mission_personas" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "unit_id" varchar NOT NULL REFERENCES "organizations"("id"),
  "nombre" text NOT NULL,
  "foto_url" text,
  "tipo" "mission_persona_tipo" NOT NULL,
  "fecha_primer_contacto" date NOT NULL,
  "fecha_bautismo" date,
  "proximo_evento" date,
  "notas" text,
  "is_archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 2. Asistencia
CREATE TABLE "mission_asistencia" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "persona_id" varchar NOT NULL REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "fecha_domingo" date NOT NULL,
  "asistio" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("persona_id", "fecha_domingo")
);

-- 3. Amigos
CREATE TABLE "mission_amigos" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "persona_id" varchar NOT NULL REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "es_miembro" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- 4. Principios (seed table)
CREATE TABLE "mission_principios" (
  "id" integer PRIMARY KEY,
  "nombre" text NOT NULL,
  "orden" integer NOT NULL,
  "max_sesiones" integer NOT NULL
);

-- 5. Sesiones por principio
CREATE TABLE "mission_sesion_principio" (
  "persona_id" varchar NOT NULL REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "principio_id" integer NOT NULL REFERENCES "mission_principios"("id"),
  "sesion_num" integer NOT NULL,
  "miembro_presente" boolean NOT NULL DEFAULT false,
  "fecha" date,
  PRIMARY KEY ("persona_id", "principio_id", "sesion_num")
);

-- 6. Compromisos bautismales
CREATE TABLE "mission_compromiso_bautismo" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "persona_id" varchar NOT NULL REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "commitment_key" text NOT NULL,
  "nombre" text NOT NULL,
  "orden" integer NOT NULL,
  "fecha_invitado" date,
  UNIQUE("persona_id", "commitment_key")
);

-- 7. Otros compromisos
CREATE TABLE "mission_otro_compromiso" (
  "persona_id" varchar PRIMARY KEY REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "conocer_obispo" boolean NOT NULL DEFAULT false,
  "historia_familiar" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 8. Ordenación al sacerdocio
CREATE TABLE "mission_ordenacion_sacerdocio" (
  "persona_id" varchar PRIMARY KEY REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "oficio" "mission_sacerdocio_oficio",
  "fecha_ordenacion" date,
  "fecha_califica" date,
  "estado" "mission_sacerdocio_estado" NOT NULL DEFAULT 'pendiente',
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 9. Templo y ordenanzas
CREATE TABLE "mission_templo_ordinanzas" (
  "persona_id" varchar PRIMARY KEY REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "nombre_familiar_preparado" boolean NOT NULL DEFAULT false,
  "bautismo_antepasados" boolean NOT NULL DEFAULT false,
  "investido" boolean NOT NULL DEFAULT false,
  "sellado_padres" boolean NOT NULL DEFAULT false,
  "sellado_conyuge" boolean NOT NULL DEFAULT false,
  "fecha_califica_investidura" date,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 10. Autosuficiencia
CREATE TABLE "mission_self_reliance" (
  "persona_id" varchar PRIMARY KEY REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "resiliencia_emocional" boolean NOT NULL DEFAULT false,
  "finanzas_personales" boolean NOT NULL DEFAULT false,
  "negocio" boolean NOT NULL DEFAULT false,
  "educacion_empleo" boolean NOT NULL DEFAULT false,
  "buscar_empleo" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 11. Llamamiento
CREATE TABLE "mission_llamamiento" (
  "persona_id" varchar PRIMARY KEY REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "nombre" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- 12. Ministración
CREATE TABLE "mission_ministracion" (
  "persona_id" varchar PRIMARY KEY REFERENCES "mission_personas"("id") ON DELETE CASCADE,
  "descripcion" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO "mission_principios" ("id", "nombre", "orden", "max_sesiones") VALUES
  (1, 'La invitación a ser bautizado y confirmado', 1, 1),
  (2, 'Mensaje de la Restauración', 2, 8),
  (3, 'Plan de salvación del Padre Celestial', 3, 9),
  (4, 'El evangelio de Jesucristo', 4, 7),
  (5, 'Discípulos de Jesucristo para toda la vida', 5, 20),
  (6, 'Entrevista bautismal', 6, 1);
