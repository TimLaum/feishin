import {
    OFFLINE_PROTOCOL_PREFIX,
    OfflineEntry,
    OfflineSubscription,
} from '/@/renderer/features/offline/store/offline-store';

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
