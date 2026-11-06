import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMetadataEditor } from '../hooks/use-metadata-editor';
import {
    getFrontCover,
    getRelease,
    type MbCandidate,
    releaseToTags,
    searchRecordings,
} from '../utils/musicbrainz';
import styles from './musicbrainz-panel.module.css';

import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { useDebouncedValue } from '/@/shared/hooks/use-debounced-value';
import { Song } from '/@/shared/types/domain-types';

const formatLength = (ms?: number) => {
    if (!ms) return '';
    const seconds = Math.round(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const firstValue = (value: unknown) =>
    (Array.isArray(value) ? value[0] : value) as string | undefined;

interface MusicBrainzPanelProps {
    editor: ReturnType<typeof useMetadataEditor>;
    onApplied: () => void;
    // null quand plusieurs morceaux sont édités en même temps
    song: null | Song;
}

/**
 * Recherche titre + artiste sur MusicBrainz ; un clic sur un résultat remplit tous les champs
 * (et la pochette Cover Art Archive) dans l'éditeur. Rien n'est écrit avant « Enregistrer ».
 */
export const MusicBrainzPanel = ({ editor, onApplied, song }: MusicBrainzPanelProps) => {
    const { t } = useTranslation();
    const current = new Map(editor.sortedFieldEntries);
    const [title, setTitle] = useState(firstValue(current.get('title')) ?? song?.name ?? '');
    const [artist, setArtist] = useState(
        firstValue(current.get('artist')) ?? song?.artistName ?? '',
    );
    const [applyingKey, setApplyingKey] = useState<null | string>(null);

    const [debouncedTitle = ''] = useDebouncedValue(title, 600);
    const [debouncedArtist = ''] = useDebouncedValue(artist, 600);

    const { data, error, isFetching } = useQuery({
        enabled: !!song && !!(debouncedTitle.trim() || debouncedArtist.trim()),
        queryFn: ({ signal }) =>
            searchRecordings(debouncedTitle, debouncedArtist, song?.duration, signal),
        queryKey: ['musicbrainz-search', debouncedTitle, debouncedArtist, song?.duration],
        retry: false,
        staleTime: Infinity,
    });

    if (!song) {
        return (
            <Text isMuted p="md">
                {t('page.itemDetail.musicbrainzSingleOnly')}
            </Text>
        );
    }

    const apply = async (candidate: MbCandidate) => {
        if (applyingKey) return;
        setApplyingKey(candidate.key);
        try {
            const release = await getRelease(candidate.releaseId);
            const tags = releaseToTags(release, candidate);
            if (!tags) throw new Error(t('page.itemDetail.musicbrainzTrackNotFound'));

            const existing = new Set(editor.sortedFieldEntries.map(([key]) => key));
            for (const [key, value] of Object.entries(tags)) {
                const multi = editor.multiValueKeys.has(key);
                const fieldValue = Array.isArray(value)
                    ? multi
                        ? value
                        : value.join('; ')
                    : multi
                      ? [value]
                      : value;
                if (!existing.has(key)) editor.handleAddField(key);
                editor.handleFieldChange(key, fieldValue);
            }

            // pochette : bonus, son absence n'empêche pas d'appliquer les tags
            if (release['cover-art-archive']?.front) {
                const cover = await getFrontCover(release.id).catch(() => null);
                if (cover) editor.applyArtworkBytes(cover.bytes, cover.mimeType);
            }

            toast.success({ message: t('page.itemDetail.musicbrainzApplied') });
            onApplied();
        } catch (err) {
            toast.error({ message: (err as Error).message });
        } finally {
            setApplyingKey(null);
        }
    };

    const results = data ?? [];

    return (
        <Stack gap="xs" pt="xs">
            <Group grow>
                <TextInput
                    label={t('common.title', 'Title')}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    value={title}
                />
                <TextInput
                    label={t('entity.artist', { count: 1 })}
                    onChange={(e) => setArtist(e.currentTarget.value)}
                    value={artist}
                />
            </Group>
            <ScrollArea className={styles.results}>
                {isFetching ? (
                    <Spinner container />
                ) : error ? (
                    <Text c="red">{(error as Error).message}</Text>
                ) : results.length === 0 ? (
                    <Text isMuted>{t('page.itemDetail.musicbrainzNoResult')}</Text>
                ) : (
                    <Stack gap={2}>
                        {results.map((candidate) => {
                            const diff =
                                candidate.lengthMs && song.duration
                                    ? Math.round((candidate.lengthMs - song.duration) / 1000)
                                    : null;
                            return (
                                <button
                                    className={clsx(styles.searchItem, {
                                        [styles.applying]: !!applyingKey,
                                        [styles.selected]: applyingKey === candidate.key,
                                    })}
                                    key={candidate.key}
                                    onClick={() => apply(candidate)}
                                >
                                    <Group justify="space-between" wrap="nowrap">
                                        <Stack gap={0}>
                                            <Text fw={600}>{candidate.title}</Text>
                                            <Text isMuted>{candidate.artist}</Text>
                                            <Text isMuted size="sm">
                                                {[
                                                    candidate.releaseTitle +
                                                        (candidate.disambiguation
                                                            ? ` (${candidate.disambiguation})`
                                                            : ''),
                                                    candidate.releaseType,
                                                    candidate.date,
                                                    candidate.country,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </Text>
                                        </Stack>
                                        <Stack align="flex-end" gap={0}>
                                            <Text>{formatLength(candidate.lengthMs)}</Text>
                                            {diff !== null && (
                                                <Text
                                                    c={Math.abs(diff) <= 3 ? 'green' : 'orange'}
                                                    size="sm"
                                                >
                                                    {diff > 0 ? `+${diff}` : diff} s
                                                </Text>
                                            )}
                                        </Stack>
                                    </Group>
                                </button>
                            );
                        })}
                    </Stack>
                )}
            </ScrollArea>
            <Text isMuted size="sm">
                {t('page.itemDetail.musicbrainzHint')}
            </Text>
        </Stack>
    );
};
