import { Drawer } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

import { useAudioPreview } from '../hooks/use-audio-preview';
import { NAS_API_BASE } from '../store/web-search-download-store';
import { SimilarSeed, useWebSearchUIStore } from '../store/web-search-ui-store';
import { AlbumRow, AlbumSearchResult, ResultRow, WebSearchResult } from './web-search-content';

import { AppRoute } from '/@/renderer/router/routes';
import { Badge } from '/@/shared/components/badge/badge';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RelatedArtist {
    cover_url: string;
    deezer_id: number;
    name: string;
}

export interface SimilarResponse {
    genre_albums: AlbumSearchResult[];
    related_artists: RelatedArtist[];
    seed_artist: string;
    seed_title: string;
    similar_tracks: WebSearchResult[];
    source: string;
    tags: string[];
}

// ── API ────────────────────────────────────────────────────────────────────

const fetchSimilar = async (seed: SimilarSeed): Promise<SimilarResponse> => {
    const params = new URLSearchParams();
    if (seed.deezerId) {
        params.set('deezer_id', String(seed.deezerId));
    } else {
        params.set('artist', seed.artist);
        if (seed.title) params.set('title', seed.title);
    }
    params.set('limit', '12');
    const res = await fetch(`${NAS_API_BASE}/similar?${params.toString()}`);
    if (!res.ok) throw new Error(`Similar lookup failed: ${res.statusText}`);
    return res.json();
};

const seedKey = (seed: null | SimilarSeed): string =>
    seed ? `${seed.deezerId ?? ''}|${seed.artist}|${seed.title ?? ''}` : '';

// ── Section title ──────────────────────────────────────────────────────────

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <Text
        fw={600}
        size="sm"
        style={{
            letterSpacing: 0.4,
            padding: '14px 16px 6px',
            textTransform: 'uppercase',
        }}
    >
        {children}
    </Text>
);

// ── Related artist tile ────────────────────────────────────────────────────

const ArtistTile = ({ artist, onSelect }: { artist: RelatedArtist; onSelect: () => void }) => (
    <button
        onClick={onSelect}
        style={{
            alignItems: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 0,
            width: 88,
        }}
        type="button"
    >
        <div
            style={{
                background: 'var(--theme-colors-surface)',
                borderRadius: '50%',
                height: 72,
                overflow: 'hidden',
                width: 72,
            }}
        >
            {artist.cover_url ? (
                <img
                    alt=""
                    src={artist.cover_url}
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
        <Text
            size="xs"
            style={{
                maxWidth: '100%',
                overflow: 'hidden',
                textAlign: 'center',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}
        >
            {artist.name}
        </Text>
    </button>
);

// ── Drawer body ────────────────────────────────────────────────────────────

const SimilarBody = ({ seed }: { seed: SimilarSeed }) => {
    const navigate = useNavigate();
    const closeSimilar = useWebSearchUIStore((s) => s.closeSimilar);
    const setPendingQuery = useWebSearchUIStore((s) => s.setPendingQuery);
    const [expandedAlbums, setExpandedAlbums] = useState<Set<number>>(new Set());
    const { handlePlay, playingId } = useAudioPreview(seedKey(seed));

    const { data, error, isError, isFetching } = useQuery({
        queryFn: () => fetchSimilar(seed),
        queryKey: ['similar', seedKey(seed)],
        retry: 1,
        staleTime: 5 * 60_000,
    });

    const handleToggleAlbum = useCallback((albumId: number) => {
        setExpandedAlbums((prev) => {
            const next = new Set(prev);
            if (next.has(albumId)) next.delete(albumId);
            else next.add(albumId);
            return next;
        });
    }, []);

    const handleSelectArtist = useCallback(
        (name: string) => {
            setPendingQuery(name);
            closeSimilar();
            navigate(AppRoute.WEB_SEARCH);
        },
        [navigate, setPendingQuery, closeSimilar],
    );

    if (isFetching && !data) {
        return (
            <Center h={240}>
                <Text isMuted>Recherche de morceaux similaires…</Text>
            </Center>
        );
    }

    if (isError) {
        return (
            <Center h={240}>
                <Text style={{ color: 'var(--mantine-color-red-6)' }}>
                    {error instanceof Error ? error.message : 'Échec de la recherche'}
                </Text>
            </Center>
        );
    }

    if (!data) return null;

    const hasNothing =
        data.similar_tracks.length === 0 &&
        data.related_artists.length === 0 &&
        data.genre_albums.length === 0;

    if (hasNothing) {
        return (
            <Center h={240}>
                <Text isMuted>Aucune suggestion trouvée</Text>
            </Center>
        );
    }

    return (
        <Stack gap={0}>
            {data.tags.length > 0 && (
                <Group gap={6} style={{ padding: '4px 16px 8px' }}>
                    {data.tags.map((tag) => (
                        <Badge key={tag} size="xs" variant="light">
                            {tag}
                        </Badge>
                    ))}
                </Group>
            )}

            {data.similar_tracks.length > 0 && (
                <>
                    <SectionTitle>Titres similaires</SectionTitle>
                    {data.similar_tracks.map((track) => (
                        <ResultRow
                            isPlaying={playingId === track.id}
                            key={track.id}
                            onPlay={handlePlay}
                            result={track}
                        />
                    ))}
                </>
            )}

            {data.related_artists.length > 0 && (
                <>
                    <SectionTitle>Artistes du même créneau</SectionTitle>
                    <div style={{ overflowX: 'auto', padding: '0 16px 12px' }}>
                        <Group gap="md" wrap="nowrap">
                            {data.related_artists.map((artist) => (
                                <ArtistTile
                                    artist={artist}
                                    key={artist.deezer_id}
                                    onSelect={() => handleSelectArtist(artist.name)}
                                />
                            ))}
                        </Group>
                    </div>
                </>
            )}

            {data.genre_albums.length > 0 && (
                <>
                    <SectionTitle>Albums du même genre</SectionTitle>
                    {data.genre_albums.map((album) => (
                        <AlbumRow
                            album={album}
                            isExpanded={expandedAlbums.has(album.deezer_id)}
                            key={album.deezer_id}
                            onPlay={handlePlay}
                            onToggle={handleToggleAlbum}
                            playingId={playingId}
                        />
                    ))}
                </>
            )}
        </Stack>
    );
};

// ── Drawer ─────────────────────────────────────────────────────────────────

export const SimilarDrawer = () => {
    const seed = useWebSearchUIStore((s) => s.similarSeed);
    const closeSimilar = useWebSearchUIStore((s) => s.closeSimilar);

    return (
        <Drawer
            onClose={closeSimilar}
            opened={Boolean(seed)}
            padding={8}
            position="right"
            size="lg"
            title={
                seed ? (
                    <Stack gap={2}>
                        <TextTitle order={4}>Sons similaires</TextTitle>
                        <Text isMuted size="xs">
                            {seed.title ? `${seed.title} — ${seed.artist}` : seed.artist}
                        </Text>
                    </Stack>
                ) : null
            }
        >
            {seed && <SimilarBody seed={seed} />}
        </Drawer>
    );
};
