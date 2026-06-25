import { Modal, Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { RiArrowLeftLine, RiDownloadCloud2Line } from 'react-icons/ri';
import { useNavigate, useParams } from 'react-router';

import styles from './new-releases.module.css';

import {
    DAYS_OPTIONS,
    fetchNewReleases,
    LIMIT_OPTIONS,
    NewReleaseAlbum,
} from '/@/renderer/features/new-releases/api';
import { useNewReleasesStore } from '/@/renderer/features/new-releases/store';
import {
    fetchAlbumTracks,
    queueDownload,
    ResultRow,
    WebSearchResult,
} from '/@/renderer/features/web-search/components/web-search-content';
import { useAudioPreview } from '/@/renderer/features/web-search/hooks/use-audio-preview';
import { useWebSearchDownloadStore } from '/@/renderer/features/web-search/store/web-search-download-store';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

interface AlbumCardProps {
    album: NewReleaseAlbum;
    onOpen: (album: NewReleaseAlbum) => void;
}

const AlbumCard = ({ album, onOpen }: AlbumCardProps) => {
    const year =
        album.year != null
            ? String(album.year)
            : album.release_date
              ? album.release_date.slice(0, 4)
              : '';
    return (
        <button className={styles.card} onClick={() => onOpen(album)} type="button">
            <div className={styles.cover}>
                {album.cover_url ? (
                    <img alt={album.title} src={album.cover_url} />
                ) : (
                    <Center h="100%" w="100%">
                        <Text isMuted>—</Text>
                    </Center>
                )}
            </div>
            <div className={styles.title}>{album.title}</div>
            <div className={styles.artist}>
                {album.artist}
                {year ? ` • ${year}` : ''}
            </div>
        </button>
    );
};

export const GenreDetailContent = () => {
    const navigate = useNavigate();
    const { genreId } = useParams<{ genreId: string }>();

    const [openedAlbum, setOpenedAlbum] = useState<NewReleaseAlbum | null>(null);
    const [tracks, setTracks] = useState<WebSearchResult[]>([]);
    const [isLoadingTracks, setIsLoadingTracks] = useState(false);
    const [tracksError, setTracksError] = useState<null | string>(null);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const { handlePlay, playingId, stop } = useAudioPreview(openedAlbum?.deezer_id);
    const setDownload = useWebSearchDownloadStore((s) => s.setDownload);

    const [filter, setFilter] = useState('');
    const days = useNewReleasesStore((s) => s.days);
    const limitPerGenre = useNewReleasesStore((s) => s.limitPerGenre);
    const setDays = useNewReleasesStore((s) => s.setDays);
    const setLimitPerGenre = useNewReleasesStore((s) => s.setLimitPerGenre);

    const { data, error, isError, isFetching } = useQuery({
        queryFn: () => fetchNewReleases(days, limitPerGenre),
        queryKey: ['new-releases', days, limitPerGenre],
        retry: 1,
        staleTime: 5 * 60_000,
    });

    const group = data?.find((g) => g.genre_id === Number(genreId));

    const normalizedFilter = filter.trim().toLowerCase();
    const albums = group
        ? normalizedFilter
            ? group.albums.filter(
                  (a) =>
                      a.title.toLowerCase().includes(normalizedFilter) ||
                      a.artist.toLowerCase().includes(normalizedFilter),
              )
            : group.albums
        : [];

    const handleOpenAlbum = useCallback(async (album: NewReleaseAlbum) => {
        setOpenedAlbum(album);
        setTracks([]);
        setTracksError(null);
        setIsLoadingTracks(true);
        try {
            const raw = await fetchAlbumTracks(album.deezer_id);
            const prefixed = raw.map((t, i) => ({
                ...t,
                id: `alb${album.deezer_id}-${t.deezer_id ?? t.id ?? i}`,
                source: t.source ?? 'deezer',
            }));
            setTracks(prefixed);
        } catch (err) {
            setTracksError(err instanceof Error ? err.message : 'Failed to load tracks');
        } finally {
            setIsLoadingTracks(false);
        }
    }, []);

    const handleCloseModal = useCallback(() => {
        stop();
        setOpenedAlbum(null);
    }, [stop]);

    const handleDownloadAll = useCallback(async () => {
        setIsDownloadingAll(true);
        try {
            await Promise.allSettled(tracks.map((t) => queueDownload(t, t.id, setDownload)));
        } finally {
            setIsDownloadingAll(false);
        }
    }, [tracks, setDownload]);

    return (
        <Stack gap={0} style={{ height: '100%' }}>
            <div
                style={{
                    borderBottom: '1px solid var(--theme-colors-border)',
                    padding: '16px 20px',
                }}
            >
                <Group align="center" gap="md" mb="sm">
                    <button
                        className={styles.backButton}
                        onClick={() => navigate('/new-releases')}
                        type="button"
                    >
                        <RiArrowLeftLine size={16} />
                        Back
                    </button>
                    <TextTitle order={3}>{group?.genre ?? 'Genre'}</TextTitle>
                    {group && (
                        <Text isMuted size="sm">
                            {group.count} releases
                        </Text>
                    )}
                </Group>
                <Group align="flex-end" gap="sm">
                    <TextInput
                        onChange={(e) => setFilter(e.currentTarget.value)}
                        placeholder="Filter by album or artist…"
                        style={{ flex: 1, maxWidth: 360 }}
                        value={filter}
                    />
                    <Select
                        allowDeselect={false}
                        data={DAYS_OPTIONS}
                        label="Window"
                        onChange={(v) => v && setDays(Number(v))}
                        size="xs"
                        style={{ width: 120 }}
                        value={String(days)}
                    />
                    <Select
                        allowDeselect={false}
                        data={LIMIT_OPTIONS}
                        label="Per genre"
                        onChange={(v) => v && setLimitPerGenre(Number(v))}
                        size="xs"
                        style={{ width: 100 }}
                        value={String(limitPerGenre)}
                    />
                </Group>
            </div>

            <ScrollArea style={{ flex: 1 }}>
                {isFetching && !group && (
                    <Center h={200}>
                        <Text isMuted>Loading…</Text>
                    </Center>
                )}
                {isError && (
                    <Center h={200}>
                        <Text style={{ color: 'var(--mantine-color-red-6)' }}>
                            {error instanceof Error ? error.message : 'Failed to load'}
                        </Text>
                    </Center>
                )}
                {!isFetching && !group && (
                    <Center h={200}>
                        <Text isMuted>Genre not found</Text>
                    </Center>
                )}

                {group && albums.length === 0 && normalizedFilter && (
                    <Center h={200}>
                        <Text isMuted>No releases match “{filter.trim()}”</Text>
                    </Center>
                )}

                {group && albums.length > 0 && (
                    <div className={styles.grid}>
                        {albums.map((album) => (
                            <AlbumCard
                                album={album}
                                key={album.deezer_id}
                                onOpen={handleOpenAlbum}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>

            <Modal
                onClose={handleCloseModal}
                opened={openedAlbum !== null}
                size="lg"
                title={openedAlbum ? `${openedAlbum.title} — ${openedAlbum.artist}` : ''}
            >
                {!isLoadingTracks && !tracksError && tracks.length > 0 && (
                    <Group justify="flex-end" mb="sm">
                        <Button
                            leftSection={<RiDownloadCloud2Line size={14} />}
                            loading={isDownloadingAll}
                            onClick={handleDownloadAll}
                            size="xs"
                            variant="filled"
                        >
                            Download All
                        </Button>
                    </Group>
                )}
                {isLoadingTracks && (
                    <Center py="md">
                        <Text isMuted size="sm">
                            Loading tracks…
                        </Text>
                    </Center>
                )}
                {tracksError && (
                    <Center py="md">
                        <Text size="sm" style={{ color: 'var(--mantine-color-red-6)' }}>
                            {tracksError}
                        </Text>
                    </Center>
                )}
                {!isLoadingTracks &&
                    !tracksError &&
                    tracks.map((track) => (
                        <ResultRow
                            isPlaying={playingId === track.id}
                            key={track.id}
                            onPlay={handlePlay}
                            result={track}
                        />
                    ))}
            </Modal>
        </Stack>
    );
};
