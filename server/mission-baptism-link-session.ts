export type LinkSessionRecord = {
  slug: string;
  code: string;
  publishedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
};

export function computeExpiresAt24h(now: Date) {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function buildStableSlug(serviceId: string, randomHex: string) {
  return `svc-${serviceId.slice(0, 8)}-${randomHex}`;
}

export function nextSessionPayload(params: {
  serviceId: string;
  now: Date;
  randomCode: string;
  previousSlug?: string | null;
  randomSlugHex?: string;
}) {
  const slug = params.previousSlug || buildStableSlug(params.serviceId, params.randomSlugHex || "000000");
  return {
    slug,
    code: params.randomCode,
    publishedAt: params.now,
    expiresAt: computeExpiresAt24h(params.now),
  };
}

export function isActiveSession(session: LinkSessionRecord, now: Date, code?: string) {
  if (session.revokedAt) return false;
  if (now < session.publishedAt) return false; // not yet activated
  if (code && code !== session.code) return false;
  return now < session.expiresAt;
}

export function approvedSessionPayload(params: {
  serviceId: string;
  serviceAt: Date;
  randomCode: string;
  previousSlug?: string | null;
  randomSlugHex?: string;
}) {
  const slug = params.previousSlug || buildStableSlug(params.serviceId, params.randomSlugHex || "000000");
  return {
    slug,
    code: params.randomCode,
    publishedAt: params.serviceAt,
    expiresAt: new Date(params.serviceAt.getTime() + 24 * 60 * 60 * 1000),
  };
}
