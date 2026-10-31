import type { QueryClient } from '@tanstack/react-query';

import { useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useEffect, useRef, useState } from 'react';

import {
    offlineActions,
    OfflineSubscription,
    useOfflineSubscriptions,
} from '/@/renderer/features/offline/store/offline-store';
import { fetchSongsByItemType } from '/@/renderer/features/player/context/player-context';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { LibraryItem, Song, SongListSort, SortOrder } from '/@/shared/types/domain-types';

// Fréquence de re-résolution d'un abonnement (titres ajoutés ou retirés côté serveur)
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

// Délai avant de retenter un abonnement dont la synchro a échoué
const RETRY_DELAY_MS = 5 * 60 * 1000;

const PAGE_SIZE = 500;

const fetchFavoriteSongs = async (queryClient: QueryClient, serverId: string): Promise<Song[]> => {
    const songs: Song[] = [];
    let startIndex = 0;

    for (;;) {
        const page = await queryClient.fetchQuery({
            ...songsQueries.list({
                query: {
                    favorite: true,
                    limit: PAGE_SIZE,
                    sortBy: SongListSort.NAME,
                    sortOrder: SortOrder.ASC,
                    startIndex,
                },
                serverId,
            }),
            gcTime: 0,
            staleTime: 0,
        });

        if (page?.items?.length) {
            songs.push(...page.items);
        }
        if (!page?.items || page.items.length < PAGE_SIZE) {
            break;
        }

        startIndex += PAGE_SIZE;
    }

    return songs;
};

const resolveSongs = (
    queryClient: QueryClient,
    subscription: OfflineSubscription,
): Promise<Song[]> => {
    if (subscription.kind === 'favorites') {
        return fetchFavoriteSongs(queryClient, subscription.serverId);
    }

    return fetchSongsByItemType(queryClient, subscription.serverId, {
        id: [subscription.itemId],
        itemType: subscription.kind === 'album' ? LibraryItem.ALBUM : LibraryItem.PLAYLIST,
    });
};

/**
 * Monté au niveau du layout : maintient les abonnements hors ligne (playlists,
 * albums, favoris) alignés sur le serveur. Chaque abonnement est re-résolu au
 * démarrage, au retour du réseau et toutes les SYNC_INTERVAL_MS ; les titres
 * ajoutés entrent dans la file de téléchargement, ceux qui ont disparu perdent
 * leur référence et sont effacés du disque s'ils n'en ont plus aucune.
 */
export const OfflineSyncManager = () => {
    const queryClient = useQueryClient();
    const subscriptions = useOfflineSubscriptions();

    const runningRef = useRef<Set<string>>(new Set());
    const lastAttemptRef = useRef<Map<string, number>>(new Map());
    const [tick, setTick] = useState(0);

    // Réveils périodiques et au retour de la connexion
    useEffect(() => {
        const interval = setInterval(() => setTick((value) => value + 1), SYNC_INTERVAL_MS);
        const handleOnline = () => setTick((value) => value + 1);

        window.addEventListener('online', handleOnline);

        return () => {
            clearInterval(interval);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    useEffect(() => {
        if (!isElectron() || !navigator.onLine) return;

        for (const [subKey, subscription] of Object.entries(subscriptions)) {
            if (runningRef.current.has(subKey)) continue;

            const now = Date.now();
            const lastAttempt = lastAttemptRef.current.get(subKey) ?? 0;

            // Une synchro en échec ne doit pas boucler : elle laisse passer RETRY_DELAY_MS
            if (subscription.syncStatus === 'error' && now - lastAttempt < RETRY_DELAY_MS) {
                continue;
            }

            const isDue =
                subscription.lastSyncedAt === null ||
                now - subscription.lastSyncedAt > SYNC_INTERVAL_MS;
            if (!isDue) continue;

            runningRef.current.add(subKey);
            lastAttemptRef.current.set(subKey, now);

            const run = async () => {
                const { reconcile, setSyncStatus } = offlineActions();

                try {
                    setSyncStatus(subKey, 'syncing');
                    const songs = await resolveSongs(queryClient, subscription);
                    reconcile(subKey, songs);
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Sync failed';
                    setSyncStatus(subKey, 'error', message);
                } finally {
                    runningRef.current.delete(subKey);
                }
            };

            run();
        }
    }, [subscriptions, tick, queryClient]);

    return null;
};
