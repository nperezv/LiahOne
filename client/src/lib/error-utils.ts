export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const statusMatch = error.message.match(/^\d+:\s(.*)$/);
  const rawMessage = statusMatch?.[1]?.trim() ?? error.message.trim();

  if (!rawMessage) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawMessage);

    if (typeof parsed === "string") {
      return parsed;
    }

    if (Array.isArray(parsed)) {
      const firstItem = parsed[0];
      if (typeof firstItem === "string") {
        return firstItem;
      }
      if (firstItem && typeof firstItem.message === "string") {
        return firstItem.message;
      }
    }

    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const parsedError = (parsed as { error?: unknown }).error;
      if (typeof parsedError === "string") {
        return parsedError;
      }
      if (Array.isArray(parsedError) && parsedError[0]?.message) {
        return parsedError[0].message;
      }
    }
  } catch {
    // Ignore JSON parsing errors and fall back to raw message.
  }

  return rawMessage || fallback;
}
