import { create } from 'zustand';

import type { ViewMode } from '../components/web-search-content';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SimilarSeed {
    artist: string;
    deezerId?: null | number;
    title?: string;
}

interface LastSearch {
    query: string;
    viewMode: ViewMode;
}

interface WebSearchUIStore {
    clearPendingQuery: () => void;
    closeSimilar: () => void;
    // Dernière recherche de l'onglet Web Search (retrouvée au retour d'une fiche artiste)
    lastSearch: LastSearch;
    openSimilar: (seed: SimilarSeed) => void;
    // Requête poussée vers l'onglet Web Search (ex. clic sur un artiste similaire)
    pendingQuery: null | string;
    setLastSearch: (lastSearch: LastSearch) => void;
    setPendingQuery: (query: string) => void;
    // Seed du drawer de morceaux similaires ; null = fermé
    similarSeed: null | SimilarSeed;
}

export const useWebSearchUIStore = create<WebSearchUIStore>((set) => ({
    clearPendingQuery: () => set({ pendingQuery: null }),
    closeSimilar: () => set({ similarSeed: null }),
    lastSearch: { query: '', viewMode: 'tracks' },
    openSimilar: (seed) => set({ similarSeed: seed }),
    pendingQuery: null,
    setLastSearch: (lastSearch) => set({ lastSearch }),
    setPendingQuery: (query) => set({ pendingQuery: query }),
    similarSeed: null,
}));
