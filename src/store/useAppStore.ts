import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearAllStudioAssets, loadProjectHeavyAssets, persistProjectHeavyAssets } from '../lib/studioAssetDb';

export interface User {
  id: string;
  email: string;
  name: string;
}

export type ProjectUseCase = 'game' | 'company' | 'freelance' | 'business' | 'product' | '';

/** Additional GLB layer fused into AR Studio (same scene, export & AR publish merge). */
export interface StudioExtraModel {
  id: string;
  name: string;
  modelUrl?: string;
  modelDataUrl?: string;
}

export type StudioNodeTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

/** Strip stale blob: URLs from persisted projects (they 404 after the tab/session ends). */
function sanitizeProjectBlobUrls(project: Project): Project {
  const p = { ...project };
  const dead = (u?: string) => !!u && u.startsWith('blob:');
  if (dead(p.modelUrl)) delete p.modelUrl;
  if (dead(p.modelDataUrl)) delete p.modelDataUrl;
  if (p.studioExtras?.length) {
    p.studioExtras = p.studioExtras.map((ex) => {
      const e = { ...ex };
      if (dead(e.modelUrl)) delete e.modelUrl;
      if (dead(e.modelDataUrl)) delete e.modelDataUrl;
      return e;
    });
  }
  return p;
}

/** Drop large data URLs from the object written to localStorage (blobs live in IndexedDB). */
function stripHeavyFromProjectForPersist(p: Project): Project {
  return {
    ...p,
    modelDataUrl: undefined,
    logoDataUrl: undefined,
    studioExtras: p.studioExtras?.map((e) => ({ ...e, modelDataUrl: undefined })),
  };
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  status: 'draft' | 'published';
  modelUrl?: string;
  /** Inlined user upload (persists across refresh; blob: URLs do not). */
  modelDataUrl?: string;
  thumbnailUrl?: string;
  /** How you use ARdya — shapes defaults in the workspace */
  useCase?: ProjectUseCase;
  /** Free-form tag e.g. footwear, automotive */
  category?: string;
  /** Extra imported models in the studio scene */
  studioExtras?: StudioExtraModel[];
  /** PNG/JPEG/WebP as data URL — shown as a plane “sticker” in scene */
  logoDataUrl?: string;
  logoScale?: number;
  logoOffsetY?: number;
  /** Persisted transforms keyed as `primary`, `logo`, or extra model `id` */
  studioTransforms?: Record<string, StudioNodeTransform>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  modelUrl?: string;
}

export interface MarketplaceItem {
  id: string;
  name: string;
  price: number;
  creator: string;
  thumbnailUrl: string;
  modelUrl: string;
  category: string;
  rating: number;
  sales: number;
  description: string;
}

export interface CartItem extends MarketplaceItem {
  quantity: number;
}

export interface Freelancer {
  id: string;
  name: string;
  skills: string[];
  hourlyRate: number;
  rating: number;
  avatar: string;
}

/** Single source of truth — also used when migrating old persisted catalogs */
export const DEFAULT_MARKETPLACE_ITEMS: MarketplaceItem[] = [
  {
    id: 'm-avatar',
    name: 'Human Avatar — Studio PBR',
    price: 89,
    creator: 'VisiARise Labs',
    thumbnailUrl: '/Human_Avatar_Dhruv_Chaturvedi_img.png',
    modelUrl: '/Human_Avatar_Dhruv_Chaturvedi_model.glb',
    category: 'models',
    rating: 4.9,
    sales: 42,
    description:
      'Photorealistic human avatar: clean topology, PBR materials, ready for WebAR.',
  },
  {
    id: 'm-shoes',
    name: 'Designer Sneakers',
    price: 34,
    creator: 'VisiARise Labs',
    thumbnailUrl: '/Shoes.png',
    modelUrl: '/models/shoes_basic_pbr.glb',
    category: 'models',
    rating: 4.7,
    sales: 118,
    description: 'High-detail footwear model with baked PBR — ideal for product AR.',
  },
  {
    id: 'm-lambo',
    name: 'Sports Car — Huracán-class',
    price: 129,
    creator: 'VisiARise Labs',
    thumbnailUrl: '/Lamborgini_image.png',
    modelUrl: '/models/lamborghini_basic_pbr.glb',
    category: 'models',
    rating: 4.8,
    sales: 67,
    description: 'Showroom-grade vehicle mesh with realistic materials for AR placement.',
  },
  {
    id: 'm-iron',
    name: 'Armored Hero Suit',
    price: 79,
    creator: 'VisiARise Labs',
    thumbnailUrl: '/ironMan .png',
    modelUrl: '/models/ironman_basic_pbr.glb',
    category: 'models',
    rating: 4.85,
    sales: 91,
    description: 'Full hero suit with metallic PBR — great for character-scale AR.',
  },
  {
    id: 'm-drone',
    name: 'Sci‑Fi Drone',
    price: 45,
    creator: 'VisiARise Labs',
    thumbnailUrl: '/drone-generated.png',
    modelUrl: '/scifi_drone.glb',
    category: 'models',
    rating: 4.75,
    sales: 156,
    description:
      'Stylized sci‑fi drone from the public library — same GLB used in hero demos.',
  },
];

interface AppState {
  user: User | null;
  projects: Project[];
  marketplaceItems: MarketplaceItem[];
  freelancers: Freelancer[];
  currentProject: Project | null;
  chatHistory: Record<string, ChatMessage[]>;
  cart: CartItem[];
  onboardingCompleted: boolean;
  
  // Auth Actions
  setUser: (user: User | null) => void;
  updateUser: (updates: Partial<Pick<User, 'name' | 'email'>>) => void;
  logout: () => void;
  setOnboardingCompleted: (completed: boolean) => void;
  
  // Project Actions
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  setCurrentProject: (project: Project | null) => void;
  
  // Chat Actions
  addChatMessage: (projectId: string, message: ChatMessage) => void;
  
  // Marketplace Actions
  addMarketplaceItem: (item: MarketplaceItem) => void;
  addToCart: (item: MarketplaceItem) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      projects: [],
      marketplaceItems: DEFAULT_MARKETPLACE_ITEMS,
      freelancers: [
        {
          id: '1',
          name: 'Alex Rivera',
          skills: ['3D Modeling', 'Texturing', 'Blender'],
          hourlyRate: 45,
          rating: 4.9,
          avatar: '/Human_Avatar_Dhruv_Chaturvedi_img.png',
        },
        {
          id: '2',
          name: 'Sarah Chen',
          skills: ['AR Development', 'Unity', 'A-Frame'],
          hourlyRate: 60,
          rating: 5.0,
          avatar: '/Lamborgini_image.png',
        },
      ],
      currentProject: null,
      chatHistory: {},
      cart: [],
      onboardingCompleted: false,

      setUser: (user) => set({ user }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      logout: () => {
        void clearAllStudioAssets();
        set({ user: null, projects: [], currentProject: null, chatHistory: {}, cart: [] });
      },
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
      
      addProject: (project) =>
        set((state) => {
          queueMicrotask(() => void persistProjectHeavyAssets(project.id, project));
          return { projects: [project, ...state.projects] };
        }),
      updateProject: (id, updates) =>
        set((state) => {
          const projects = state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p));
          const merged = projects.find((p) => p.id === id);
          if (merged) queueMicrotask(() => void persistProjectHeavyAssets(id, merged));
          return { projects };
        }),
      setCurrentProject: (project) => set({ currentProject: project }),
      
      addChatMessage: (projectId, message) => set((state) => ({
        chatHistory: {
          ...state.chatHistory,
          [projectId]: [...(state.chatHistory[projectId] || []), message],
        },
      })),
      
      addMarketplaceItem: (item) => set((state) => ({
        marketplaceItems: [item, ...state.marketplaceItems],
      })),

      addToCart: (item) => set((state) => {
        const existing = state.cart.find(c => c.id === item.id);
        if (existing) {
          return {
            cart: state.cart.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
          };
        }
        return { cart: [...state.cart, { ...item, quantity: 1 }] };
      }),
      removeFromCart: (id) => set((state) => ({
        cart: state.cart.filter(c => c.id !== id)
      })),
      clearCart: () => set({ cart: [] }),
    }),
    {
      /** New key so users aren’t stuck with pre-catalog `marketplaceItems` from older builds */
      name: 'visiarise-storage-v4',
      partialize: (state) => ({
        user: state.user,
        projects: state.projects.map(stripHeavyFromProjectForPersist),
        marketplaceItems: state.marketplaceItems,
        freelancers: state.freelancers,
        currentProject: state.currentProject
          ? stripHeavyFromProjectForPersist(state.currentProject)
          : null,
        chatHistory: state.chatHistory,
        cart: state.cart,
        onboardingCompleted: state.onboardingCompleted,
      }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<AppState>),
        };
        if (Array.isArray(merged.projects)) {
          merged.projects = merged.projects.map(sanitizeProjectBlobUrls);
        }
        return merged as AppState;
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error('[VisiARise] persist rehydration error', error);
        void (async () => {
          try {
            const { projects, updateProject } = useAppStore.getState();
            for (const p of projects) {
              const heavy = await loadProjectHeavyAssets(p);
              const has =
                heavy.modelDataUrl ||
                heavy.logoDataUrl ||
                heavy.studioExtras?.some((e) => e.modelDataUrl);
              if (has) updateProject(p.id, heavy);
            }
          } catch (e) {
            console.warn('[VisiARise] IndexedDB asset hydrate failed', e);
          }
        })();
      },
    }
  )
);
