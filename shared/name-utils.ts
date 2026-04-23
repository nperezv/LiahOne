// Names that are typically used as compound first names in Spanish
const COMPOUND_STARTERS = new Set([
  "juan", "josé", "jose", "maría", "maria", "ana", "luis", "rosa",
  "carlos", "miguel", "pedro", "antonio", "manuel", "rafael",
  "jorge", "ángel", "angel", "francisco", "fernando", "javier",
  "beatriz", "isabel", "pilar", "teresa", "andrés", "andres",
]);

export function firstGivenName(nombre: string): string {
  const words = nombre.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "";
  return COMPOUND_STARTERS.has(words[0].toLowerCase())
    ? `${words[0]} ${words[1]}`
    : words[0];
}

/**
 * Derives a short display name: first given name(s) + first surname.
 * Handles compound names (Juan Carlos, María José, José Luis…).
 * Examples:
 *   ("Nelson Miller", "Pérez Ventura") → "Nelson Pérez"
 *   ("Juan Carlos",   "García López")  → "Juan Carlos García"
 *   ("María Jesús",   "García")        → "María Jesús García"
 *   ("Ana",           null)            → "Ana"
 *   (null,            "García")        → "García"
 */
export function deriveDisplayName(
  nombre: string | null | undefined,
  apellidos: string | null | undefined,
): string {
  const firstN = nombre?.trim() ? firstGivenName(nombre.trim()) : "";
  const firstA = apellidos?.trim().split(/\s+/)[0] ?? "";
  return [firstN, firstA].filter(Boolean).join(" ");
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

/**
 * Returns a short display name from a raw name string.
 * Handles "Apellidos, Nombre" comma format and plain "Nombre Apellido" format.
 * Examples:
 *   "Pérez Ventura, Nelson Miller" → "Nelson Pérez"
 *   "Juan Carlos García López"    → (treated as given name only, returned as-is)
 */
export function shortNameFromString(raw: string | null | undefined): string {
  const s = raw?.trim() ?? "";
  if (!s) return "";
  if (s.includes(",")) {
    const commaIdx = s.indexOf(",");
    const ap = s.slice(0, commaIdx).trim();
    const nom = s.slice(commaIdx + 1).trim();
    const fn = nom ? firstGivenName(nom) : "";
    const fa = ap.split(/\s+/)[0] ?? "";
    return [fn, fa].filter(Boolean).join(" ");
  }
  return s;
}
