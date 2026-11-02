import { useMemo } from 'react';

import {
    OfflineSubscriptionKind,
    subscriptionKey,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';

export interface OfflineSubscriptionState {
    doneCount: number;
    errorCount: number;
    isComplete: boolean;
    isSubscribed: boolean;
    // Synchro en cours, ou téléchargements encore en file
    isWorking: boolean;
    progress: number;
    totalCount: number;
}

const EMPTY_STATE: OfflineSubscriptionState = {
    doneCount: 0,
    errorCount: 0,
    isComplete: false,
    isSubscribed: false,
    isWorking: false,
    progress: 0,
    totalCount: 0,
};

/**
 * État agrégé d'un objet téléchargé : combien de ses titres sont sur le disque,
 * de quoi alimenter un bouton à trois états (absent / en cours / téléchargé).
 */
export const useOfflineSubscriptionState = (
    serverId: string | undefined,
    kind: OfflineSubscriptionKind,
    itemId: null | string | undefined,
): OfflineSubscriptionState => {
    const subKey = serverId && itemId ? subscriptionKey(serverId, kind, itemId) : null;

    const subscription = useOfflineStoreBase((s) => (subKey ? s.subscriptions[subKey] : undefined));
    const entries = useOfflineStoreBase((s) => s.entries);

    return useMemo(() => {
        if (!subscription) return EMPTY_STATE;

        let doneCount = 0;
        let errorCount = 0;

        for (const key of subscription.songKeys) {
            const entry = entries[key];
            if (!entry) continue;
            if (entry.status === 'done') doneCount += 1;
            else if (entry.status === 'error') errorCount += 1;
        }

        const totalCount = subscription.songKeys.length;
        const isSyncing = subscription.syncStatus === 'syncing';
        // Tant que la première synchro n'a pas eu lieu, l'abonnement est "en cours"
        // même s'il n'a encore aucun titre à afficher.
        const isSettled =
            subscription.lastSyncedAt !== null &&
            !isSyncing &&
            doneCount + errorCount >= totalCount;

        return {
            doneCount,
            errorCount,
            // Des titres en échec : terminé, mais pas "complet"
            isComplete: isSettled && errorCount === 0,
            isSubscribed: true,
            isWorking: !isSettled,
            progress: totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
            totalCount,
        };
    }, [entries, subscription]);
};
