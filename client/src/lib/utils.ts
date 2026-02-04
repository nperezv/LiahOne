import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MAX_SURNAME_COUNT = 2;

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

  const surnameCount = parts.length >= 4 ? MAX_SURNAME_COUNT : 1;
  const surnames = parts.slice(0, surnameCount);
  const names = parts.slice(surnameCount);

  if (names.length === 0) return cleaned;

  return [...names, ...surnames].join(" ");
};
