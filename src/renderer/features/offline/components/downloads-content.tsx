import { Progress } from '@mantine/core';
import { closeAllModals, openModal } from '@mantine/modals';
import isElectron from 'is-electron';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    OfflineEntry,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';
import { Song } from '/@/shared/types/domain-types';
import { Play } from '/@/shared/types/types';

const offlineApi = isElectron() ? window.api.offlineDownloads : null;

const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const useIsOnline = (): boolean => {
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
};

// ── Row ────────────────────────────────────────────────────────────────────

interface DownloadRowProps {
    entry: OfflineEntry;
    entryKey: string;
    onPlay: (song: Song) => void;
    onRemove: (entryKey: string, entry: OfflineEntry) => void;
    onRetry: (entryKey: string) => void;
}

const DownloadRow = ({ entry, entryKey, onPlay, onRemove, onRetry }: DownloadRowProps) => {
    const { t } = useTranslation();
    const { song } = entry;

    const coverSrc = entry.coverRelPath
        ? `feishin://offline/${encodeURI(entry.coverRelPath)}`
        : (song.imageUrl ?? undefined);

    return (
        <Group
            gap="md"
            style={{
                borderBottom: '1px solid var(--theme-colors-border)',
                padding: '10px 16px',
            }}
            wrap="nowrap"
        >
            <div
                style={{
                    background: 'var(--theme-colors-surface)',
                    borderRadius: 4,
                    flexShrink: 0,
                    height: 48,
                    overflow: 'hidden',
                    width: 48,
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
                        <Text isMuted size="xs">
                            —
                        </Text>
                    </Center>
                )}
            </div>

            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text
                    fw={500}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {song.name}
                </Text>
                <Text
                    isMuted
                    size="xs"
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {song.artistName}
                    {song.album ? ` — ${song.album}` : ''}
                </Text>
            </Stack>

            {entry.status === 'done' && (
                <Text isMuted size="xs" style={{ flexShrink: 0 }}>
                    {formatBytes(entry.size)}
                </Text>
            )}

            <div style={{ flexShrink: 0, minWidth: 150, textAlign: 'right' }}>
                {entry.status === 'queued' && (
                    <Badge size="sm" variant="light">
                        Queued
                    </Badge>
                )}

                {entry.status === 'downloading' && (
                    <Stack gap={4} style={{ minWidth: 150 }}>
                        <Text isMuted size="xs">
                            {entry.progress > 0 ? `${entry.progress}%` : 'Downloading…'}
                        </Text>
                        <Progress animated size="xs" value={entry.progress} />
                    </Stack>
                )}

                {entry.status === 'error' && (
                    <Group gap={6} justify="flex-end" wrap="nowrap">
                        <Text
                            size="xs"
                            style={{
                                color: 'var(--mantine-color-red-6)',
                                maxWidth: 180,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                            title={entry.error ?? undefined}
                        >
                            {entry.error}
                        </Text>
                        <Button onClick={() => onRetry(entryKey)} size="xs" variant="default">
                            {t('page.offline.retry')}
                        </Button>
                    </Group>
                )}

                {entry.status === 'done' && (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                        <ActionIcon
                            icon="mediaPlay"
                            onClick={() => onPlay(song)}
                            size="sm"
                            tooltip={{ label: t('player.play'), openDelay: 0 }}
                            variant="subtle"
                        />
                        <ActionIcon
                            icon="delete"
                            onClick={() => onRemove(entryKey, entry)}
                            size="sm"
                            tooltip={{ label: t('page.offline.remove'), openDelay: 0 }}
                            variant="subtle"
                        />
                    </Group>
                )}
            </div>
        </Group>
    );
};

// ── Content ────────────────────────────────────────────────────────────────

export const DownloadsContent = () => {
    const { t } = useTranslation();
    const entries = useOfflineStoreBase((s) => s.entries);
    const removeEntries = useOfflineStoreBase((s) => s.remove);
    const requeue = useOfflineStoreBase((s) => s.requeue);
    const { addToQueueByData } = usePlayer();
    const isOnline = useIsOnline();
    const [filter, setFilter] = useState('');

    const sorted = useMemo(() => {
        const list = Object.entries(entries);
        const query = filter.trim().toLowerCase();
        const filtered = query
            ? list.filter(
                  ([, e]) =>
                      e.song.name.toLowerCase().includes(query) ||
                      e.song.artistName.toLowerCase().includes(query) ||
                      (e.song.album ?? '').toLowerCase().includes(query),
              )
            : list;
        return filtered.sort(([, a], [, b]) => b.addedAt - a.addedAt);
    }, [entries, filter]);

    const doneSongs = useMemo(
        () =>
            Object.values(entries)
                .filter((e) => e.status === 'done')
                .sort((a, b) => a.addedAt - b.addedAt)
                .map((e) => e.song),
        [entries],
    );

    const totalSize = useMemo(
        () => Object.values(entries).reduce((acc, e) => acc + (e.size || 0), 0),
        [entries],
    );

    const handlePlayAll = useCallback(() => {
        if (doneSongs.length === 0) return;
        addToQueueByData(doneSongs, Play.NOW);
    }, [addToQueueByData, doneSongs]);

    const handleShuffleAll = useCallback(() => {
        if (doneSongs.length === 0) return;
        addToQueueByData(doneSongs, Play.SHUFFLE);
    }, [addToQueueByData, doneSongs]);

    const handlePlaySong = useCallback(
        (song: Song) => {
            addToQueueByData(doneSongs, Play.NOW, song.id);
        },
        [addToQueueByData, doneSongs],
    );

    const handleRemove = useCallback(
        async (entryKey: string, entry: OfflineEntry) => {
            removeEntries([entryKey]);
            const relPaths = [entry.relPath, entry.coverRelPath].filter(Boolean) as string[];
            if (relPaths.length > 0) {
                await offlineApi?.remove(relPaths).catch(() => {});
            }
        },
        [removeEntries],
    );

    const handleRetry = useCallback(
        (entryKey: string) => {
            requeue(entryKey);
        },
        [requeue],
    );

    const handleClearAll = useCallback(() => {
        openModal({
            children: (
                <ConfirmModal
                    labels={{ cancel: t('common.cancel'), confirm: t('common.confirm') }}
                    onCancel={() => closeAllModals()}
                    onConfirm={async () => {
                        closeAllModals();
                        const all = useOfflineStoreBase.getState().entries;
                        const keys = Object.keys(all);
                        const relPaths = Object.values(all)
                            .flatMap((e) => [e.relPath, e.coverRelPath])
                            .filter(Boolean) as string[];
                        useOfflineStoreBase.getState().remove(keys);
                        if (relPaths.length > 0) {
                            await offlineApi?.remove(relPaths).catch(() => {});
                        }
                    }}
                >
                    <Text>{t('page.offline.clearAllConfirm')}</Text>
                </ConfirmModal>
            ),
            title: t('page.offline.clearAll'),
        });
    }, [t]);

    const entryCount = Object.keys(entries).length;

    return (
        <Stack gap={0} style={{ height: '100%' }}>
            {/* Header */}
            <div
                style={{
                    borderBottom: '1px solid var(--theme-colors-border)',
                    padding: '16px 20px',
                }}
            >
                <Group align="center" gap="md" mb="sm">
                    <TextTitle order={3}>{t('page.offline.title')}</TextTitle>
                    <Badge color={isOnline ? 'green' : 'yellow'} size="sm" variant="light">
                        {isOnline ? t('page.offline.online') : t('page.offline.offline')}
                    </Badge>
                    {entryCount > 0 && (
                        <Text isMuted size="sm">
                            {doneSongs.length}/{entryCount} · {formatBytes(totalSize)}
                        </Text>
                    )}
                </Group>
                <Group gap="sm">
                    <TextInput
                        onChange={(e) => setFilter(e.currentTarget.value)}
                        placeholder={t('common.search', { postProcess: 'sentenceCase' })}
                        style={{ flex: 1, maxWidth: 400 }}
                        value={filter}
                    />
                    <Button
                        disabled={doneSongs.length === 0}
                        onClick={handlePlayAll}
                        variant="filled"
                    >
                        {t('page.offline.playAll')}
                    </Button>
                    <Button
                        disabled={doneSongs.length === 0}
                        onClick={handleShuffleAll}
                        variant="default"
                    >
                        {t('page.offline.shuffleAll')}
                    </Button>
                    <Button onClick={() => offlineApi?.openFolder()} variant="default">
                        {t('page.offline.openFolder')}
                    </Button>
                    <Button disabled={entryCount === 0} onClick={handleClearAll} variant="default">
                        {t('page.offline.clearAll')}
                    </Button>
                </Group>
            </div>

            {/* List */}
            <ScrollArea style={{ flex: 1 }}>
                {sorted.length === 0 && (
                    <Center h={200} px="xl">
                        <Text isMuted style={{ textAlign: 'center' }}>
                            {t('page.offline.empty')}
                        </Text>
                    </Center>
                )}
                <Stack gap={0}>
                    {sorted.map(([key, entry]) => (
                        <DownloadRow
                            entry={entry}
                            entryKey={key}
                            key={key}
                            onPlay={handlePlaySong}
                            onRemove={handleRemove}
                            onRetry={handleRetry}
                        />
                    ))}
                </Stack>
            </ScrollArea>
        </Stack>
    );
};
