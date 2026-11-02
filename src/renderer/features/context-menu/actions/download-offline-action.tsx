import isElectron from 'is-electron';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmUnsubscribe } from '/@/renderer/features/offline/components/offline-download-toggle';
import {
    offlineActions,
    OfflineSubscriptionKind,
    subscriptionKey,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';
import { useCurrentServerId } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem } from '/@/shared/types/domain-types';

interface DownloadOfflineActionProps {
    ids: string[];
    // Albums et playlists visés : le nom sert à l'affichage de l'abonnement
    items?: Array<{ id: string; name: string }>;
    itemType: LibraryItem;
}

const SUBSCRIPTION_KINDS: Partial<Record<LibraryItem, OfflineSubscriptionKind>> = {
    [LibraryItem.ALBUM]: 'album',
    [LibraryItem.PLAYLIST]: 'playlist',
};

/**
 * Album ou playlist : crée un abonnement, que le moteur de synchro re-résout
 * (les titres ajoutés plus tard sont téléchargés automatiquement). Comme sur
 * Spotify, on ne télécharge pas de titre isolé : on télécharge la collection.
 */
export const DownloadOfflineAction = ({ ids, items, itemType }: DownloadOfflineActionProps) => {
    const { t } = useTranslation();
    const serverId = useCurrentServerId();
    const subscriptions = useOfflineStoreBase((s) => s.subscriptions);

    const kind = SUBSCRIPTION_KINDS[itemType];

    const isSubscribed = useMemo(() => {
        if (!kind || ids.length === 0) return false;
        return ids.every((id) => Boolean(subscriptions[subscriptionKey(serverId, kind, id)]));
    }, [ids, kind, serverId, subscriptions]);

    const onSelect = useCallback(() => {
        if (!kind) return;
        if (isSubscribed) {
            confirmUnsubscribe(
                ids.map((id) => subscriptionKey(serverId, kind, id)),
                () =>
                    toast.success({
                        message: t('page.offline.collectionRemoved', { count: ids.length }),
                    }),
            );
            return;
        }

        const { subscribe } = offlineActions();

        const nameById = new Map(items?.map((item) => [item.id, item.name]));
        for (const id of ids) {
            subscribe({ itemId: id, kind, name: nameById.get(id) ?? '', serverId });
        }
        toast.success({ message: t('page.offline.collectionAdded', { count: ids.length }) });
    }, [ids, isSubscribed, items, kind, serverId, t]);

    if (!isElectron() || !kind) {
        return null;
    }

    return (
        <ContextMenu.Item leftIcon={isSubscribed ? 'check' : 'arrowDownToLine'} onSelect={onSelect}>
            {isSubscribed
                ? t('page.contextMenu.removeOffline')
                : t('page.contextMenu.downloadOffline')}
        </ContextMenu.Item>
    );
};
