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
