import { generatePath } from 'react-router';

import i18n from '/@/i18n/i18n';
import {
    OFFLINE_PROTOCOL_PREFIX,
    OfflineEntry,
    OfflineSubscription,
} from '/@/renderer/features/offline/store/offline-store';
import { AppRoute } from '/@/renderer/router/routes';

export const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

/** Jaquette locale d'un titre téléchargé, avec repli sur l'URL serveur. */
export const entryCoverSrc = (entry: OfflineEntry): string | undefined => {
    if (entry.coverRelPath) {
        return `${OFFLINE_PROTOCOL_PREFIX}${encodeURI(entry.coverRelPath)}`;
    }
    return entry.song.imageUrl ?? undefined;
};

/**
 * Pochette d'une collection : la jaquette locale de son premier titre
 * téléchargé, pour rester affichable sans réseau.
 */
export const subscriptionCoverSrc = (
    subscription: OfflineSubscription,
    entries: Record<string, OfflineEntry>,
): string | undefined => {
    for (const key of subscription.songKeys) {
        const entry = entries[key];
        if (entry?.coverRelPath) {
            return `${OFFLINE_PROTOCOL_PREFIX}${encodeURI(entry.coverRelPath)}`;
        }
    }
    return subscription.imageUrl ?? undefined;
};

export const subscriptionEntries = (
    subscription: OfflineSubscription,
    entries: Record<string, OfflineEntry>,
): OfflineEntry[] => {
    return subscription.songKeys
        .map((key) => entries[key])
        .filter((entry): entry is OfflineEntry => Boolean(entry));
};

export const subscriptionSize = (
    subscription: OfflineSubscription,
    entries: Record<string, OfflineEntry>,
): number => {
    return subscriptionEntries(subscription, entries).reduce(
        (total, entry) => total + (entry.size || 0),
        0,
    );
};

/** Page de la collection (rendue en version locale hors connexion par OfflineCollectionGate). */
export const collectionPath = (subscription: OfflineSubscription): string => {
    switch (subscription.kind) {
        case 'album':
            return generatePath(AppRoute.LIBRARY_ALBUMS_DETAIL, { albumId: subscription.itemId });
        case 'favorites':
            return AppRoute.FAVORITES;
        default:
            return generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, {
                playlistId: subscription.itemId,
            });
    }
};

export const collectionName = (subscription: OfflineSubscription): string =>
    subscription.kind === 'favorites'
        ? i18n.t('page.offline.kind_favorites')
        : subscription.name || subscription.itemId;

// Ordre façon Spotify : favoris, puis playlists, puis albums, chacun par nom
const KIND_ORDER = { album: 2, favorites: 0, playlist: 1 } as const;

export const sortCollections = (subscriptions: OfflineSubscription[]): OfflineSubscription[] =>
    [...subscriptions].sort(
        (a, b) =>
            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
            collectionName(a).localeCompare(collectionName(b)),
    );
