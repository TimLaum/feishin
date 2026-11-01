import { MouseEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import styles from './offline-home.module.css';

import {
    OfflineEntry,
    OfflineSubscription,
    useOfflineStoreBase,
    useServerUnreachable,
} from '/@/renderer/features/offline/store/offline-store';
import {
    collectionName,
    collectionPath,
    sortCollections,
    subscriptionCoverSrc,
    subscriptionEntries,
} from '/@/renderer/features/offline/utils';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { useCurrentServerId } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';
import { Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const doneSongsOf = (subscription: OfflineSubscription, entries: Record<string, OfflineEntry>) =>
    subscriptionEntries(subscription, entries)
        .filter((entry) => entry.status === 'done')
        .map((entry) => entry.song);

interface CollectionCardProps {
    entries: Record<string, OfflineEntry>;
    onOpen: (subscription: OfflineSubscription) => void;
    onPlay: (songs: Song[], play: Play) => void;
    subscription: OfflineSubscription;
}

const CollectionCard = ({ entries, onOpen, onPlay, subscription }: CollectionCardProps) => {
    const { t } = useTranslation();
    const songs = useMemo(() => doneSongsOf(subscription, entries), [entries, subscription]);
    const coverSrc = subscriptionCoverSrc(subscription, entries);

    const handlePlay = (event: MouseEvent) => {
        event.stopPropagation();
        onPlay(songs, Play.NOW);
    };

    return (
        <div className={styles.card} onClick={() => onOpen(subscription)}>
            <div className={styles.cover}>
                {coverSrc ? (
                    <img alt="" loading="lazy" src={coverSrc} />
                ) : (
                    <Center h="100%">
                        <Icon icon={subscription.kind === 'favorites' ? 'favorite' : 'playlist'} />
                    </Center>
                )}
                {songs.length > 0 && (
                    <div className={styles.play}>
                        <ActionIcon
                            icon="mediaPlay"
                            onClick={handlePlay}
                            radius="xl"
                            size="lg"
                            variant="filled"
                        />
                    </div>
                )}
            </div>
            <Text className={styles.ellipsis} fw={500}>
                {collectionName(subscription)}
            </Text>
            <Text className={styles.ellipsis} isMuted size="sm">
                {t(`page.offline.kind_${subscription.kind}`)} ·{' '}
                {t('page.offline.trackCount', { count: songs.length })}
            </Text>
        </div>
    );
};

/**
 * Accueil hors connexion, façon Spotify : uniquement ce qui est téléchargé
 * (favoris, playlists, albums). Un clic ouvre la collection (vue locale),
 * le bouton lecture lance ses titres.
 */
export const OfflineHome = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const serverId = useCurrentServerId();
    const serverUnreachable = useServerUnreachable();
    const { addToQueueByData } = usePlayer();
    const entries = useOfflineStoreBase((s) => s.entries);
    const subscriptions = useOfflineStoreBase((s) => s.subscriptions);

    const collections = useMemo(
        () => sortCollections(Object.values(subscriptions).filter((s) => s.serverId === serverId)),
        [serverId, subscriptions],
    );

    const allSongs = useMemo(() => {
        const seen = new Set<string>();
        return collections
            .flatMap((subscription) => doneSongsOf(subscription, entries))
            .filter((song) => !seen.has(song.id) && Boolean(seen.add(song.id)));
    }, [collections, entries]);

    const handlePlay = useCallback(
        (songs: Song[], play: Play) => {
            if (songs.length > 0) addToQueueByData(songs, play);
        },
        [addToQueueByData],
    );

    const handleOpen = useCallback(
        (subscription: OfflineSubscription) => navigate(collectionPath(subscription)),
        [navigate],
    );

    return (
        <Stack gap="lg">
            <Group gap="md">
                <TextTitle order={2}>{t('page.offline.yourDownloads')}</TextTitle>
                <Badge color="yellow" variant="light">
                    {serverUnreachable
                        ? t('page.offline.serverUnreachable')
                        : t('page.offline.offline')}
                </Badge>
                <Button
                    disabled={allSongs.length === 0}
                    leftSection={<Icon icon="mediaShuffle" />}
                    onClick={() => handlePlay(allSongs, Play.SHUFFLE)}
                    variant="filled"
                >
                    {t('page.offline.shuffleAll')}
                </Button>
            </Group>

            {collections.length === 0 ? (
                <Text isMuted>{t('page.offline.emptyOffline')}</Text>
            ) : (
                <div className={styles.grid}>
                    {collections.map((subscription) => (
                        <CollectionCard
                            entries={entries}
                            key={`${subscription.kind}/${subscription.itemId}`}
                            onOpen={handleOpen}
                            onPlay={handlePlay}
                            subscription={subscription}
                        />
                    ))}
                </div>
            )}
        </Stack>
    );
};
