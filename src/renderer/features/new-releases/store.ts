import { create } from 'zustand';

interface NewReleasesStore {
    days: number;
    limitPerGenre: number;
    setDays: (days: number) => void;
    setLimitPerGenre: (limitPerGenre: number) => void;
}

/**
 * Shared between the New Releases landing and the genre-detail page so both
 * read the same window / page size (and hit the same React Query cache entry).
 */
export const useNewReleasesStore = create<NewReleasesStore>((set) => ({
    days: 7,
    limitPerGenre: 50,
    setDays: (days) => set({ days }),
    setLimitPerGenre: (limitPerGenre) => set({ limitPerGenre }),
}));
