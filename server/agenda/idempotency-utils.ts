export interface IdempotencyRecord {
  statusCode: number | null;
  responseBody?: Record<string, unknown> | null;
}

export function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string | null {
  const header = headers["idempotency-key"];
  if (!header) return null;
  const value = Array.isArray(header) ? String(header[0] || "").trim() : String(header).trim();
  return value.length > 0 ? value : null;
}

export function toReplayResponse(existing?: IdempotencyRecord | null): { statusCode: number; body: Record<string, unknown> } | null {
  if (!existing?.statusCode || !existing.responseBody) return null;
  return { statusCode: existing.statusCode, body: existing.responseBody };
}
