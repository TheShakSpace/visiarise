const rawBase =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL != null
    ? String(import.meta.env.VITE_API_URL)
    : '';

/** In dev, empty string uses Vite proxy `/api` → backend. */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (rawBase) {
    return `${rawBase.replace(/\/$/, '')}${p}`;
  }
  return p;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers: hdr, ...rest } = options;
  const headers = new Headers(hdr);
  if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(apiUrl(path), { ...rest, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && data !== null && 'message' in data && typeof (data as { message: string }).message === 'string'
        ? (data as { message: string }).message
        : null) || res.statusText;
    const err = new Error(msg) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}

export type LoginResponse = {
  _id: string;
  name: string;
  email: string;
  isVerified: boolean;
  isAdmin: boolean;
  credits: number | null;
  token: string;
};

export type SignupResponse = { message: string; userId: string };

export type VerifyOtpResponse = {
  message: string;
  token: string;
  user: Omit<LoginResponse, 'token'>;
};

export type MeResponse = {
  _id: string;
  name: string;
  email: string;
  isVerified: boolean;
  isAdmin: boolean;
  credits: number | null;
};

export type MeshyTaskPayload = {
  _id: string;
  taskId: string;
  prompt: string;
  mode: string;
  artStyle?: string;
  texturePrompt?: string;
  status: string;
  progress?: number;
  modelUrls?: Record<string, string | undefined>;
  thumbnailUrl?: string;
  errorMessage?: string;
  createdAt?: string;
  completedAt?: string;
};

export type MeshyGenerateResponse = {
  message: string;
  creditsCharged?: number;
  creditsRemaining?: number | null;
  task: MeshyTaskPayload;
};

export type MeshyTaskStatusResponse = { task: MeshyTaskPayload };
