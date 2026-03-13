export function containsBlockedUrl(message: string) {
  return /(https?:\/\/|www\.)/i.test(message);
}

export function isRateLimited(count10Minutes: number, count24Hours: number) {
  return {
    over10Minutes: count10Minutes >= 5,
    over24Hours: count24Hours >= 20,
    blocked: count10Minutes >= 5 || count24Hours >= 20,
  };
}

export function normalizeDisplayName(value?: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 40) : "Anónimo";
}

export function isPublicWindowActive(expiresAt: Date, revokedAt: Date | null | undefined, now: Date) {
  if (revokedAt) return false;
  return now < expiresAt;
}
