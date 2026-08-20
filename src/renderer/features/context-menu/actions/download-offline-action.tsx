import { useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineStoreBase } from '/@/renderer/features/offline/store/offline-store';
import { fetchSongsByItemType } from '/@/renderer/features/player/context/player-context';
import { useCurrentServerId } from '/@/renderer/store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { toast } from '/@/shared/components/toast/toast';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface DownloadOfflineActionProps {
    ids: string[];
    itemType: LibraryItem;
    // Fourni pour les menus de morceaux : évite un aller-retour serveur
    songs?: Song[];
}

export const DownloadOfflineAction = ({ ids, itemType, songs }: DownloadOfflineActionProps) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const serverId = useCurrentServerId();
    const enqueue = useOfflineStoreBase((s) => s.enqueue);

    const onSelect = useCallback(async () => {
        try {
            let list: Song[];

            if (songs && songs.length > 0) {
                list = songs;
            } else {
                list = await fetchSongsByItemType(queryClient, serverId, {
                    id: ids,
                    itemType,
                });
            }

            if (list.length === 0) {
                toast.info({ message: t('page.offline.nothingToDownload') });
                return;
            }

            const added = enqueue(list);
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
    }, [enqueue, ids, itemType, queryClient, serverId, songs, t]);

    if (!isElectron()) {
        return null;
    }

    return (
        <ContextMenu.Item leftIcon="arrowDownToLine" onSelect={onSelect}>
            {t('page.contextMenu.downloadOffline')}
        </ContextMenu.Item>
    );
};
