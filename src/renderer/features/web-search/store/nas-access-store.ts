import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NasRoute = 'lan' | 'public';

interface NasAccessStore {
    // Adresse publique de l'API musique (reverse proxy npm) et jeton Feishin
    // (/volume2/music/.feishin_token sur le NAS)
    publicUrl: string;
    // Chemin utilisé en ce moment ; null tant que rien n'a été tenté
    route: NasRoute | null;
    setAccess: (access: { publicUrl: string; token: string }) => void;
    setRoute: (route: NasRoute) => void;
    token: string;
}

export const DEFAULT_PUBLIC_URL = 'https://dl.utl.duckdns.org';

export const useNasAccessStore = create<NasAccessStore>()(
    persist(
        (set) => ({
            publicUrl: DEFAULT_PUBLIC_URL,
            route: null,
            setAccess: ({ publicUrl, token }) =>
                set({ publicUrl: publicUrl.trim().replace(/\/+$/, ''), token: token.trim() }),
            setRoute: (route) => set({ route }),
            token: '',
        }),
        {
            name: 'feishin-nas-access',
            partialize: (s) => ({ publicUrl: s.publicUrl, token: s.token }),
        },
    ),
);
