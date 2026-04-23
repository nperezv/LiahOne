import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SURNAME_PARTICLES = new Set([
  "da",
  "de",
  "del",
  "dos",
  "das",
  "do",
  "la",
  "las",
  "los",
  "y",
  "san",
  "santa",
  "santo",
  "van",
  "von",
]);

const isSurnameParticle = (token: string) => SURNAME_PARTICLES.has(token.toLowerCase());
const isLowercaseToken = (token: string) =>
  token === token.toLowerCase() && token !== token.toUpperCase();

const scoreSplit = (surnames: string[], names: string[]) => {
  if (surnames.length === 0 || names.length === 0) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (isSurnameParticle(surnames[surnames.length - 1])) score -= 2;
  if (isSurnameParticle(names[0])) score -= 2;

  surnames.forEach((token) => {
    if (isSurnameParticle(token) || isLowercaseToken(token)) score += 1;
  });
  names.forEach((token) => {
    if (isSurnameParticle(token) || isLowercaseToken(token)) score -= 1;
  });

  if (names.length === 1) score += 1;
  if (names.length === 2) score += 0.5;
  if (names.length > 2) score -= 1;

  if (surnames.length >= 1 && surnames.length <= 3) score += 0.5;

  return score;
};

const COMPOUND_STARTERS = new Set([
  "juan", "josé", "jose", "maría", "maria", "ana", "luis", "rosa",
  "carlos", "miguel", "pedro", "antonio", "manuel", "rafael",
  "jorge", "ángel", "angel", "francisco", "fernando", "javier",
  "beatriz", "isabel", "pilar", "teresa", "andrés", "andres",
]);

function firstGivenName(nombre: string): string {
  const words = nombre.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? "";
  return COMPOUND_STARTERS.has(words[0].toLowerCase())
    ? `${words[0]} ${words[1]}`
    : words[0];
}

/**
 * Returns "Primer Nombre Primer Apellido" from a member object.
 * Uses nombre/apellidos when available; falls back to parsing nameSurename.
 */
export function shortMemberName(member: {
  nombre?: string | null;
  apellidos?: string | null;
  nameSurename?: string | null;
}): string {
  const n = member.nombre?.trim();
  const a = member.apellidos?.trim();
  if (n || a) {
    const fn = n ? firstGivenName(n) : "";
    const fa = a ? a.split(/\s+/)[0] ?? "" : "";
    return [fn, fa].filter(Boolean).join(" ");
  }
  const raw = member.nameSurename?.trim() ?? "";
  if (!raw) return "";
  if (raw.includes(",")) {
    const ci = raw.indexOf(",");
    const ap = raw.slice(0, ci).trim();
    const nom = raw.slice(ci + 1).trim();
    const fn = nom ? firstGivenName(nom) : "";
    const fa = ap.split(/\s+/)[0] ?? "";
    return [fn, fa].filter(Boolean).join(" ");
  }
  return normalizeMemberName(raw);
}

/**
 * Returns the best short display name for a user account.
 * Prefers displayName; falls back to parsing formal name.
 */
export function shortUserName(user: {
  displayName?: string | null;
  name?: string | null;
}): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  return shortMemberName({ nameSurename: user.name ?? "" });
}

export const normalizeMemberName = (value?: string | null) => {
  if (!value) return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  if (cleaned.includes(",")) {
    const [surnamePart, namePart] = cleaned.split(",").map((part) => part.trim());
    if (namePart && surnamePart) {
      return `${namePart} ${surnamePart}`.trim();
    }
  }

  const parts = cleaned.split(" ");
  if (parts.length < 2) return cleaned;
  if (parts.length === 2) return cleaned;

  const lowerTokens = parts.map((part) => part.toLowerCase());
  const hasParticles = lowerTokens.some((token) => isSurnameParticle(token));
  const hasLowercaseTokens = parts.some((part) => isLowercaseToken(part));

  if (parts.length === 4 && !hasParticles && !hasLowercaseTokens) {
    const surnames = parts.slice(0, 2);
    const names = parts.slice(2);
    return [...names, ...surnames].join(" ");
  }

  const candidateGivenCounts = [1, 2].filter((count) => parts.length - count >= 1);
  let bestSplit = { surnames: parts.slice(0, 1), names: parts.slice(1) };
  let bestScore = Number.NEGATIVE_INFINITY;

  candidateGivenCounts.forEach((givenCount) => {
    const surnames = parts.slice(0, parts.length - givenCount);
    const names = parts.slice(parts.length - givenCount);
    const score = scoreSplit(surnames, names);
    if (score > bestScore) {
      bestScore = score;
      bestSplit = { surnames, names };
    }
  });

  if (bestSplit.names.length === 0) return cleaned;

  return [...bestSplit.names, ...bestSplit.surnames].join(" ");
};
