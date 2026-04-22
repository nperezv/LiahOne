/**
 * Derives a short display name from nombre and apellidos.
 * Takes only the first given name and first surname.
 * Examples:
 *   ("Nelson Miller", "Pérez Ventura") → "Nelson Pérez"
 *   ("María Jesús", "García")          → "María García"
 *   ("Juan", "López García")           → "Juan López"
 *   ("Ana", null)                      → "Ana"
 *   (null, "García")                   → "García"
 */
export function deriveDisplayName(
  nombre: string | null | undefined,
  apellidos: string | null | undefined,
): string {
  const firstNombre = nombre?.trim().split(/\s+/)[0] ?? "";
  const firstApellido = apellidos?.trim().split(/\s+/)[0] ?? "";
  return [firstNombre, firstApellido].filter(Boolean).join(" ");
}

/**
 * Builds the canonical nameSurename from apellidos and nombre.
 * Falls back to the provided fallback if both are empty.
 */
export function deriveNameSurename(
  nombre: string | null | undefined,
  apellidos: string | null | undefined,
  fallback = "",
): string {
  const n = nombre?.trim() ?? "";
  const a = apellidos?.trim() ?? "";
  if (a && n) return `${a}, ${n}`;
  return a || n || fallback;
}
