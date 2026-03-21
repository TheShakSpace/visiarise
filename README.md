# VisiARise

Web platform for **AI-assisted 3D creation**, **in-browser editing**, **marketplace-style asset discovery**, and **WebAR preview** — built as a **React + Vite** single-page application with heavy use of **Three.js**, **React Three Fiber**, **GSAP**, and **client-side persistence** today, designed to plug into **real backends**, **object storage**, and **third-party 3D generation APIs** (Meshy, Hyper3D, etc.) as you scale.

---

## By the numbers

Snapshot of **first-party `src/`** only (`node_modules`, `dist`, and lockfiles excluded):

| Metric | Count |
|--------|------:|
| **Source files** | 39 |
| **Lines — TypeScript + TSX** | ~7,420 |
| **Lines — global CSS** (`index.css`) | ~260 |
| **Total application LOC (rounded)** | **~7,700** |

### Animation & motion

| Layer | What it covers | Approx. count |
|-------|----------------|---------------|
| **Motion (react)** | `<motion.*>` components across pages, Navbar, loaders, auth, modals, onboarding | **~51** |
| **AnimatePresence** | Mount/unmount transition wrappers | **10** |
| **GSAP** | Landing: ScrollTrigger **pin + scrub + snap** on hero deck, **matchMedia** breakpoints, section-2 drone parallax, **scroll-scrubbed** reveals, step/stat tweens, **ScrollToPlugin** skip, hero **accent text** blur/swap loops (`to` / `fromTo` / `delayedCall`) | **12+** distinct tween drivers in `LandingPage.tsx` alone |
| **CSS `@keyframes`** | `float`, `glow`, `pulse-glow`, `streak`, `blur-reveal`, `text-shine-shift` (+ loader shine) | **7** named animations |
| **Tailwind** | `animate-spin`, `animate-pulse` on loaders and status dots | **~10** usages |
| **WebGL / R3F** | `useFrame` in `DroneScene` (idle orbit); **Studio** runs a full **requestAnimationFrame** Three.js loop | Continuous 3D animation |

*Counts are from repo grep/wc; Motion uses `motion/react` everywhere except `Onboarding.tsx` (`framer-motion`). Nested GSAP `delayedCall` chains repeat for each hero accent phrase cycle.*

---

## Table of contents

1. [By the numbers](#by-the-numbers)
2. [High-level architecture](#high-level-architecture)
3. [What exists in the repo today](#what-exists-in-the-repo-today)
4. [Tech stack](#tech-stack)
5. [Repository layout](#repository-layout)
6. [User flows & routes](#user-flows--routes)
7. [Data & state model](#data--state-model)
8. [3D & AR pipeline (frontend)](#3d--ar-pipeline-frontend)
9. [Ardya / providers (Meshy, Hyper3D, …)](#ardya--providers-meshy-hyper3d-)
10. [How to attach backend, APIs, databases & storage](#how-to-attach-backend-apis-databases--storage)
11. [Environment variables & secrets](#environment-variables--secrets)
12. [Checklist: everything that should change for production](#checklist-everything-that-should-change-for-production)
13. [Scalability & operations](#scalability--operations)
14. [Local development](#local-development)
15. [Build & deploy](#build--deploy)

---

## High-level architecture

Today the app is a **static/SSR-ready SPA** that talks to **no first-party API** for core product data: **Zustand** + **localStorage** + **IndexedDB** hold users, projects, chat, cart, and large binary payloads (GLB/data URLs). The **landing** and **marketing** surfaces use **GSAP ScrollTrigger** for the horizontal hero deck (desktop) and a vertical stack (mobile).

```mermaid
flowchart TB
  subgraph client [Browser — VisiARise SPA]
    UI[React Router pages]
    Z[Zustand + localStorage]
    IDB[(IndexedDB — studio GLB blobs)]
    R3F[@react-three/fiber + drei]
    THREE[Three.js — AR Studio]
    MV[model-viewer — WebAR]
    GSAP[GSAP ScrollTrigger + ScrollToPlugin]
    UI --> Z
    UI --> IDB
    UI --> R3F
    UI --> THREE
    UI --> MV
    UI --> GSAP
  end

  subgraph future [Target production backend]
    API[BFF / API Gateway]
    AUTH[Auth service — Firebase Auth or OIDC]
    DB[(Primary DB — Postgres or Firestore)]
    OBJ[(Object storage — S3 / GCS / Firebase Storage)]
    Q[Queue — 3D jobs]
    MESHY[Meshy API]
    HYPER[Hyper3D API]
    OTHER[Other 3D providers]
    API --> AUTH
    API --> DB
    API --> OBJ
    API --> Q
    Q --> MESHY
    Q --> HYPER
    Q --> OTHER
  end

  client -.->|HTTPS JSON + uploads| future
```

**Direction of travel:** move **identity**, **projects**, **chat**, **marketplace catalog**, **payments**, and **GLB URLs** to the backend; keep **WebGL preview** and **model-viewer** in the browser; offload **long-running text/image-to-3D** to **async jobs** behind your API.

---

## What exists in the repo today

| Area | Status |
|------|--------|
| **Auth (login/signup)** | **Mock**: any email/password sets a local `user` in Zustand; “Demo” shortcut uses constants in `src/constants/demo.ts`. No password verification, no server session. |
| **Projects & dashboard** | **Local only**: CRUD in Zustand; IDs are client-generated. |
| **Project chat (Ardya)** | **Simulated**: `setTimeout` returns fixed concept images and maps picks to **static GLB paths** in `ProjectChat.tsx`. Provider names (**Meshy AI**, **Hyper3D**, SAM 3D, Telles AI) are **UI only** — no API calls. |
| **AR Studio** | **Real Three.js** editor: load GLB (URL or data URL), transforms, export GLB, fuse extra models, logo plane — see `Studio.tsx` + `studio3d.ts`. |
| **WebAR (`/try-ar`, `/ar/:id`)** | **`<model-viewer>`** with GLB from query, project store, or `localStorage` fallback; QR uses **third-party** `api.qrserver.com` (replace for privacy/SLA). |
| **Marketplace / cart / freelancers** | **Mostly static** seed data in `useAppStore` (`DEFAULT_MARKETPLACE_ITEMS`, sample freelancers). |
| **Landing** | Rich **GSAP** horizontal deck (≥1024px), **IntersectionObserver** for mobile, **DroneScene** (R3F) for GLB previews, optional hero video (skipped on Save-Data / slow connection via `perf.ts`). |
| **Firebase / `@google/genai`** | Present in **dependencies** and `firebase-applet-config.json` / `GEMINI_API_KEY` in Vite — **not wired** in `src/` yet. Treat as **planned** integration surface. |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| **Framework** | React 19, TypeScript |
| **Bundler** | Vite 6 (`@vitejs/plugin-react`, `@tailwindcss/vite`) |
| **Routing** | React Router 7 (`BrowserRouter`, lazy-loaded routes) |
| **State** | Zustand + `persist` (localStorage) + custom IndexedDB for heavy assets |
| **Styling** | Tailwind CSS v4 (`index.css`, `@theme`) |
| **Motion** | `motion` / Framer Motion, GSAP + ScrollTrigger + ScrollToPlugin |
| **3D (marketing / hero)** | `@react-three/fiber`, `@react-three/drei`, `three` |
| **3D (studio)** | Raw `three` — `GLTFLoader`, `OrbitControls`, `TransformControls`, `Exporter` pipeline in `studio3d.ts` |
| **WebAR** | `@google/model-viewer` (also loaded from CDN in `index.html`) |
| **Optional physics** | `@react-three/cannon` (available; use as needed) |

---

## Repository layout

```
src/
  App.tsx                 # Routes, loading gate, onboarding, PurpleBallCursor
  main.tsx                # Boot: migrate LS → IDB, dynamic import App
  index.css               # Tailwind + global utilities (noise, hero dots, glass)
  components/             # Navbar, DroneScene, LoadingScreen, Onboarding, …
  pages/                  # Route-level screens (LandingPage, Studio, ProjectChat, …)
  store/useAppStore.ts    # Global state + persistence contract
  lib/
    demoAssets.ts         # Landing hero copy + demo scene metadata
    studio3d.ts           # GLTF load, export GLB, transforms, camera fit
    studioAssetDb.ts      # IndexedDB keys for per-project blobs
    perf.ts               # Save-Data / connection hints for lighter media
    migrateBloatedLocalStorage.ts
    preloadModels.ts
  constants/              # e.g. demo login credentials
  types/                  # model-viewer, global augments
firebase-applet-config.json   # Firebase-style config (rotate keys; don’t ship secrets in public repos)
vite.config.ts            # GEMINI_API_KEY inject, manualChunks (three, r3f, firebase, gsap)
public/                   # GLBs, images, hero video
```

---

## User flows & routes

| Path | Purpose |
|------|---------|
| `/` | Landing (hero deck, ecosystem, sections, footer) |
| `/login`, `/signup`, `/forgot-password` | Auth UI (mock) |
| `/dashboard` | Project list (protected in router by `user`) |
| `/project/:id` | **Ardya** project chat + concept → GLB (mock pipeline) |
| `/studio/:id` | **AR Studio** — Three.js editor |
| `/ar/:id` | WebAR preview for a saved project |
| `/try-ar` | Public WebAR with `?model=&name=` query params |
| `/marketplace`, `/product/:id`, `/cart` | Commerce UI (local catalog) |
| `/freelancers`, `/learn`, `/sustainability` | Content / hub pages |

---

## Data & state model

### Zustand (`useAppStore.ts`)

- **`user`**: `{ id, email, name }` — replace with server-backed profile + tokens.
- **`projects`**: `Project` — `modelUrl`, `modelDataUrl`, `studioExtras`, `studioTransforms`, `logoDataUrl`, etc. Heavy fields **stripped** from localStorage and rehydrated from IndexedDB (`studioAssetDb.ts`).
- **`chatHistory`**: per-project messages (`ChatMessage` with optional `images`, `modelUrl`).
- **`marketplaceItems`, `cart`, `freelancers`**: seed data; should become API-driven.
- **`onboardingCompleted`**: first-run modal; can sync to user preferences API later.

### IndexedDB (`visiarise-studio-assets`)

Stores **data URLs** / large strings keyed by project to avoid **5MB localStorage** pressure. On logout, `clearAllStudioAssets` wipes blobs.

**Production:** upload GLBs to **object storage**, persist only **`https://…` signed URLs** or **storage paths** in DB; optionally keep a **small cache** in IndexedDB for offline UX.

---

## 3D & AR pipeline (frontend)

1. **Concept → GLB (today)**  
   `ProjectChat`: fake delay → static image list → user picks image → maps to **known** `MODEL_FOR_IMAGE` GLB path → `updateProject({ modelUrl, thumbnailUrl })`.

2. **Studio**  
   `Studio.tsx` loads `modelDataUrl || modelUrl`, applies `studioTransforms`, supports **extra GLBs** and **logo** as textures on a plane; exports via `exportObject3DToGlbDataUrl` in `studio3d.ts`.

3. **WebAR**  
   `ARViewer.tsx`: `<model-viewer>` **src** = public URL, blob, or data URL. For production, prefer **CDN URLs** with **CORS** allowed for model-viewer.

4. **Landing previews**  
   `DroneScene.tsx`: R3F + `useGLTF`, environment, optional animations; used in hero and `#section-2` (lazy-mounted for perf).

---

## Ardya / providers (Meshy, Hyper3D, …)

In **`ProjectChat.tsx`**, `providers` lists:

- **Meshy AI**
- **Hyper3D** (often branded “Hyper” in product copy)
- **SAM 3D**
- **Telles AI**

`selectedProvider` only affects **assistant message text** today — **no HTTP calls**.

**Recommended backend design:**

1. **Provider abstraction** (server-side):  
   `POST /v1/jobs/generate` with `{ provider: 'meshy' | 'hyper3d' | …, prompt, imageRef?, options }`  
   Returns `{ jobId }`.

2. **Worker** polls provider webhooks or status endpoints; on completion writes **`glbStorageKey`** + **`previewUrl`** to DB; notifies client via **WebSocket**, **SSE**, or **polling**.

3. **Frontend change:** replace `handleSend` / `handleSelectImage` `setTimeout` blocks with:
   - `POST` job → show progress UI
   - `GET /v1/jobs/:id` until `succeeded`
   - set `project.modelUrl` to **signed CDN URL**

4. **Secrets:** Meshy / Hyper3D keys **only on server**; never in Vite `define` or client bundles.

---

## How to attach backend, APIs, databases & storage

### 1. API layer (BFF recommended)

- **Browser → your API** only (JSON + multipart uploads).
- Responsibilities: auth, authorization, project CRUD, chat history, marketplace, **proxy to Meshy/Hyper**, **signing uploads**, **rate limits**.

### 2. Authentication

- **Option A — Firebase Auth** (aligns with existing `firebase-applet-config.json` idea): ID token in `Authorization` header; verify with Firebase Admin on server.
- **Option B — OIDC** (Auth0, Clerk, Cognito): JWT access token; same pattern.
- **Replace** `LoginPage` / `SignupPage` handlers: exchange credentials for tokens; store **refresh** securely (httpOnly cookie preferred over localStorage for refresh token).

### 3. Primary database

**Postgres** (recommended for relational data, migrations, joins):

- `users`, `projects`, `project_assets`, `chat_messages`, `marketplace_listings`, `orders`, `freelancer_profiles`, etc.

**Firestore** (if staying Google-centric):

- Collections mirror above; use **subcollections** for chat messages per project.

**Sync strategy:** on login, **hydrate** Zustand from API; optionally **optimistic UI** + background reconcile; stop persisting full `projects` to localStorage for multi-device truth (or use persist only as offline cache with version stamps).

### 4. Object storage (GLB, textures, thumbnails)

- **Firebase Storage**, **S3**, or **GCS**.
- Flow: client requests **`POST /v1/uploads/sign`** → receives **presigned PUT** → uploads file → client sends **`finalize`** with etag → API saves metadata row.
- **Public WebAR:** use **long-lived signed URLs** or **public bucket + cache headers**; enforce **virus scan** / **file type sniffing** server-side.

### 5. Meshy, Hyper3D, and other generators

| Concern | Approach |
|---------|----------|
| **API keys** | Environment variables on worker/API only |
| **Async** | All generative 3D calls return **job IDs**; UI shows progress |
| **Cost control** | Per-user quotas, prepaid credits, admin flags |
| **Fallback** | Queue retry, secondary provider, dead-letter queue |
| **Output normalization** | Worker downloads provider GLB → optional **draco/meshopt** → upload to your bucket → single canonical URL in DB |

### 6. Real-time chat (optional)

- If Ardya becomes **true** multi-turn LLM: **OpenAI / Gemini / Vertex** on server with **RAG** over project assets; stream tokens via SSE.
- `@google/genai` in `package.json` fits a **Node** or **Cloud Function** worker better than bundling keys into the SPA.

### 7. Payments (marketplace / cart)

- **Stripe Checkout** or **Razorpay** (India): webhooks update `orders` table; digital goods = **license to download GLB** or **signed URL**.

### 8. CDN & caching

- Serve **static GLBs** and **images** from CDN; `Cache-Control` for immutable hashed filenames after build.

---

## Environment variables & secrets

| Variable / file | Current use | Production note |
|-----------------|-------------|-------------------|
| `GEMINI_API_KEY` | Injected via `vite.config.ts` `define` | **Do not** ship to browser for paid keys; use server only |
| `firebase-applet-config.json` | Contains web API keys & project IDs | **Rotate** if ever committed publicly; prefer `.env` + CI secrets; use **Firebase App Check** |
| `.env` / `.env.local` | Loaded by Vite | `VITE_*` only for **non-secret** public config |

Add (examples):

- `VITE_API_BASE_URL`
- Server-only: `DATABASE_URL`, `MESHY_API_KEY`, `HYPER3D_API_KEY`, `STRIPE_SECRET`, `FIREBASE_ADMIN_JSON`, etc.

---

## Checklist: everything that should change for production

### Auth & security

- [ ] Replace mock login with real auth + session/JWT
- [ ] Password hashing, reset email, email verification
- [ ] Route guards using **server-verified** session, not only `user` in memory
- [ ] CSRF protection for cookie-based auth
- [ ] Content Security Policy headers; restrict `script-src`
- [ ] Remove or secure **demo** credentials in `constants/demo.ts`

### Data

- [ ] Migrate projects/chat/cart from Zustand-only to **API + DB**
- [ ] Define **migration** for existing localStorage users (export/import tool optional)
- [ ] IndexedDB: either **cache-only** or drop when everything is URL-based

### Ardya & 3D providers

- [ ] Implement **job queue** + provider adapters (Meshy, Hyper3D, …)
- [ ] Remove hardcoded `CONCEPT_IMAGES` / `MODEL_FOR_IMAGE` mapping
- [ ] Store **prompt**, **provider**, **job id**, **output URLs** in DB

### Storage & WebAR

- [ ] Host GLBs on object storage + CDN; fix **CORS** for `model-viewer`
- [ ] Replace **api.qrserver.com** with **self-hosted** QR or server-generated PNG
- [ ] Virus/malware scanning on uploads; max file size; GLB validation

### Marketplace

- [ ] Real listings from DB; creator accounts; reviews; search
- [ ] Payments + webhooks; download entitlements

### Observability & reliability

- [ ] Structured logging, error tracking (Sentry, etc.)
- [ ] Rate limiting, abuse detection on generation endpoints
- [ ] Health checks, uptime monitors

### Frontend hardening

- [ ] Error boundaries on R3F routes
- [ ] Loading/failure states for all fetches
- [ ] i18n if needed; a11y audit (focus trap, skip links)

### Legal / product (not license)

- [ ] Privacy policy, terms, cookie consent if using analytics
- [ ] DPA with 3D API vendors if processing user uploads

---

## Scalability & operations

### Application tier

- **Stateless API** instances behind a load balancer; horizontal scale on CPU.
- **WebSocket/SSE** nodes can use **Redis** pub/sub if you fan out job events.

### Workers

- Separate **worker pool** for: Meshy/Hyper polling, GLB post-processing, thumbnail generation (Blender headless / sharp / gltf-transform).

### Database

- **Postgres**: read replicas for marketplace browse; connection pooling (PgBouncer).
- **Firestore**: sharded collections if write-heavy; composite indexes for queries.

### Caching

- **Redis** for session, rate limits, hot listing cache.
- **CDN** for all static assets and public GLBs.

### Cost controls

- Per-user **daily generation caps**; larger jobs require **paid tier**.
- **Compress** GLBs (meshopt/draco) to save bandwidth and storage.

### Multi-region (later)

- Storage **replication**; API **regions** closest to users; **signed URL** generation region-aware.

---

## Local development

```bash
npm install
# Optional: create .env with GEMINI_API_KEY if you add server-side usage later
npm run dev
# Opens Vite on port 5173 (see vite.config.ts)
```

- **Lint/types:** `npm run lint` → `tsc --noEmit`
- **Production build:** `npm run build` → `dist/` (code-split: `three`, `r3f`, `firebase`, `gsap` chunks)

---

## Build & deploy

- Any **static host** (Vercel, Netlify, Cloudflare Pages, S3+CloudFront) works for the SPA **if** all APIs are external.
- Configure **SPA fallback** to `index.html` for client-side routes.
- Set **environment variables** in the host dashboard; **never** commit production secrets.

---

## Summary

VisiARise is a **feature-rich frontend** for a spatial/AI product: **landing**, **mock Ardya**, **real Three.js studio**, **WebAR via model-viewer**, and **local-first persistence**. The next phase is to **introduce a real API**, **database**, **object storage**, and **provider workers** (Meshy, Hyper3D, etc.) while keeping this SPA as the **primary client** — swapping simulated flows in `ProjectChat` and `useAppStore` for **HTTP + real URLs** and **server-driven jobs**.

For questions about a specific file, start with `App.tsx`, `useAppStore.ts`, `ProjectChat.tsx`, `Studio.tsx`, `LandingPage.tsx`, and `studio3d.ts`.
