export type PublicLinkSession = {
  slug: string;
  code: string;
  publishedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export function computeExpiresAt(publishedAt: Date) {
  return new Date(publishedAt.getTime() + 24 * 60 * 60 * 1000);
}

export function containsBlockedUrl(message: string) {
  return /(https?:\/\/|www\.)/i.test(message);
}

export function rotatePublicLinkSession(previous: PublicLinkSession | null, now: Date, nextCode: string): PublicLinkSession {
  const slug = previous?.slug ?? `slug-${Math.random().toString(16).slice(2, 10)}`;
  return {
    slug,
    code: nextCode,
    publishedAt: now,
    expiresAt: computeExpiresAt(now),
    revokedAt: null,
  };
}

export function isSessionActive(session: PublicLinkSession, now: Date, code: string) {
  if (session.revokedAt) return false;
  if (session.code !== code) return false;
  return now < session.expiresAt;
}
