import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { persist, PersistStorage } from 'zustand/middleware';

import { useSettingsStore } from '/@/renderer/store/settings.store';
import { Song } from '/@/shared/types/domain-types';
import { PlayerType } from '/@/shared/types/types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface OfflineEntry {
    addedAt: number;
    coverRelPath: null | string;
    error: null | string;
    // Chemin absolu sur disque (pour mpv)
    filePath: null | string;
    // 0-100
    progress: number;
    // Chemin relatif au dossier offline (pour le protocole feishin://offline/)
    relPath: null | string;
    size: number;
    song: Song;
    status: OfflineStatus;
}

export type OfflineStatus = 'done' | 'downloading' | 'error' | 'queued';

export const offlineKey = (serverId: string, songId: string): string => `${serverId}/${songId}`;

export const OFFLINE_PROTOCOL_PREFIX = 'feishin://offline/';

// ── Persistance (IndexedDB — les métadonnées Song sont volumineuses) ───────

interface OfflinePersistedState {
    entries: Record<string, OfflineEntry>;
}

const offlineStorage: PersistStorage<OfflinePersistedState> = {
    getItem: async (name) => {
        const value = await idbGet(name);
        return value ?? null;
    },
    removeItem: async (name) => {
        await idbDel(name);
    },
    setItem: async (name, value) => {
        await idbSet(name, value);
    },
};

// ── Store ──────────────────────────────────────────────────────────────────

interface OfflineStore extends OfflinePersistedState {
    enqueue: (songs: Song[]) => number;
    markDone: (
        key: string,
        result: { coverRelPath: null | string; filePath: string; relPath: string; size: number },
    ) => void;
    markDownloading: (key: string) => void;
    markError: (key: string, error: string) => void;
    remove: (keys: string[]) => void;
    requeue: (key: string) => void;
    // Au démarrage : les téléchargements interrompus repassent en file d'attente
    resetInterrupted: () => void;
    setProgress: (key: string, progress: number) => void;
}

export const useOfflineStoreBase = create<OfflineStore>()(
    persist(
        (set, get) => ({
            enqueue: (songs) => {
                const existing = get().entries;
                const next = { ...existing };
                let added = 0;

                for (const song of songs) {
                    const key = offlineKey(song._serverId, song.id);
                    const current = existing[key];
                    if (current && current.status !== 'error') continue;

                    next[key] = {
                        addedAt: Date.now() + added,
                        coverRelPath: null,
                        error: null,
                        filePath: null,
                        progress: 0,
                        relPath: null,
                        size: 0,
                        song,
                        status: 'queued',
                    };
                    added += 1;
                }

                if (added > 0) {
                    set({ entries: next });
                }
                return added;
            },

            entries: {},

            markDone: (key, result) =>
                set((s) => {
                    const entry = s.entries[key];
                    if (!entry) return s;
                    return {
                        entries: {
                            ...s.entries,
                            [key]: {
                                ...entry,
                                coverRelPath: result.coverRelPath,
                                error: null,
                                filePath: result.filePath,
                                progress: 100,
                                relPath: result.relPath,
                                size: result.size,
                                status: 'done',
                            },
                        },
                    };
                }),

            markDownloading: (key) =>
                set((s) => {
                    const entry = s.entries[key];
                    if (!entry) return s;
                    return {
                        entries: {
                            ...s.entries,
                            [key]: { ...entry, error: null, progress: 0, status: 'downloading' },
                        },
                    };
                }),

            markError: (key, error) =>
                set((s) => {
                    const entry = s.entries[key];
                    if (!entry) return s;
                    return {
                        entries: {
                            ...s.entries,
                            [key]: { ...entry, error, status: 'error' },
                        },
                    };
                }),

            remove: (keys) =>
                set((s) => {
                    const next = { ...s.entries };
                    for (const key of keys) {
                        delete next[key];
                    }
                    return { entries: next };
                }),

            requeue: (key) =>
                set((s) => {
                    const entry = s.entries[key];
                    if (!entry) return s;
                    return {
                        entries: {
                            ...s.entries,
                            [key]: {
                                ...entry,
                                addedAt: Date.now(),
                                error: null,
                                progress: 0,
                                status: 'queued',
                            },
                        },
                    };
                }),

            resetInterrupted: () =>
                set((s) => {
                    const next = { ...s.entries };
                    let changed = false;
                    for (const [key, entry] of Object.entries(next)) {
                        if (entry.status === 'downloading') {
                            next[key] = { ...entry, progress: 0, status: 'queued' };
                            changed = true;
                        }
                    }
                    return changed ? { entries: next } : s;
                }),

            setProgress: (key, progress) =>
                set((s) => {
                    const entry = s.entries[key];
                    if (!entry || entry.status !== 'downloading') return s;
                    return {
                        entries: {
                            ...s.entries,
                            [key]: { ...entry, progress },
                        },
                    };
                }),
        }),
        {
            name: 'offline-downloads',
            partialize: (state) => ({ entries: state.entries }),
            storage: offlineStorage,
            version: 1,
        },
    ),
);

// ── Accès non-hook (moteurs de lecture) ────────────────────────────────────

export const getOfflineEntry = (serverId: string, songId: string): OfflineEntry | undefined => {
    return useOfflineStoreBase.getState().entries[offlineKey(serverId, songId)];
};

/**
 * URL de lecture locale pour un morceau téléchargé, ou undefined s'il ne
 * l'est pas. mpv lit le chemin absolu ; le web player passe par le
 * protocole feishin://offline/.
 */
export const getOfflinePlaybackUrl = (song: {
    _serverId: string;
    id: string;
}): string | undefined => {
    const entry = getOfflineEntry(song._serverId, song.id);
    if (entry?.status !== 'done' || !entry.relPath) return undefined;

    const playerType = useSettingsStore.getState().playback.type;
    if (playerType === PlayerType.LOCAL) {
        return entry.filePath ?? undefined;
    }
    return `${OFFLINE_PROTOCOL_PREFIX}${encodeURI(entry.relPath)}`;
};

export const isSongDownloaded = (serverId: string, songId: string): boolean => {
    return getOfflineEntry(serverId, songId)?.status === 'done';
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export const useOfflineEntry = (
    serverId: string | undefined,
    songId: string | undefined,
): OfflineEntry | undefined => {
    return useOfflineStoreBase((s) =>
        serverId && songId ? s.entries[offlineKey(serverId, songId)] : undefined,
    );
};

export const useOfflineEntries = (): Record<string, OfflineEntry> => {
    return useOfflineStoreBase((s) => s.entries);
};

// Les actions sont stables : accès direct sans abonnement
export const offlineActions = () => {
    const s = useOfflineStoreBase.getState();
    return {
        enqueue: s.enqueue,
        markDone: s.markDone,
        markDownloading: s.markDownloading,
        markError: s.markError,
        remove: s.remove,
        requeue: s.requeue,
        resetInterrupted: s.resetInterrupted,
        setProgress: s.setProgress,
    };
};
