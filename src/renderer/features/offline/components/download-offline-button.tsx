import { useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineStoreBase } from '/@/renderer/features/offline/store/offline-store';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { useCurrentServerId } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { toast } from '/@/shared/components/toast/toast';
import { Song, SongListSort, SortOrder } from '/@/shared/types/domain-types';

const PAGE_SIZE = 500;

interface DownloadOfflineButtonProps {
    // Filtres de la liste de sons à télécharger (ex. { favorite: true } + tri courant)
    listQuery: Record<string, any>;
}

/**
 * Bouton d'en-tête de liste : met en file de téléchargement hors ligne
 * tous les sons correspondant à la list query (paginée côté client).
 */
export const DownloadOfflineButton = ({ listQuery }: DownloadOfflineButtonProps) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const serverId = useCurrentServerId();
    const enqueue = useOfflineStoreBase((s) => s.enqueue);
    const [isLoading, setIsLoading] = useState(false);

    const handleDownloadAll = useCallback(async () => {
        setIsLoading(true);
        try {
            const songs: Song[] = [];
            let startIndex = 0;

            for (;;) {
                const page = await queryClient.fetchQuery({
                    ...songsQueries.list({
                        query: {
                            sortBy: SongListSort.NAME,
                            sortOrder: SortOrder.ASC,
                            ...listQuery,
                            limit: PAGE_SIZE,
                            startIndex,
                        },
                        serverId,
                    }),
                    gcTime: 0,
                    staleTime: 0,
                });

                if (page?.items) {
                    songs.push(...page.items);
                }

                if (!page?.items || page.items.length < PAGE_SIZE) {
                    break;
                }

                startIndex += PAGE_SIZE;
            }

            if (songs.length === 0) {
                toast.info({ message: t('page.offline.nothingToDownload') });
                return;
            }

            const added = enqueue(songs);
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
        } finally {
            setIsLoading(false);
        }
    }, [enqueue, listQuery, queryClient, serverId, t]);

    if (!isElectron()) {
        return null;
    }

    return (
        <ActionIcon
            icon={isLoading ? 'spinner' : 'arrowDownToLine'}
            iconProps={{ animate: isLoading ? 'spin' : undefined, size: 'lg' }}
            onClick={handleDownloadAll}
            size="md"
            tooltip={{ label: t('page.contextMenu.downloadOffline'), openDelay: 0 }}
            variant="subtle"
        />
    );
};
