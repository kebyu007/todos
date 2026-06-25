import { API_URL } from './config';
import type { AuthResult } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

// Low-level request. Throws ApiError on non-2xx so callers can branch on status
// (e.g. 401 -> try a token refresh).
export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, token }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const message =
      (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, Array.isArray(message) ? message[0] : message);
  }

  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- Auth (no token required) ----

export function login(email: string, password: string): Promise<AuthResult> {
  return apiRequest<AuthResult>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function register(input: {
  email: string;
  username: string;
  password: string;
  timezone: string;
}): Promise<AuthResult> {
  return apiRequest<AuthResult>('/api/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function refresh(refreshToken: string): Promise<AuthResult> {
  return apiRequest<AuthResult>('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}
