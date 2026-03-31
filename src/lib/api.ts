const rawBase = (() => {
  const v =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL != null
      ? String(import.meta.env.VITE_API_URL)
      : '';
  return v.trim();
})();

if (typeof import.meta !== 'undefined' && import.meta.env.PROD && !rawBase) {
  console.warn(
    '[VisiARise] VITE_API_URL was empty at build time. Set it on your frontend host (e.g. Railway) so /api requests reach the backend.'
  );
}

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

  // SPA/static hosts often return index.html (200) for /api/* when the real API URL is not used.
  if (
    text &&
    typeof text === 'string' &&
    /^\s*</.test(text) &&
    /<html[\s>]/i.test(text)
  ) {
    const err = new Error(
      'Received HTML instead of JSON from an API path — requests may be going to the frontend server. Set VITE_API_URL to your backend base URL on the frontend Railway service, rebuild, and redeploy.'
    ) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    throw err;
  }

  return data as T;
}

/** Successful login (verified account). */
export type LoginSuccessResponse = {
  _id: string;
  name: string;
  email: string;
  isVerified: boolean;
  isAdmin: boolean;
  credits: number | null;
  token: string;
};

/** Valid password but email not verified — OTP emailed; use `/api/auth/verify-otp` next. */
export type LoginNeedsVerificationResponse = {
  needsVerification: true;
  userId: string;
  message: string;
};

export type LoginResponse = LoginSuccessResponse | LoginNeedsVerificationResponse;

export type SignupResponse = { message: string; userId: string };

export type VerifyOtpResponse = {
  message: string;
  token: string;
  user: Omit<LoginSuccessResponse, 'token'>;
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
  meshyApiKind?: 'text_to_3d' | 'image_to_3d';
  mode: string;
  artStyle?: string;
  texturePrompt?: string;
  status: string;
  progress?: number;
  modelUrls?: Record<string, string | undefined>;
  thumbnailUrl?: string;
  errorMessage?: string;
  /** Preview tasks: Meshy refine task id when auto_refine or manual refine ran. */
  linkedRefineTaskId?: string;
  autoRefineError?: string;
  createdAt?: string;
  completedAt?: string;
};

export type MeshyGenerateResponse = {
  message: string;
  creditsCharged?: number;
  creditsRemaining?: number | null;
  /** Backend will start refine after preview succeeds (no second POST from client). */
  autoRefine?: boolean;
  task: MeshyTaskPayload;
};

export type MeshyTaskStatusResponse = { task: MeshyTaskPayload };

export type ModelUrlsPayload = {
  glb?: string;
  fbx?: string;
  usdz?: string;
  obj?: string;
  mtl?: string;
  stl?: string;
};

export type ApiStudioExtra = {
  id: string;
  name?: string;
  modelUrl?: string;
};

export type ApiProject = {
  id: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
  status: 'draft' | 'published';
  modelUrl?: string;
  thumbnailUrl?: string;
  meshyPreviewTaskId?: string;
  meshyTaskId?: string;
  modelUrls?: ModelUrlsPayload;
  useCase?: string;
  category?: string;
  studioTransforms?: Record<string, unknown>;
  studioRigs?: Record<string, unknown>;
  studioExtras?: ApiStudioExtra[];
  logoScale?: number;
  logoOffsetY?: number;
  arSharePublic?: boolean;
  arPageTitle?: string;
  arPageTagline?: string;
  arCtaLabel?: string;
  arAccentHex?: string;
  arGlbUploadedAt?: string;
};

/** Public WebAR metadata (no auth). `modelUrl` is an API path; use {@link apiUrl}. */
export type PublicShareResponse = {
  projectId: string;
  name: string;
  arPageTitle: string;
  arPageTagline: string;
  arCtaLabel: string;
  arAccentHex: string;
  description: string;
  modelUrl: string;
};

export type ProjectsListResponse = { projects: ApiProject[] };
export type ProjectOneResponse = { project: ApiProject };

export type FreelancerJobDto = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  budget: string;
  posted?: string;
};

export type FreelancerJobsResponse = { jobs: FreelancerJobDto[] };

export type FreelancerApplyResponse = { message: string; applicationId: string };

export type ApiChatMessage = {
  id: string;
  _id?: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  modelUrl?: string;
  modelUrls?: ModelUrlsPayload;
  meshyTaskId?: string;
  createdAt?: string;
};

export type ChatListResponse = { messages: ApiChatMessage[] };
export type ChatAppendResponse = { message: ApiChatMessage };
