import { useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
    offlineActions,
    OfflineSubscriptionKind,
    subscriptionKey,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';
import { fetchSongsByItemType } from '/@/renderer/features/player/context/player-context';
import { useCurrentServerId } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface DownloadOfflineActionProps {
    ids: string[];
    // Albums et playlists visés : le nom sert à l'affichage de l'abonnement
    items?: Array<{ id: string; name: string }>;
    itemType: LibraryItem;
    // Fourni pour les menus de morceaux : évite un aller-retour serveur
    songs?: Song[];
}

const SUBSCRIPTION_KINDS: Partial<Record<LibraryItem, OfflineSubscriptionKind>> = {
    [LibraryItem.ALBUM]: 'album',
    [LibraryItem.PLAYLIST]: 'playlist',
};

/**
 * Album ou playlist : crée un abonnement, que le moteur de synchro re-résout
 * (les titres ajoutés plus tard sont téléchargés automatiquement). Titres
 * isolés : téléchargement à l'unité.
 */
export const DownloadOfflineAction = ({
    ids,
    items,
    itemType,
    songs,
}: DownloadOfflineActionProps) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const serverId = useCurrentServerId();
    const subscriptions = useOfflineStoreBase((s) => s.subscriptions);

    const kind = SUBSCRIPTION_KINDS[itemType];

    const isSubscribed = useMemo(() => {
        if (!kind || ids.length === 0) return false;
        return ids.every((id) => Boolean(subscriptions[subscriptionKey(serverId, kind, id)]));
    }, [ids, kind, serverId, subscriptions]);

    const onSelect = useCallback(async () => {
        const { addManual, subscribe, unsubscribe } = offlineActions();

        try {
            if (kind) {
                if (isSubscribed) {
                    for (const id of ids) {
                        unsubscribe(subscriptionKey(serverId, kind, id));
                    }
                    toast.success({
                        message: t('page.offline.collectionRemoved', { count: ids.length }),
                    });
                    return;
                }

                const nameById = new Map(items?.map((item) => [item.id, item.name]));
                for (const id of ids) {
                    subscribe({ itemId: id, kind, name: nameById.get(id) ?? '', serverId });
                }
                toast.success({
                    message: t('page.offline.collectionAdded', { count: ids.length }),
                });
                return;
            }

            const list =
                songs && songs.length > 0
                    ? songs
                    : await fetchSongsByItemType(queryClient, serverId, { id: ids, itemType });

            if (list.length === 0) {
                toast.info({ message: t('page.offline.nothingToDownload') });
                return;
            }

            const added = addManual(list);
            if (added === 0) {
                toast.info({ message: t('page.offline.alreadyDownloaded') });
            } else {
                toast.success({
                    message: t('page.offline.addedToDownloads', { count: added }),
                });
            }
        } catch (err) {
            toast.error({
                message: err instanceof Error ? err.message : 'Failed to queue downloads',
            });
        }
    }, [ids, isSubscribed, items, itemType, kind, queryClient, serverId, songs, t]);

    if (!isElectron()) {
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
