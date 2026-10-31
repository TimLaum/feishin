import { Modal } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RiDownloadCloud2Line } from 'react-icons/ri';

import { useAudioPreview } from '../hooks/use-audio-preview';
import { useStartBatch } from '../hooks/use-batches';
import { useOpenArtist } from '../hooks/use-open-artist';
import { AlbumSearchResult, fetchAlbumTracks, ResultRow } from './web-search-content';
import styles from './web-search.module.css';

import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

interface AlbumTracksModalProps {
    album: AlbumSearchResult | null;
    onClose: () => void;
}

const AlbumTracksBody = ({ album, onClose }: { album: AlbumSearchResult; onClose: () => void }) => {
    const { handlePlay, playingId } = useAudioPreview(album.deezer_id);
    const startBatch = useStartBatch();
    const openArtist = useOpenArtist();
    const [isStarting, setIsStarting] = useState(false);

    const {
        data: tracks = [],
        error,
        isError,
        isLoading,
    } = useQuery({
        queryFn: async () =>
            (await fetchAlbumTracks(album.deezer_id)).map((t, i) => ({
                ...t,
                album: t.album || album.title,
                // Préfixe : les clés du store de téléchargement ne doivent pas
                // entrer en collision avec celles de la recherche de titres
                id: `alb${album.deezer_id}-${t.deezer_id ?? t.id ?? i}`,
                source: t.source ?? 'deezer',
            })),
        queryKey: ['web-search-album-tracks', album.deezer_id],
        staleTime: 10 * 60_000,
    });

    const handleDownloadAll = async () => {
        setIsStarting(true);
        await startBatch({
            album_ids: [album.deezer_id],
            name: `${album.title} — ${album.artist}`,
        });
        setIsStarting(false);
    };

    return (
        <Stack gap="sm">
            <Group justify="space-between">
                <Text isMuted size="sm">
                    <button
                        className={styles.artistLink}
                        onClick={() => {
                            onClose();
                            openArtist({ name: album.artist });
                        }}
                        type="button"
                    >
                        {album.artist}
                    </button>
                    {album.year ? ` · ${album.year}` : ''}
                </Text>
                {tracks.length > 0 && (
                    <Button
                        leftSection={<RiDownloadCloud2Line size={14} />}
                        loading={isStarting}
                        onClick={handleDownloadAll}
                        size="xs"
                        variant="filled"
                    >
                        Tout télécharger ({tracks.length})
                    </Button>
                )}
            </Group>
            {isLoading && (
                <Center py="md">
                    <Text isMuted size="sm">
                        Chargement des pistes…
                    </Text>
                </Center>
            )}
            {isError && (
                <Center py="md">
                    <Text size="sm" style={{ color: 'var(--mantine-color-red-6)' }}>
                        {error instanceof Error ? error.message : 'Pistes illisibles'}
                    </Text>
                </Center>
            )}
            <div>
                {tracks.map((track) => (
                    <ResultRow
                        isPlaying={playingId === track.id}
                        key={track.id}
                        onPlay={handlePlay}
                        result={track}
                    />
                ))}
            </div>
        </Stack>
    );
};

export const AlbumTracksModal = ({ album, onClose }: AlbumTracksModalProps) => (
    <Modal onClose={onClose} opened={album !== null} size="xl" title={album?.title ?? ''}>
        {album && <AlbumTracksBody album={album} onClose={onClose} />}
    </Modal>
);
