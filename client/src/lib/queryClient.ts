import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAccessToken, refreshAccessToken } from "./auth-tokens";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const rawBody = (await res.text()).trim();

    let reason = res.statusText || "Request failed";
    let payload: unknown = null;

    if (contentType.includes("application/json")) {
      try {
        payload = JSON.parse(rawBody);
        const p = payload as { message?: string; error?: string };
        reason = p.message || p.error || reason;
      } catch {
        reason = rawBody || reason;
      }
    } else if (contentType.includes("text/html")) {
      reason = `Upstream service unavailable (${res.status})`;
    } else if (rawBody) {
      reason = rawBody;
    }

    const err = new Error(`${res.status}: ${reason}`) as Error & { payload: unknown; status: number };
    err.payload = payload;
    err.status = res.status;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<any> {
  const token = getAccessToken();
  const headers = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders ?? {}),
  };

  let res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(url, {
        method,
        headers: {
          ...(data ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${refreshed}`,
        },
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
    }
  }

  await throwIfResNotOk(res);
  if (res.status === 204) {
    return null;
  }
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = getAccessToken();
    let res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        res = await fetch(queryKey.join("/") as string, {
          credentials: "include",
          headers: { Authorization: `Bearer ${refreshed}` },
        });
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

// Redirect to login when any query/mutation gets a persistent 401
queryClient.getQueryCache().subscribe((event) => {
  if (
    event.type === "updated" &&
    event.action.type === "error" &&
    event.action.error instanceof Error &&
    event.action.error.message.startsWith("401:")
  ) {
    // Clear cache and redirect to login
    queryClient.clear();
    window.location.href = "/login";
  }
});
