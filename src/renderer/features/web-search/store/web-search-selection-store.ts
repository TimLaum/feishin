import { create } from 'zustand';

import type { AlbumSearchResult, WebSearchResult } from '../components/web-search-content';

import { trackKey } from '../api';

// Sélection multiple (titres + albums) envoyée en un seul lot. Elle survit à la
// navigation : on peut cocher des albums sur plusieurs fiches artistes.
export type SelectionEntry =
    | { item: AlbumSearchResult; kind: 'album' }
    | { item: WebSearchResult; kind: 'track' };

export const albumSelectionKey = (a: AlbumSearchResult) => `a:${a.deezer_id}`;
export const trackSelectionKey = (t: WebSearchResult) => `t:${trackKey(t)}`;

interface WebSearchSelectionStore {
    clear: () => void;
    entries: Record<string, SelectionEntry>;
    toggle: (key: string, entry: SelectionEntry) => void;
}

export const useWebSearchSelectionStore = create<WebSearchSelectionStore>((set) => ({
    clear: () => set({ entries: {} }),
    entries: {},
    toggle: (key, entry) =>
        set((s) => {
            const entries = { ...s.entries };
            if (entries[key]) delete entries[key];
            else entries[key] = entry;
            return { entries };
        }),
}));

export const useIsSelecting = () =>
    useWebSearchSelectionStore((s) => Object.keys(s.entries).length > 0);
