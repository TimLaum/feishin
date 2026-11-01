import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { OfflineSongRow } from '/@/renderer/features/offline/components/offline-song-row';
import {
    offlineActions,
    OfflineSubscription,
    subscriptionKey,
    useOfflineEntries,
} from '/@/renderer/features/offline/store/offline-store';
import {
    collectionName,
    formatBytes,
    subscriptionCoverSrc,
    subscriptionEntries,
} from '/@/renderer/features/offline/utils';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';
import { Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

interface OfflineCollectionDetailProps {
    subscription: OfflineSubscription;
}

/**
 * Vue d'une collection téléchargée rendue entièrement depuis le store : elle
 * remplace la page serveur quand on est hors connexion, pour qu'une playlist
 * téléchargée reste consultable et jouable depuis son adresse habituelle.
 */
export const OfflineCollectionDetail = ({ subscription }: OfflineCollectionDetailProps) => {
    const { t } = useTranslation();
    const entries = useOfflineEntries();
    const { addToQueueByData } = usePlayer();

    const rows = useMemo(() => {
        return subscription.songKeys
            .map((key) => ({ entry: entries[key], key }))
            .filter((row) => Boolean(row.entry));
    }, [entries, subscription.songKeys]);

    const doneSongs = useMemo(
        () => rows.filter((row) => row.entry.status === 'done').map((row) => row.entry.song),
        [rows],
    );

    const totalSize = useMemo(
        () => subscriptionEntries(subscription, entries).reduce((sum, e) => sum + (e.size || 0), 0),
        [entries, subscription],
    );

    const coverSrc = useMemo(
        () => subscriptionCoverSrc(subscription, entries),
        [entries, subscription],
    );

    const handlePlay = useCallback(
        (play: Play) => {
            if (doneSongs.length === 0) return;
            addToQueueByData(doneSongs, play);
        },
        [addToQueueByData, doneSongs],
    );

    // Ref : un callback stable garde les lignes mémoïsées malgré la progression
    const doneSongsRef = useRef(doneSongs);
    doneSongsRef.current = doneSongs;

    const handlePlaySong = useCallback(
        (song: Song) => {
            addToQueueByData(doneSongsRef.current, Play.NOW, song.id);
        },
        [addToQueueByData],
    );

    const handleRemove = useCallback(() => {
        offlineActions().unsubscribe(
            subscriptionKey(subscription.serverId, subscription.kind, subscription.itemId),
        );
    }, [subscription]);

    return (
        <AnimatedPage>
            <Stack gap={0} style={{ height: '100%' }}>
                <Group align="flex-end" gap="lg" p="lg" wrap="nowrap">
                    <div
                        style={{
                            background: 'var(--theme-colors-surface)',
                            borderRadius: 8,
                            flexShrink: 0,
                            height: 160,
                            overflow: 'hidden',
                            width: 160,
                        }}
                    >
                        {coverSrc ? (
                            <img
                                alt=""
                                src={coverSrc}
                                style={{ height: '100%', objectFit: 'cover', width: '100%' }}
                            />
                        ) : (
                            <Center h="100%" w="100%">
                                <Text isMuted>-</Text>
                            </Center>
                        )}
                    </div>

                    <Stack gap="sm" style={{ minWidth: 0 }}>
                        <Text isMuted size="sm" tt="uppercase">
                            {t(`page.offline.kind_${subscription.kind}`)} ·{' '}
                            {t('page.offline.downloaded')}
                        </Text>
                        <TextTitle order={1}>{collectionName(subscription)}</TextTitle>
                        <Text isMuted size="sm">
                            {t('page.offline.trackCount', { count: doneSongs.length })} ·{' '}
                            {formatBytes(totalSize)}
                        </Text>
                        <Group gap="sm">
                            <Button
                                disabled={doneSongs.length === 0}
                                onClick={() => handlePlay(Play.NOW)}
                                variant="filled"
                            >
                                {t('page.offline.playAll')}
                            </Button>
                            <Button
                                disabled={doneSongs.length === 0}
                                onClick={() => handlePlay(Play.SHUFFLE)}
                                variant="default"
                            >
                                {t('page.offline.shuffleAll')}
                            </Button>
                            <Button onClick={handleRemove} variant="subtle">
                                {t('page.contextMenu.removeOffline')}
                            </Button>
                        </Group>
                    </Stack>
                </Group>

                <ScrollArea style={{ flex: 1, minHeight: 0 }}>
                    {rows.map((row) => (
                        <OfflineSongRow
                            entry={row.entry}
                            entryKey={row.key}
                            key={row.key}
                            onPlay={handlePlaySong}
                        />
                    ))}
                </ScrollArea>
            </Stack>
        </AnimatedPage>
    );
};
