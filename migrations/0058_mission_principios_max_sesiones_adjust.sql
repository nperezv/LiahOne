UPDATE "mission_principios"
SET "max_sesiones" = CASE "id"
  WHEN 2 THEN 7
  WHEN 3 THEN 8
  WHEN 4 THEN 7
  WHEN 5 THEN 17
  ELSE "max_sesiones"
END
WHERE "id" IN (2, 3, 4, 5);
