const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new ApiError(res.status, (body as { error?: string })?.error ?? res.statusText, body);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST" });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string })?.error ?? res.statusText, body);
  }
  return body as T;
}
