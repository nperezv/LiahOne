-- seed base inventory categories for first-time setup
-- prefixes are base prefixes; ward token is appended dynamically at asset-code allocation time

INSERT INTO inventory_categories (name, prefix, description)
VALUES
  ('Audio', 'A', 'Micrófonos, altavoces, mezcladores y equipo de sonido.'),
  ('Video', 'V', 'Proyectores, pantallas, cámaras y cableado audiovisual.'),
  ('Informática', 'IT', 'Portátiles, tablets, periféricos y accesorios de TI.'),
  ('Mobiliario', 'M', 'Mesas, sillas, atriles y mobiliario auxiliar.'),
  ('Limpieza', 'L', 'Útiles y consumibles de limpieza.'),
  ('Papelería', 'P', 'Material de oficina y suministros impresos.'),
  ('Seguridad', 'S', 'Botiquín, señalización y elementos de seguridad.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO inventory_category_counters (category_id, next_seq)
SELECT c.id, 1
FROM inventory_categories c
LEFT JOIN inventory_category_counters cc ON cc.category_id = c.id
WHERE cc.category_id IS NULL;
