import { Progress } from '@mantine/core';
import { closeAllModals, openModal } from '@mantine/modals';
import isElectron from 'is-electron';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate } from 'react-router';

import { OfflineSongRow } from '/@/renderer/features/offline/components/offline-song-row';
import { useIsNetworkOffline } from '/@/renderer/features/offline/hooks/use-is-offline';
import {
    MANUAL_REF,
    OfflineEntry,
    OfflineSubscription,
    subscriptionKey,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';
import {
    formatBytes,
    subscriptionCoverSrc,
    subscriptionEntries,
} from '/@/renderer/features/offline/utils';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { AppRoute } from '/@/renderer/router/routes';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Select } from '/@/shared/components/select/select';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const offlineApi = isElectron() ? window.api.offlineDownloads : null;

const GIGABYTE = 1024 ** 3;

const ELLIPSIS = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

const collectionPath = (subscription: OfflineSubscription): null | string => {
    switch (subscription.kind) {
        case 'album':
            return generatePath(AppRoute.LIBRARY_ALBUMS_DETAIL, { albumId: subscription.itemId });
        case 'favorites':
            return AppRoute.FAVORITES;
        case 'playlist':
            return generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, {
                playlistId: subscription.itemId,
            });
        default:
            return null;
    }
};

// ── Ligne de collection ────────────────────────────────────────────────────

interface CollectionRowProps {
    entries: Record<string, OfflineEntry>;
    onOpen: (subscription: OfflineSubscription) => void;
    onPlay: (songs: Song[], play: Play) => void;
    onRemove: (subscription: OfflineSubscription) => void;
    subscription: OfflineSubscription;
}

const CollectionRow = ({ entries, onOpen, onPlay, onRemove, subscription }: CollectionRowProps) => {
    const { t } = useTranslation();

    const rows = useMemo(() => subscriptionEntries(subscription, entries), [entries, subscription]);
    const doneSongs = useMemo(
        () => rows.filter((entry) => entry.status === 'done').map((entry) => entry.song),
        [rows],
    );

    const totalSize = rows.reduce((sum, entry) => sum + (entry.size || 0), 0);
    const totalCount = subscription.songKeys.length;
    const progress = totalCount > 0 ? Math.round((doneSongs.length / totalCount) * 100) : 0;
    const isSyncing = subscription.syncStatus === 'syncing';
    const isWorking =
        isSyncing || subscription.lastSyncedAt === null || doneSongs.length < totalCount;

    const coverSrc = subscriptionCoverSrc(subscription, entries);

    return (
        <Group
            gap="md"
            style={{
                borderBottom: '1px solid var(--theme-colors-border)',
                padding: '12px 16px',
            }}
            wrap="nowrap"
        >
            <div
                style={{
                    background: 'var(--theme-colors-surface)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    flexShrink: 0,
                    height: 56,
                    overflow: 'hidden',
                    width: 56,
                }}
            >
                {coverSrc ? (
                    <img
                        alt=""
                        onClick={() => onOpen(subscription)}
                        src={coverSrc}
                        style={{ height: '100%', objectFit: 'cover', width: '100%' }}
                    />
                ) : (
                    <Center h="100%" w="100%">
                        <Text isMuted size="xs">
                            —
                        </Text>
                    </Center>
                )}
            </div>

            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" wrap="nowrap">
                    <Text
                        fw={500}
                        isLink
                        onClick={() => onOpen(subscription)}
                        style={{ ...ELLIPSIS, cursor: 'pointer' }}
                    >
                        {subscription.name || subscription.itemId}
                    </Text>
                    <Badge size="xs" variant="light">
                        {t(`page.offline.kind_${subscription.kind}`)}
                    </Badge>
                    {subscription.syncStatus === 'error' && (
                        <Badge color="red" size="xs" variant="light">
                            {t('page.offline.syncError')}
                        </Badge>
                    )}
                </Group>
                <Text isMuted size="xs">
                    {doneSongs.length}/{totalCount} · {formatBytes(totalSize)}
                    {isSyncing ? ` · ${t('page.offline.syncing')}` : ''}
                </Text>
                {isWorking && totalCount > 0 && <Progress animated size="xs" value={progress} />}
            </Stack>

            <Group gap={4} justify="flex-end" style={{ flexShrink: 0 }} wrap="nowrap">
                <ActionIcon
                    disabled={doneSongs.length === 0}
                    icon="mediaPlay"
                    onClick={() => onPlay(doneSongs, Play.NOW)}
                    size="sm"
                    tooltip={{ label: t('page.offline.playAll'), openDelay: 0 }}
                    variant="subtle"
                />
                <ActionIcon
                    disabled={doneSongs.length === 0}
                    icon="mediaShuffle"
                    onClick={() => onPlay(doneSongs, Play.SHUFFLE)}
                    size="sm"
                    tooltip={{ label: t('page.offline.shuffleAll'), openDelay: 0 }}
                    variant="subtle"
                />
                <ActionIcon
                    icon="delete"
                    onClick={() => onRemove(subscription)}
                    size="sm"
                    tooltip={{ label: t('page.contextMenu.removeOffline'), openDelay: 0 }}
                    variant="subtle"
                />
            </Group>
        </Group>
    );
};

// ── Réglages ───────────────────────────────────────────────────────────────

const DownloadSettings = () => {
    const { t } = useTranslation();
    const settings = useOfflineStoreBase((s) => s.settings);
    const setSettings = useOfflineStoreBase((s) => s.setSettings);

    return (
        <Group align="flex-end" gap="sm" wrap="wrap">
            <Select
                data={[
                    { label: t('page.offline.downloadQuality_original'), value: 'original' },
                    {
                        label: t('page.offline.downloadQuality_transcoded', {
                            bitrate: settings.bitrate,
                            format: settings.format,
                        }),
                        value: 'transcoded',
                    },
                ]}
                label={t('page.offline.downloadQuality')}
                onChange={(value) =>
                    value && setSettings({ quality: value as 'original' | 'transcoded' })
                }
                value={settings.quality}
                width={260}
            />
            {settings.quality === 'transcoded' && (
                <>
                    <Select
                        data={['128', '192', '256', '320'].map((value) => ({
                            label: `${value} kbps`,
                            value,
                        }))}
                        onChange={(value) => value && setSettings({ bitrate: Number(value) })}
                        value={String(settings.bitrate)}
                        width={120}
                    />
                    <Select
                        data={['mp3', 'opus', 'aac'].map((value) => ({ label: value, value }))}
                        onChange={(value) => value && setSettings({ format: value })}
                        value={settings.format}
                        width={100}
                    />
                </>
            )}
            <Select
                data={[
                    { label: t('page.offline.maxSize_unlimited'), value: '0' },
                    ...[5, 10, 20, 50, 100].map((gb) => ({
                        label: `${gb} GB`,
                        value: String(gb * GIGABYTE),
                    })),
                ]}
                label={t('page.offline.maxSize')}
                onChange={(value) => value && setSettings({ maxSizeBytes: Number(value) })}
                value={String(settings.maxSizeBytes)}
                width={160}
            />
        </Group>
    );
};

// ── Page ───────────────────────────────────────────────────────────────────

export const DownloadsContent = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { addToQueueByData } = usePlayer();

    const entries = useOfflineStoreBase((s) => s.entries);
    const subscriptions = useOfflineStoreBase((s) => s.subscriptions);
    const offlineMode = useOfflineStoreBase((s) => s.offlineMode);
    const setOfflineMode = useOfflineStoreBase((s) => s.setOfflineMode);
    const removeEntries = useOfflineStoreBase((s) => s.remove);
    const removeAll = useOfflineStoreBase((s) => s.removeAll);
    const requeue = useOfflineStoreBase((s) => s.requeue);
    const unsubscribe = useOfflineStoreBase((s) => s.unsubscribe);

    const isNetworkOffline = useIsNetworkOffline();
    const [filter, setFilter] = useState('');
    const [showSettings, setShowSettings] = useState(false);

    const query = filter.trim().toLowerCase();

    const collections = useMemo(() => {
        const list = Object.values(subscriptions).sort((a, b) => b.addedAt - a.addedAt);
        if (!query) return list;
        return list.filter((subscription) => subscription.name.toLowerCase().includes(query));
    }, [query, subscriptions]);

    // Titres pris à l'unité : tout ce qui porte la référence manuelle
    const singles = useMemo(() => {
        const list = Object.entries(entries).filter(([, entry]) => entry.refs.includes(MANUAL_REF));
        const filtered = query
            ? list.filter(
                  ([, entry]) =>
                      entry.song.name.toLowerCase().includes(query) ||
                      entry.song.artistName.toLowerCase().includes(query) ||
                      (entry.song.album ?? '').toLowerCase().includes(query),
              )
            : list;
        return filtered.sort(([, a], [, b]) => b.addedAt - a.addedAt);
    }, [entries, query]);

    const doneSongs = useMemo(
        () =>
            Object.values(entries)
                .filter((entry) => entry.status === 'done')
                .sort((a, b) => a.addedAt - b.addedAt)
                .map((entry) => entry.song),
        [entries],
    );

    const totalSize = useMemo(
        () => Object.values(entries).reduce((sum, entry) => sum + (entry.size || 0), 0),
        [entries],
    );

    const entryCount = Object.keys(entries).length;

    const handlePlayList = useCallback(
        (songs: Song[], play: Play) => {
            if (songs.length === 0) return;
            addToQueueByData(songs, play);
        },
        [addToQueueByData],
    );

    const handlePlaySong = useCallback(
        (song: Song) => {
            addToQueueByData(doneSongs, Play.NOW, song.id);
        },
        [addToQueueByData, doneSongs],
    );

    const handleOpenCollection = useCallback(
        (subscription: OfflineSubscription) => {
            const path = collectionPath(subscription);
            if (path) navigate(path);
        },
        [navigate],
    );

    const handleRemoveCollection = useCallback(
        (subscription: OfflineSubscription) => {
            unsubscribe(
                subscriptionKey(subscription.serverId, subscription.kind, subscription.itemId),
            );
        },
        [unsubscribe],
    );

    // La suppression disque est centralisée dans le manager (file pendingDeletions) :
    // un titre réclamé par un abonnement n'est pas effacé, la collection reste entière.
    const handleRemoveSong = useCallback(
        (entryKey: string) => {
            const { kept } = removeEntries([entryKey]);
            if (kept > 0) {
                toast.info({ message: t('page.offline.keptByCollection', { count: kept }) });
            }
        },
        [removeEntries, t],
    );

    const handleClearAll = useCallback(() => {
        openModal({
            children: (
                <ConfirmModal
                    labels={{ cancel: t('common.cancel'), confirm: t('common.confirm') }}
                    onCancel={() => closeAllModals()}
                    onConfirm={() => {
                        closeAllModals();
                        removeAll();
                    }}
                >
                    <Text>{t('page.offline.clearAllConfirm')}</Text>
                </ConfirmModal>
            ),
            title: t('page.offline.clearAll'),
        });
    }, [removeAll, t]);

    return (
        <Stack gap={0} style={{ height: '100%' }}>
            <div
                style={{
                    borderBottom: '1px solid var(--theme-colors-border)',
                    padding: '16px',
                }}
            >
                <Group align="center" gap="md" mb="sm">
                    <TextTitle order={3}>{t('page.offline.title')}</TextTitle>
                    <Badge color={isNetworkOffline ? 'yellow' : 'green'} size="sm" variant="light">
                        {isNetworkOffline ? t('page.offline.offline') : t('page.offline.online')}
                    </Badge>
                    {entryCount > 0 && (
                        <Text isMuted size="sm">
                            {doneSongs.length}/{entryCount} ·{' '}
                            {t('page.offline.storageUsed', { size: formatBytes(totalSize) })}
                        </Text>
                    )}
                    <Switch
                        aria-label={t('page.offline.offlineMode')}
                        checked={offlineMode}
                        label={t('page.offline.offlineMode')}
                        onChange={(event) => setOfflineMode(event.currentTarget.checked)}
                    />
                </Group>

                <Group gap="sm">
                    <TextInput
                        onChange={(event) => setFilter(event.currentTarget.value)}
                        placeholder={t('common.search', { postProcess: 'sentenceCase' })}
                        style={{ flex: 1, maxWidth: 400 }}
                        value={filter}
                    />
                    <Button
                        disabled={doneSongs.length === 0}
                        onClick={() => handlePlayList(doneSongs, Play.NOW)}
                        variant="filled"
                    >
                        {t('page.offline.playAll')}
                    </Button>
                    <Button
                        disabled={doneSongs.length === 0}
                        onClick={() => handlePlayList(doneSongs, Play.SHUFFLE)}
                        variant="default"
                    >
                        {t('page.offline.shuffleAll')}
                    </Button>
                    <Button onClick={() => setShowSettings((value) => !value)} variant="default">
                        {t('page.offline.settings')}
                    </Button>
                    <Button onClick={() => offlineApi?.openFolder()} variant="default">
                        {t('page.offline.openFolder')}
                    </Button>
                    <Button disabled={entryCount === 0} onClick={handleClearAll} variant="default">
                        {t('page.offline.clearAll')}
                    </Button>
                </Group>

                {showSettings && (
                    <div style={{ marginTop: 12 }}>
                        <DownloadSettings />
                    </div>
                )}
            </div>

            <ScrollArea style={{ flex: 1 }}>
                {collections.length === 0 && singles.length === 0 && (
                    <Center h={200} px="xl">
                        <Text isMuted style={{ textAlign: 'center' }}>
                            {t('page.offline.empty')}
                        </Text>
                    </Center>
                )}

                {collections.length > 0 && (
                    <>
                        <Text fw={600} isMuted px="md" py="sm" size="sm" tt="uppercase">
                            {t('page.offline.collections')}
                        </Text>
                        <Stack gap={0}>
                            {collections.map((subscription) => (
                                <CollectionRow
                                    entries={entries}
                                    key={subscriptionKey(
                                        subscription.serverId,
                                        subscription.kind,
                                        subscription.itemId,
                                    )}
                                    onOpen={handleOpenCollection}
                                    onPlay={handlePlayList}
                                    onRemove={handleRemoveCollection}
                                    subscription={subscription}
                                />
                            ))}
                        </Stack>
                    </>
                )}

                {singles.length > 0 && (
                    <>
                        <Text fw={600} isMuted px="md" py="sm" size="sm" tt="uppercase">
                            {t('page.offline.individualSongs')}
                        </Text>
                        <Stack gap={0}>
                            {singles.map(([key, entry]) => (
                                <OfflineSongRow
                                    entry={entry}
                                    entryKey={key}
                                    key={key}
                                    onPlay={handlePlaySong}
                                    onRemove={handleRemoveSong}
                                    onRetry={requeue}
                                />
                            ))}
                        </Stack>
                    </>
                )}
            </ScrollArea>
        </Stack>
    );
};
