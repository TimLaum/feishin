import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RiArrowLeftLine, RiDownloadCloud2Line } from 'react-icons/ri';
import { useNavigate } from 'react-router';

import { ArtistRelease, fetchArtist, formatFans, normalizeName, toDownloadRequest } from '../api';
import { useAudioPreview } from '../hooks/use-audio-preview';
import { useStartBatch } from '../hooks/use-batches';
import { useOpenArtist } from '../hooks/use-open-artist';
import { AlbumTracksModal } from './album-tracks-modal';
import { DiscographyModal } from './discography-modal';
import { WebAlbumCard } from './web-album-card';
import { AlbumSearchResult, ResultRow } from './web-search-content';
import styles from './web-search.module.css';

import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

const TOP_SHOWN = 10;
const TOP_STEP = 20;

const Section = ({
    children,
    count,
    title,
}: {
    children: React.ReactNode;
    count?: number;
    title: string;
}) => (
    <>
        <div className={styles.sectionTitle}>
            {title}
            {count ? <span className={styles.sectionCount}>{count}</span> : null}
        </div>
        {children}
    </>
);

export const ArtistDetailContent = ({ artistId }: { artistId: number }) => {
    const navigate = useNavigate();
    const openArtist = useOpenArtist();
    const startBatch = useStartBatch();
    const { handlePlay, playingId } = useAudioPreview(artistId);
    const [shownTop, setShownTop] = useState(TOP_SHOWN);
    const [openedAlbum, setOpenedAlbum] = useState<AlbumSearchResult | null>(null);
    const [isDiscographyOpen, setIsDiscographyOpen] = useState(false);
    const [isStartingTop, setIsStartingTop] = useState(false);

    const { data, error, isError, isLoading } = useQuery({
        queryFn: () => fetchArtist(artistId, 50),
        queryKey: ['web-search-artist', artistId],
        retry: 1,
        staleTime: 10 * 60_000,
    });

    const header = (
        <div style={{ borderBottom: '1px solid var(--theme-colors-border)', padding: '12px 20px' }}>
            <button className={styles.backButton} onClick={() => navigate(-1)} type="button">
                <RiArrowLeftLine size={16} />
                Retour
            </button>
        </div>
    );

    if (isLoading || isError || !data) {
        return (
            <Stack gap={0} style={{ height: '100%' }}>
                {header}
                <Center h={240}>
                    <Text
                        isMuted={!isError}
                        style={isError ? { color: 'var(--mantine-color-red-6)' } : undefined}
                    >
                        {isError
                            ? error instanceof Error
                                ? error.message
                                : 'Fiche artiste illisible'
                            : 'Chargement…'}
                    </Text>
                </Center>
            </Stack>
        );
    }

    const nReleases = data.albums.length + data.singles.length + data.compilations.length;
    const topTracks = data.top_tracks.slice(0, shownTop);
    const releaseSections: [string, ArtistRelease[]][] = [
        ['Albums', data.albums],
        ['Singles et EP', data.singles],
        ['Compilations', data.compilations],
    ];

    const handleDownloadTop = async () => {
        setIsStartingTop(true);
        await startBatch({
            name: `Top ${topTracks.length} — ${data.name}`,
            tracks: topTracks.map(toDownloadRequest),
        });
        setIsStartingTop(false);
    };

    return (
        <Stack gap={0} style={{ height: '100%' }}>
            {header}
            <ScrollArea style={{ flex: 1 }}>
                <div className={styles.hero}>
                    <div className={styles.avatar}>
                        {data.picture_url && <img alt="" src={data.picture_url} />}
                    </div>
                    <Stack gap="xs">
                        <TextTitle order={1}>{data.name}</TextTitle>
                        <Text isMuted size="sm">
                            {[
                                formatFans(data.nb_fans),
                                data.nb_albums ? `${data.nb_albums} sorties` : null,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </Text>
                        {nReleases > 0 && (
                            <Group>
                                <Button
                                    leftSection={<RiDownloadCloud2Line size={16} />}
                                    onClick={() => setIsDiscographyOpen(true)}
                                    variant="filled"
                                >
                                    Tout télécharger
                                </Button>
                            </Group>
                        )}
                    </Stack>
                </div>

                {topTracks.length > 0 && (
                    <Section title="Titres populaires">
                        {topTracks.map((track, i) => (
                            <ResultRow
                                isPlaying={playingId === track.id}
                                key={track.id}
                                // Inutile de rouvrir la fiche sur laquelle on est déjà
                                noArtistLink={
                                    normalizeName(track.artist) === normalizeName(data.name)
                                }
                                onPlay={handlePlay}
                                rank={i + 1}
                                result={track}
                            />
                        ))}
                        <Group gap="sm" style={{ padding: '12px 20px' }}>
                            {shownTop < data.top_tracks.length && (
                                <Button
                                    onClick={() =>
                                        setShownTop((n) =>
                                            Math.min(n + TOP_STEP, data.top_tracks.length),
                                        )
                                    }
                                    size="xs"
                                    variant="default"
                                >
                                    {shownTop > TOP_SHOWN
                                        ? 'Afficher plus'
                                        : `Afficher plus (${data.top_tracks.length})`}
                                </Button>
                            )}
                            <Button
                                loading={isStartingTop}
                                onClick={handleDownloadTop}
                                size="xs"
                                variant="default"
                            >
                                Télécharger ces {topTracks.length} titres
                            </Button>
                        </Group>
                    </Section>
                )}

                {releaseSections.map(([title, items]) =>
                    items.length ? (
                        <Section count={items.length} key={title} title={title}>
                            <div className={styles.shelf}>
                                {items.map((album) => (
                                    <WebAlbumCard
                                        album={album}
                                        byType
                                        key={album.deezer_id}
                                        onOpen={setOpenedAlbum}
                                    />
                                ))}
                            </div>
                        </Section>
                    ) : null,
                )}

                {data.related_artists.length > 0 && (
                    <Section title="Artistes similaires">
                        <div className={styles.shelf}>
                            {data.related_artists.map((a) => (
                                <button
                                    className={styles.bubble}
                                    key={a.id}
                                    onClick={() => openArtist(a)}
                                    type="button"
                                >
                                    {a.picture_url ? (
                                        <img alt="" loading="lazy" src={a.picture_url} />
                                    ) : (
                                        <div className={styles.bubbleEmpty} />
                                    )}
                                    <Text size="xs" style={{ maxWidth: '100%' }} truncate>
                                        {a.name}
                                    </Text>
                                </button>
                            ))}
                        </div>
                    </Section>
                )}
                <div style={{ height: 24 }} />
            </ScrollArea>

            <AlbumTracksModal album={openedAlbum} onClose={() => setOpenedAlbum(null)} />
            <DiscographyModal
                artist={data}
                onClose={() => setIsDiscographyOpen(false)}
                opened={isDiscographyOpen}
            />
        </Stack>
    );
};
