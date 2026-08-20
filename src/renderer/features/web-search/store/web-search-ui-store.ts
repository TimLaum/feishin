import { create } from 'zustand';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SimilarSeed {
    artist: string;
    deezerId?: null | number;
    title?: string;
}

interface WebSearchUIStore {
    clearPendingQuery: () => void;
    closeSimilar: () => void;
    openSimilar: (seed: SimilarSeed) => void;
    // Requête poussée vers l'onglet Web Search (ex. clic sur un artiste similaire)
    pendingQuery: null | string;
    setPendingQuery: (query: string) => void;
    // Seed du drawer de morceaux similaires ; null = fermé
    similarSeed: null | SimilarSeed;
}

export const useWebSearchUIStore = create<WebSearchUIStore>((set) => ({
    clearPendingQuery: () => set({ pendingQuery: null }),
    closeSimilar: () => set({ similarSeed: null }),
    openSimilar: (seed) => set({ similarSeed: seed }),
    pendingQuery: null,
    setPendingQuery: (query) => set({ pendingQuery: query }),
    similarSeed: null,
}));
