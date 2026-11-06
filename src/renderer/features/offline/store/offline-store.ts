import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { create } from 'zustand';
import { persist, PersistStorage, StorageValue } from 'zustand/middleware';

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

export const FAVORITES_ITEM_ID = 'all';

// Référence des titres téléchargés à l'unité en v1 (migration) : sans
// abonnement, seul "Supprimer tous les téléchargements" les efface.
const MANUAL_REF = 'manual';

// Sous Tauri, src/tauri/bridge.ts fournit le préfixe propre à la webview (http://feishin.localhost/...)
export const OFFLINE_PROTOCOL_PREFIX: string =
    (window as { FEISHIN_OFFLINE_PREFIX?: string }).FEISHIN_OFFLINE_PREFIX ?? 'feishin://offline/';

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

// Écriture IndexedDB regroupée : zustand persist réécrit TOUT le store (chaque entrée
// porte l'objet Song complet) à chaque set(), soit plusieurs fois par seconde pendant
// une synchro. On n'écrit que le dernier état, au plus une fois par seconde.
const PERSIST_DEBOUNCE_MS = 1000;
const pendingWrites = new Map<string, StorageValue<OfflinePersistedState>>();
let flushTimer: null | ReturnType<typeof setTimeout> = null;

const flushWrites = () => {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    for (const [name, value] of pendingWrites) {
        void idbSet(name, value);
    }
    pendingWrites.clear();
};

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushWrites);
    window.addEventListener('beforeunload', flushWrites);
}

const offlineStorage: PersistStorage<OfflinePersistedState> = {
    getItem: async (name) => {
        const pending = pendingWrites.get(name);
        if (pending) return pending;
        const value = await idbGet(name);
        return value ?? null;
    },
    removeItem: async (name) => {
        pendingWrites.delete(name);
        await idbDel(name);
    },
    setItem: async (name, value) => {
        pendingWrites.set(name, value);
        if (!flushTimer) {
            flushTimer = setTimeout(flushWrites, PERSIST_DEBOUNCE_MS);
        }
    },
};

// ── Helpers ────────────────────────────────────────────────────────────────

const createEntry = (song: Song, ref: string, order: number): OfflineEntry => ({
    addedAt: Date.now() + order,
    coverRelPath: null,
    error: null,
    filePath: null,
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
    drainDeletions: (relPaths: string[]) => void;
    markDone: (
        key: string,
        result: { coverRelPath: null | string; filePath: string; relPath: string; size: number },
    ) => void;
    markDownloading: (key: string) => void;
    markError: (key: string, error: string) => void;
    // Aligne les titres d'un abonnement sur la liste fraîchement résolue
    reconcile: (subKey: string, songs: Song[]) => void;
    removeAll: () => void;
    requeue: (key: string) => void;
    // Au démarrage : les téléchargements interrompus repassent en file d'attente
    resetInterrupted: () => void;
    // Serveur injoignable (non persisté) : détecté par ServerReachabilityManager
    serverUnreachable: boolean;
    setOfflineMode: (enabled: boolean) => void;
    setServerUnreachable: (unreachable: boolean) => void;
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
                            [key]: { ...entry, error: null, status: 'downloading' },
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
                    const kept = new Set<string>();
                    let order = 0;

                    for (const song of songs) {
                        const key = offlineKey(song._serverId, song.id);
                        if (kept.has(key)) continue;
                        kept.add(key);

                        const current = entries[key];
                        if (!current) {
                            entries[key] = createEntry(song, subKey, order);
                            order += 1;
                            continue;
                        }
                        const refs = current.refs.includes(subKey)
                            ? current.refs
                            : [...current.refs, subKey];
                        // Échec précédent : chaque synchro lui redonne sa chance
                        if (current.status === 'error') {
                            entries[key] = {
                                ...current,
                                addedAt: Date.now(),
                                error: null,
                                refs,
                                status: 'queued',
                            };
                        } else if (refs !== current.refs) {
                            entries[key] = { ...current, refs };
                        }
                    }

                    // Titres retirés de l'objet côté serveur depuis la dernière synchro
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
                                songKeys: [...kept],
                                syncError: null,
                                syncStatus: 'idle',
                            },
                        },
                    };
                }),

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
                            next[key] = { ...entry, status: 'queued' };
                            changed = true;
                        }
                    }
                    return changed ? { entries: next } : s;
                }),

            serverUnreachable: false,

            setOfflineMode: (enabled) => set({ offlineMode: enabled }),

            setServerUnreachable: (unreachable) =>
                set((s) =>
                    s.serverUnreachable === unreachable ? s : { serverUnreachable: unreachable },
                ),

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

// Progression des téléchargements en cours (0-100 par clé), hors du store
// persisté : un tick de progression ne doit pas réécrire IndexedDB.
export const useOfflineProgressStore = create<Record<string, number>>(() => ({}));

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

/**
 * Mode hors connexion effectif : réseau coupé, serveur injoignable (ex. NAS
 * hors de portée alors que le Wi-Fi marche) ou mode forcé par l'utilisateur.
 */
export const isOfflineActive = (): boolean => {
    const { offlineMode, serverUnreachable } = useOfflineStoreBase.getState();
    return offlineMode || serverUnreachable || !navigator.onLine;
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

export const useServerUnreachable = (): boolean => {
    return useOfflineStoreBase((s) => s.serverUnreachable);
};

export const useOfflineModeSetting = (): boolean => {
    return useOfflineStoreBase((s) => s.offlineMode);
};

// Les actions sont stables : accès direct sans abonnement
export const offlineActions = () => {
    const s = useOfflineStoreBase.getState();
    return {
        drainDeletions: s.drainDeletions,
        markDone: s.markDone,
        markDownloading: s.markDownloading,
        markError: s.markError,
        reconcile: s.reconcile,
        removeAll: s.removeAll,
        requeue: s.requeue,
        resetInterrupted: s.resetInterrupted,
        setOfflineMode: s.setOfflineMode,
        setServerUnreachable: s.setServerUnreachable,
        setSettings: s.setSettings,
        setSyncStatus: s.setSyncStatus,
        subscribe: s.subscribe,
        unsubscribe: s.unsubscribe,
    };
};
