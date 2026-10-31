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
    // Abonnements (ou MANUAL_REF) qui réclament ce fichier. Il n'est effacé du
    // disque que lorsque la dernière référence disparaît : un titre présent
    // dans deux playlists téléchargées survit au retrait de l'une d'elles.
    refs: string[];
    // Chemin relatif au dossier offline (pour le protocole feishin://offline/)
    relPath: null | string;
    size: number;
    song: Song;
    status: OfflineStatus;
}

/**
 * Qualité des téléchargements : le fichier original tel quel, ou une version
 * transcodée par le serveur pour économiser de la place.
 */
export interface OfflineSettings {
    bitrate: number;
    format: string;
    // 0 = pas de limite
    maxSizeBytes: number;
    quality: 'original' | 'transcoded';
}

export type OfflineStatus = 'done' | 'downloading' | 'error' | 'queued';

/**
 * Un abonnement représente un objet téléchargé (playlist, album, favoris), pas
 * une liste figée de titres : le moteur de synchro le re-résout régulièrement
 * pour récupérer les ajouts et évincer les retraits.
 */
export interface OfflineSubscription {
    addedAt: number;
    // Pochette de l'objet ; à défaut la vue offline retombe sur la jaquette
    // locale du premier titre
    imageUrl: null | string;
    // FAVORITES_ITEM_ID pour les favoris
    itemId: string;
    kind: OfflineSubscriptionKind;
    lastSyncedAt: null | number;
    name: string;
    serverId: string;
    // Clés d'entrées résolues lors de la dernière synchro
    songKeys: string[];
    syncError: null | string;
    syncStatus: OfflineSyncStatus;
}

export type OfflineSubscriptionKind = 'album' | 'favorites' | 'playlist';

export type OfflineSyncStatus = 'error' | 'idle' | 'syncing';

export interface RemoveResult {
    // Conservées car réclamées par un abonnement
    kept: number;
    removed: number;
}

export const FAVORITES_ITEM_ID = 'all';

// Référence d'un titre téléchargé à l'unité, hors de tout abonnement
export const MANUAL_REF = 'manual';

export const OFFLINE_PROTOCOL_PREFIX = 'feishin://offline/';

export const offlineKey = (serverId: string, songId: string): string => `${serverId}/${songId}`;

export const subscriptionKey = (
    serverId: string,
    kind: OfflineSubscriptionKind,
    itemId: string,
): string => `${serverId}/${kind}/${itemId}`;

// ── Persistance (IndexedDB — les métadonnées Song sont volumineuses) ───────

interface OfflinePersistedState {
    entries: Record<string, OfflineEntry>;
    // Mode hors connexion forcé par l'utilisateur (voir useIsOffline)
    offlineMode: boolean;
    // Fichiers orphelins à effacer du disque, drainés par le manager
    pendingDeletions: string[];
    settings: OfflineSettings;
    subscriptions: Record<string, OfflineSubscription>;
}

export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = {
    bitrate: 320,
    format: 'mp3',
    maxSizeBytes: 0,
    quality: 'original',
};

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

// ── Helpers ────────────────────────────────────────────────────────────────

const createEntry = (song: Song, ref: string, order: number): OfflineEntry => ({
    addedAt: Date.now() + order,
    coverRelPath: null,
    error: null,
    filePath: null,
    progress: 0,
    refs: [ref],
    relPath: null,
    size: 0,
    song,
    status: 'queued',
});

const filesOf = (entry: OfflineEntry): string[] => {
    return [entry.relPath, entry.coverRelPath].filter(Boolean) as string[];
};

/**
 * Retire une référence. Renvoie l'entrée inchangée si elle ne la portait pas,
 * null si c'était la dernière (le fichier doit alors être effacé du disque).
 */
const withoutRef = (entry: OfflineEntry, ref: string): null | OfflineEntry => {
    if (!entry.refs.includes(ref)) return entry;
    const refs = entry.refs.filter((current) => current !== ref);
    return refs.length === 0 ? null : { ...entry, refs };
};

// ── Store ──────────────────────────────────────────────────────────────────

interface OfflineStore extends OfflinePersistedState {
    // Téléchargement de titres à l'unité
    addManual: (songs: Song[]) => number;
    drainDeletions: (relPaths: string[]) => void;
    markDone: (
        key: string,
        result: { coverRelPath: null | string; filePath: string; relPath: string; size: number },
    ) => void;
    markDownloading: (key: string) => void;
    markError: (key: string, error: string) => void;
    // Aligne les titres d'un abonnement sur la liste fraîchement résolue
    reconcile: (subKey: string, songs: Song[]) => void;
    remove: (keys: string[]) => RemoveResult;
    removeAll: () => void;
    requeue: (key: string) => void;
    // Au démarrage : les téléchargements interrompus repassent en file d'attente
    resetInterrupted: () => void;
    setOfflineMode: (enabled: boolean) => void;
    setProgress: (key: string, progress: number) => void;
    setSettings: (settings: Partial<OfflineSettings>) => void;
    setSyncStatus: (subKey: string, status: OfflineSyncStatus, error?: null | string) => void;
    subscribe: (input: {
        imageUrl?: null | string;
        itemId: string;
        kind: OfflineSubscriptionKind;
        name: string;
        serverId: string;
    }) => string;
    unsubscribe: (subKey: string) => void;
}

export const useOfflineStoreBase = create<OfflineStore>()(
    persist(
        (set, get) => ({
            addManual: (songs) => {
                const existing = get().entries;
                const next = { ...existing };
                let added = 0;
                let order = 0;

                for (const song of songs) {
                    const key = offlineKey(song._serverId, song.id);
                    const current = existing[key];

                    if (!current) {
                        next[key] = createEntry(song, MANUAL_REF, order);
                        added += 1;
                        order += 1;
                        continue;
                    }

                    // Déjà là via un abonnement : on ajoute la référence manuelle
                    // pour que le titre survive au retrait de celui-ci.
                    if (!current.refs.includes(MANUAL_REF)) {
                        next[key] = { ...current, refs: [...current.refs, MANUAL_REF] };
                    }

                    if (current.status === 'error') {
                        next[key] = {
                            ...(next[key] ?? current),
                            addedAt: Date.now(),
                            error: null,
                            progress: 0,
                            status: 'queued',
                        };
                        added += 1;
                    }
                }

                set({ entries: next });
                return added;
            },

            drainDeletions: (relPaths) =>
                set((s) => {
                    const done = new Set(relPaths);
                    return { pendingDeletions: s.pendingDeletions.filter((p) => !done.has(p)) };
                }),

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

            offlineMode: false,

            pendingDeletions: [],

            reconcile: (subKey, songs) =>
                set((s) => {
                    const subscription = s.subscriptions[subKey];
                    if (!subscription) return s;

                    const entries = { ...s.entries };
                    const deletions = [...s.pendingDeletions];
                    const songKeys: string[] = [];
                    let order = 0;

                    for (const song of songs) {
                        const key = offlineKey(song._serverId, song.id);
                        if (songKeys.includes(key)) continue;
                        songKeys.push(key);

                        const current = entries[key];
                        if (!current) {
                            entries[key] = createEntry(song, subKey, order);
                            order += 1;
                            continue;
                        }
                        if (!current.refs.includes(subKey)) {
                            entries[key] = { ...current, refs: [...current.refs, subKey] };
                        }
                    }

                    // Titres retirés de l'objet côté serveur depuis la dernière synchro
                    const kept = new Set(songKeys);
                    for (const key of subscription.songKeys) {
                        if (kept.has(key)) continue;
                        const entry = entries[key];
                        if (!entry) continue;

                        const nextEntry = withoutRef(entry, subKey);
                        if (nextEntry) {
                            entries[key] = nextEntry;
                        } else {
                            deletions.push(...filesOf(entry));
                            delete entries[key];
                        }
                    }

                    return {
                        entries,
                        pendingDeletions: deletions,
                        subscriptions: {
                            ...s.subscriptions,
                            [subKey]: {
                                ...subscription,
                                lastSyncedAt: Date.now(),
                                songKeys,
                                syncError: null,
                                syncStatus: 'idle',
                            },
                        },
                    };
                }),

            remove: (keys) => {
                let kept = 0;
                let removed = 0;

                set((s) => {
                    const entries = { ...s.entries };
                    const deletions = [...s.pendingDeletions];

                    for (const key of keys) {
                        const entry = entries[key];
                        if (!entry) continue;

                        const nextEntry = withoutRef(entry, MANUAL_REF);
                        if (nextEntry === null) {
                            deletions.push(...filesOf(entry));
                            delete entries[key];
                            removed += 1;
                        } else {
                            // Réclamé par un abonnement : on ne troue pas la collection
                            entries[key] = nextEntry;
                            kept += 1;
                        }
                    }

                    return { entries, pendingDeletions: deletions };
                });

                return { kept, removed };
            },

            removeAll: () =>
                set((s) => ({
                    entries: {},
                    pendingDeletions: [
                        ...s.pendingDeletions,
                        ...Object.values(s.entries).flatMap(filesOf),
                    ],
                    subscriptions: {},
                })),

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

            setOfflineMode: (enabled) => set({ offlineMode: enabled }),

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

            setSettings: (settings) => set((s) => ({ settings: { ...s.settings, ...settings } })),

            setSyncStatus: (subKey, status, error = null) =>
                set((s) => {
                    const subscription = s.subscriptions[subKey];
                    if (!subscription) return s;
                    return {
                        subscriptions: {
                            ...s.subscriptions,
                            [subKey]: { ...subscription, syncError: error, syncStatus: status },
                        },
                    };
                }),

            settings: DEFAULT_OFFLINE_SETTINGS,

            subscribe: ({ imageUrl = null, itemId, kind, name, serverId }) => {
                const key = subscriptionKey(serverId, kind, itemId);
                const existing = get().subscriptions[key];

                if (existing) {
                    // Nom et pochette rafraîchis au cas où l'objet aurait changé
                    if ((name && existing.name !== name) || imageUrl !== existing.imageUrl) {
                        set((s) => ({
                            subscriptions: {
                                ...s.subscriptions,
                                [key]: {
                                    ...existing,
                                    imageUrl: imageUrl ?? existing.imageUrl,
                                    name: name || existing.name,
                                },
                            },
                        }));
                    }
                    return key;
                }

                set((s) => ({
                    subscriptions: {
                        ...s.subscriptions,
                        [key]: {
                            addedAt: Date.now(),
                            imageUrl,
                            itemId,
                            kind,
                            lastSyncedAt: null,
                            name,
                            serverId,
                            songKeys: [],
                            syncError: null,
                            syncStatus: 'idle',
                        },
                    },
                }));

                return key;
            },

            subscriptions: {},

            unsubscribe: (subKey) =>
                set((s) => {
                    if (!s.subscriptions[subKey]) return s;

                    const subscriptions = { ...s.subscriptions };
                    delete subscriptions[subKey];

                    const entries = { ...s.entries };
                    const deletions = [...s.pendingDeletions];

                    for (const [key, entry] of Object.entries(s.entries)) {
                        const nextEntry = withoutRef(entry, subKey);
                        if (nextEntry === entry) continue;
                        if (nextEntry) {
                            entries[key] = nextEntry;
                        } else {
                            deletions.push(...filesOf(entry));
                            delete entries[key];
                        }
                    }

                    return { entries, pendingDeletions: deletions, subscriptions };
                }),
        }),
        {
            migrate: (persisted, version) => {
                const state = persisted as Partial<OfflinePersistedState>;

                // v1 : pas d'abonnements, tous les titres étaient manuels
                if (version < 2) {
                    const entries = Object.fromEntries(
                        Object.entries(state.entries ?? {}).map(([key, entry]) => [
                            key,
                            { ...entry, refs: [MANUAL_REF] },
                        ]),
                    );
                    return {
                        entries,
                        offlineMode: false,
                        pendingDeletions: [],
                        settings: DEFAULT_OFFLINE_SETTINGS,
                        subscriptions: {},
                    };
                }

                return state as OfflinePersistedState;
            },
            name: 'offline-downloads',
            partialize: (state) => ({
                entries: state.entries,
                offlineMode: state.offlineMode,
                pendingDeletions: state.pendingDeletions,
                settings: state.settings,
                subscriptions: state.subscriptions,
            }),
            storage: offlineStorage,
            version: 2,
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

export const getOfflineSettings = (): OfflineSettings => {
    return useOfflineStoreBase.getState().settings ?? DEFAULT_OFFLINE_SETTINGS;
};

export const isOfflineModeEnabled = (): boolean => {
    return useOfflineStoreBase.getState().offlineMode;
};

/** Mode hors connexion effectif : réseau coupé ou mode forcé par l'utilisateur. */
export const isOfflineActive = (): boolean => {
    return useOfflineStoreBase.getState().offlineMode || !navigator.onLine;
};

/**
 * En mode hors connexion, la file de lecture ne doit contenir que du lisible :
 * on écarte les titres non téléchargés à l'ajout plutôt que de les sauter
 * pendant la lecture.
 */
export const filterOfflineAvailable = <T extends { _serverId: string; id: string }>(
    songs: T[],
): T[] => {
    return songs.filter((song) => isSongDownloaded(song._serverId, song.id));
};

/** Taille totale occupée sur le disque par les titres téléchargés. */
export const getOfflineTotalSize = (): number => {
    return Object.values(useOfflineStoreBase.getState().entries).reduce(
        (total, entry) => total + (entry.size || 0),
        0,
    );
};

// ── Hooks ──────────────────────────────────────────────────────────────────

export const useOfflineEntries = (): Record<string, OfflineEntry> => {
    return useOfflineStoreBase((s) => s.entries);
};

export const useOfflineEntry = (
    serverId: string | undefined,
    songId: string | undefined,
): OfflineEntry | undefined => {
    return useOfflineStoreBase((s) =>
        serverId && songId ? s.entries[offlineKey(serverId, songId)] : undefined,
    );
};

export const useOfflineSubscription = (
    serverId: string | undefined,
    kind: OfflineSubscriptionKind,
    itemId: string | undefined,
): OfflineSubscription | undefined => {
    return useOfflineStoreBase((s) =>
        serverId && itemId ? s.subscriptions[subscriptionKey(serverId, kind, itemId)] : undefined,
    );
};

export const useOfflineSubscriptions = (): Record<string, OfflineSubscription> => {
    return useOfflineStoreBase((s) => s.subscriptions);
};

export const useOfflineModeSetting = (): boolean => {
    return useOfflineStoreBase((s) => s.offlineMode);
};

export const useOfflineSettings = (): OfflineSettings => {
    return useOfflineStoreBase((s) => s.settings ?? DEFAULT_OFFLINE_SETTINGS);
};

// Les actions sont stables : accès direct sans abonnement
export const offlineActions = () => {
    const s = useOfflineStoreBase.getState();
    return {
        addManual: s.addManual,
        drainDeletions: s.drainDeletions,
        markDone: s.markDone,
        markDownloading: s.markDownloading,
        markError: s.markError,
        reconcile: s.reconcile,
        remove: s.remove,
        removeAll: s.removeAll,
        requeue: s.requeue,
        resetInterrupted: s.resetInterrupted,
        setOfflineMode: s.setOfflineMode,
        setProgress: s.setProgress,
        setSettings: s.setSettings,
        setSyncStatus: s.setSyncStatus,
        subscribe: s.subscribe,
        unsubscribe: s.unsubscribe,
    };
};
