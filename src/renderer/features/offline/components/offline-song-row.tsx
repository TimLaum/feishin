import { Progress } from '@mantine/core';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { OfflineEntry } from '/@/renderer/features/offline/store/offline-store';
import { entryCoverSrc, formatBytes } from '/@/renderer/features/offline/utils';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Song } from '/@/shared/types/domain-types';

interface OfflineSongRowProps {
    entry: OfflineEntry;
    entryKey: string;
    onPlay?: (song: Song) => void;
    onRemove?: (entryKey: string) => void;
    onRetry?: (entryKey: string) => void;
}

const ELLIPSIS = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

// Mémoïsé : la progression ne doit re-rendre que la ligne du titre en cours
export const OfflineSongRow = memo(
    ({ entry, entryKey, onPlay, onRemove, onRetry }: OfflineSongRowProps) => {
        const { t } = useTranslation();
        const { song } = entry;

        const coverSrc = entryCoverSrc(entry);

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
                    <Text fw={500} style={ELLIPSIS}>
                        {song.name}
                    </Text>
                    <Text isMuted size="xs" style={ELLIPSIS}>
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
                            {t('page.offline.queued')}
                        </Badge>
                    )}

                    {entry.status === 'downloading' && (
                        <Stack gap={4} style={{ minWidth: 150 }}>
                            <Text isMuted size="xs">
                                {entry.progress > 0
                                    ? `${entry.progress}%`
                                    : t('page.offline.downloadingProgress', { progress: 0 })}
                            </Text>
                            <Progress animated size="xs" value={entry.progress} />
                        </Stack>
                    )}

                    {entry.status === 'error' && (
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                            <Text isMuted size="xs" style={{ ...ELLIPSIS, maxWidth: 160 }}>
                                {entry.error}
                            </Text>
                            {onRetry && (
                                <Button onClick={() => onRetry(entryKey)} size="compact-sm">
                                    {t('page.offline.retry')}
                                </Button>
                            )}
                        </Group>
                    )}

                    {entry.status === 'done' && (
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                            {onPlay && (
                                <ActionIcon
                                    icon="mediaPlay"
                                    onClick={() => onPlay(song)}
                                    size="sm"
                                    tooltip={{ label: t('player.play'), openDelay: 0 }}
                                    variant="subtle"
                                />
                            )}
                            {onRemove && (
                                <ActionIcon
                                    icon="delete"
                                    onClick={() => onRemove(entryKey)}
                                    size="sm"
                                    tooltip={{ label: t('page.offline.remove'), openDelay: 0 }}
                                    variant="subtle"
                                />
                            )}
                        </Group>
                    )}
                </div>
            </Group>
        );
    },
);

OfflineSongRow.displayName = 'OfflineSongRow';
