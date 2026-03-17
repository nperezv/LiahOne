-- Logistics coordination per baptism service
CREATE TABLE IF NOT EXISTS baptism_service_logistics (
  service_id          varchar PRIMARY KEY REFERENCES baptism_services(id) ON DELETE CASCADE,
  -- Espacio y calendario
  espacio_responsable text,
  espacio_fecha       date,
  espacio_hora_inicio text,
  espacio_hora_fin    text,
  espacio_salas       text[],
  espacio_notas       text,
  -- Arreglo de espacios
  arreglo_responsable text,
  arreglo_tareas      text[],
  arreglo_fecha       date,
  arreglo_notas       text,
  -- Equipo y tecnología
  equipo_responsable  text,
  equipo_lista        text,
  equipo_fecha        date,
  equipo_notas        text,
  -- Refrigerio y presupuesto
  refrigerio_responsable          text,
  refrigerio_presupuesto_solicitado boolean DEFAULT false,
  refrigerio_notas                text,
  -- Limpieza
  limpieza_responsable text,
  limpieza_tareas      text[],
  limpieza_fecha       date,
  limpieza_notas       text,
  -- Meta
  updated_by varchar,
  updated_at timestamptz DEFAULT now()
);

-- Baptism-specific coordination
CREATE TABLE IF NOT EXISTS baptism_service_baptism_details (
  service_id          varchar PRIMARY KEY REFERENCES baptism_services(id) ON DELETE CASCADE,
  -- Ropa bautismal
  ropa_responsable    text,
  ropa_origen         text,
  ropa_fecha          date,
  ropa_notas          text,
  -- Prueba de ropa
  prueba_confirmada   boolean DEFAULT false,
  prueba_fecha        date,
  prueba_notas        text,
  -- Entrevista bautismal
  entrevista_fecha    date,
  entrevista_autoridad text,
  entrevista_notas    text,
  -- Meta
  updated_by varchar,
  updated_at timestamptz DEFAULT now()
);
