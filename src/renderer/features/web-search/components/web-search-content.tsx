import { Progress, SegmentedControl, Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import formatDuration from 'format-duration';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    RiArrowDownSLine,
    RiArrowUpSLine,
    RiCheckLine,
    RiDownload2Line,
    RiDownloadCloud2Line,
    RiErrorWarningLine,
    RiPauseFill,
    RiPlayFill,
    RiSparkling2Line,
} from 'react-icons/ri';

import { searchArtists } from '../api';
import { useAudioPreview } from '../hooks/use-audio-preview';
import { isBatchActive, useBatches, useStartBatch } from '../hooks/use-batches';
import { useOpenArtist } from '../hooks/use-open-artist';
import { nasFetch } from '../nas-fetch';
import { ActiveDownload, useWebSearchDownloadStore } from '../store/web-search-download-store';
import { albumSelectionKey, trackSelectionKey } from '../store/web-search-selection-store';
import { useWebSearchUIStore } from '../store/web-search-ui-store';
import { ArtistRow } from './artist-row';
import { PlaylistImportPanel } from './playlist-import-panel';
import { SelectionCheckbox } from './selection-checkbox';
import { WebDownloadsPanel } from './web-downloads-panel';
import styles from './web-search.module.css';

import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AlbumSearchResult {
    artist: string;
    cover_url: string;
    deezer_id: number;
    id: string;
    source: string;
    title: string;
    track_count?: number;
    year?: null | string;
}

export type ViewMode = 'albums' | 'artists' | 'downloads' | 'playlists' | 'tracks';

export interface WebSearchResult {
    album: string;
    artist: string;
    cover_url: string;
    deezer_id?: number;
    duration: number;
    id: string;
    preview_url?: string;
    source: string;
    title: string;
    year?: null | string;
    // Résultats YT Music : la vidéo exacte, que l'API télécharge telle quelle
    youtube_url?: null | string;
}

interface DownloadResponse {
    download_id: string;
    status: string;
}

// ── API helpers ────────────────────────────────────────────────────────────

const SEARCH_LIMIT = 20;

const searchTracks = async (
    query: string,
    limit: number,
    offset: number,
): Promise<WebSearchResult[]> => {
    const res = await nasFetch(
        `/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
    );
    if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
    return res.json();
};

const searchAlbums = async (
    query: string,
    limit: number,
    offset: number,
): Promise<AlbumSearchResult[]> => {
    const res = await nasFetch(
        `/search/albums?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
    );
    if (!res.ok) throw new Error(`Album search failed: ${res.statusText}`);
    return res.json();
};

export const fetchAlbumTracks = async (albumId: number): Promise<WebSearchResult[]> => {
    const res = await nasFetch(`/album/${albumId}/tracks`);
    if (!res.ok) throw new Error(`Failed to load tracks: ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.data ?? data.tracks ?? []);
};

const startDownload = async (result: WebSearchResult): Promise<DownloadResponse> => {
    const res = await nasFetch(`/download`, {
        body: JSON.stringify({
            album: result.album,
            artist: result.artist,
            cover_url: result.cover_url,
            deezer_id: result.deezer_id ?? null,
            duration: result.duration,
            source: result.source,
            title: result.title,
            youtube_url: result.youtube_url ?? null,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Download failed (${res.status}): ${text}`);
    }
    return res.json();
};

const checkInLibrary = async (artist: string, title: string): Promise<{ exists: boolean }> => {
    const res = await nasFetch(
        `/check?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
    );
    if (!res.ok) return { exists: false };
    return res.json();
};

// ── Helpers ────────────────────────────────────────────────────────────────

export const queueDownload = async (
    result: WebSearchResult,
    storeId: string,
    setDownload: (id: string, d: ActiveDownload) => void,
) => {
    setDownload(storeId, {
        artist: result.artist,
        downloadId: '',
        state: { status: 'starting' },
        title: result.title,
    });
    try {
        const { download_id } = await startDownload(result);
        setDownload(storeId, {
            artist: result.artist,
            downloadId: download_id,
            state: {
                downloadId: download_id,
                message: 'Searching…',
                progress: 0,
                status: 'active',
            },
            title: result.title,
        });
    } catch (err) {
        setDownload(storeId, {
            artist: result.artist,
            downloadId: '',
            state: {
                message: err instanceof Error ? err.message : 'Failed to start download',
                status: 'error',
            },
            title: result.title,
        });
    }
};

// ── Result row ─────────────────────────────────────────────────────────────

interface ResultRowProps {
    isPlaying: boolean;
    // Fiche artiste : pas de lien vers l'artiste qu'on regarde déjà
    noArtistLink?: boolean;
    onPlay: (id: string, previewUrl: string) => void;
    // Position dans un classement (titres populaires d'un artiste)
    rank?: number;
    result: WebSearchResult;
}

export const ResultRow = ({ isPlaying, noArtistLink, onPlay, rank, result }: ResultRowProps) => {
    const openArtist = useOpenArtist();
    const download = useWebSearchDownloadStore((s) => s.downloads[result.id]);
    const setDownload = useWebSearchDownloadStore((s) => s.setDownload);
    const openSimilar = useWebSearchUIStore((s) => s.openSimilar);
    const downloadState = download?.state ?? { status: 'idle' };

    const handleSimilar = useCallback(() => {
        openSimilar({
            artist: result.artist,
            deezerId: result.deezer_id ?? null,
            title: result.title,
        });
    }, [openSimilar, result.artist, result.deezer_id, result.title]);

    const { data: libraryCheck, refetch: refetchLibraryCheck } = useQuery({
        queryFn: () => checkInLibrary(result.artist, result.title),
        queryKey: ['web-search-check', result.artist, result.title],
        retry: false,
        staleTime: 30_000,
    });

    useEffect(() => {
        if (downloadState.status === 'done') {
            refetchLibraryCheck();
        }
    }, [downloadState.status, refetchLibraryCheck]);

    const handleDownload = useCallback(async () => {
        await queueDownload(result, result.id, setDownload);
    }, [result, setDownload]);

    const isInLibrary = libraryCheck?.exists ?? false;

    return (
        <Group
            className={styles.selectable}
            gap="md"
            style={{
                borderBottom: '1px solid var(--theme-colors-border)',
                padding: '10px 16px',
            }}
            wrap="nowrap"
        >
            <SelectionCheckbox
                entry={{ item: result, kind: 'track' }}
                selectionKey={trackSelectionKey(result)}
            />
            {rank !== undefined && <span className={styles.rank}>{rank}</span>}

            {/* Thumbnail + preview button */}
            <div style={{ flexShrink: 0, position: 'relative' }}>
                <div
                    style={{
                        background: 'var(--theme-colors-surface)',
                        borderRadius: 4,
                        height: 48,
                        overflow: 'hidden',
                        width: 48,
                    }}
                >
                    {result.cover_url ? (
                        <img
                            alt=""
                            src={result.cover_url}
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
                {result.preview_url && (
                    <button
                        onClick={() => onPlay(result.id, result.preview_url!)}
                        onMouseEnter={(e) => {
                            if (!isPlaying) e.currentTarget.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                            if (!isPlaying) e.currentTarget.style.opacity = '0';
                        }}
                        style={{
                            alignItems: 'center',
                            background: isPlaying
                                ? 'var(--mantine-color-blue-6)'
                                : 'rgba(0,0,0,0.55)',
                            border: 'none',
                            borderRadius: 4,
                            bottom: 0,
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            height: '100%',
                            justifyContent: 'center',
                            left: 0,
                            opacity: isPlaying ? 1 : 0,
                            position: 'absolute',
                            top: 0,
                            transition: 'opacity 0.15s',
                            width: '100%',
                        }}
                    >
                        {isPlaying ? <RiPauseFill size={20} /> : <RiPlayFill size={20} />}
                    </button>
                )}
            </div>

            {/* Title / artist / album */}
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text
                    fw={500}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {result.title}
                </Text>
                <Text
                    isMuted
                    size="xs"
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {noArtistLink || !result.artist ? (
                        result.artist
                    ) : (
                        <button
                            className={styles.artistLink}
                            onClick={() => openArtist({ name: result.artist })}
                            type="button"
                        >
                            {result.artist}
                        </button>
                    )}
                    {result.album ? ` — ${result.album}` : ''}
                    {result.year ? ` • ${result.year}` : ''}
                </Text>
            </Stack>

            {/* Duration */}
            <Text isMuted size="xs" style={{ flexShrink: 0 }}>
                {result.duration ? formatDuration(result.duration * 1000) : ''}
            </Text>

            {/* In-library badge */}
            {isInLibrary && (
                <Badge color="green" size="xs" variant="light">
                    In library
                </Badge>
            )}

            {/* Find similar */}
            <button
                onClick={handleSimilar}
                style={{
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--theme-colors-foreground-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexShrink: 0,
                    justifyContent: 'center',
                    padding: 4,
                }}
                title="Sons similaires"
                type="button"
            >
                <RiSparkling2Line size={18} />
            </button>

            {/* Download area */}
            <div style={{ flexShrink: 0, minWidth: 130, textAlign: 'right' }}>
                {(downloadState.status === 'idle' ||
                    (downloadState.status === 'done' && downloadState.alreadyExisted)) && (
                    <Button
                        leftSection={<RiDownload2Line />}
                        onClick={handleDownload}
                        size="xs"
                        variant="default"
                    >
                        Download
                    </Button>
                )}

                {downloadState.status === 'starting' && (
                    <Button disabled loading size="xs" variant="default">
                        Starting…
                    </Button>
                )}

                {downloadState.status === 'active' && (
                    <Stack gap={4} style={{ minWidth: 130 }}>
                        <Text isMuted size="xs">
                            {downloadState.message}
                        </Text>
                        <Progress animated size="xs" value={downloadState.progress} />
                    </Stack>
                )}

                {downloadState.status === 'done' && !downloadState.alreadyExisted && (
                    <Group gap={6}>
                        <RiCheckLine color="var(--mantine-color-green-6)" size={16} />
                        <Text size="xs" style={{ color: 'var(--mantine-color-green-6)' }}>
                            Done
                        </Text>
                    </Group>
                )}

                {downloadState.status === 'error' && (
                    <Stack gap={4} style={{ maxWidth: 160 }}>
                        <Group gap={4}>
                            <RiErrorWarningLine color="var(--mantine-color-red-6)" size={14} />
                            <Text size="xs" style={{ color: 'var(--mantine-color-red-6)' }}>
                                {downloadState.message}
                            </Text>
                        </Group>
                        <Button onClick={handleDownload} size="xs" variant="default">
                            Retry
                        </Button>
                    </Stack>
                )}
            </div>
        </Group>
    );
};

// ── Album row ──────────────────────────────────────────────────────────────

interface AlbumRowProps {
    album: AlbumSearchResult;
    isExpanded: boolean;
    onPlay: (id: string, previewUrl: string) => void;
    onToggle: (albumId: number) => void;
    playingId: null | string;
}

export const AlbumRow = ({ album, isExpanded, onPlay, onToggle, playingId }: AlbumRowProps) => {
    const [tracks, setTracks] = useState<WebSearchResult[]>([]);
    const [isLoadingTracks, setIsLoadingTracks] = useState(false);
    const [tracksError, setTracksError] = useState<null | string>(null);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const startBatch = useStartBatch();
    const openArtist = useOpenArtist();
    // Ref : pistes déjà chargées, sans recréer loadTracks
    const tracksRef = useRef<WebSearchResult[]>([]);

    const loadTracks = useCallback(async (): Promise<WebSearchResult[]> => {
        if (tracksRef.current.length > 0) return tracksRef.current;
        setIsLoadingTracks(true);
        setTracksError(null);
        try {
            const data = await fetchAlbumTracks(album.deezer_id);
            // Prefix IDs so album-track store keys never collide with track-search results
            const prefixed = data.map((t, i) => ({
                ...t,
                id: `alb${album.deezer_id}-${t.deezer_id ?? t.id ?? i}`,
                source: t.source ?? album.source,
            }));
            tracksRef.current = prefixed;
            setTracks(prefixed);
            return prefixed;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to load tracks';
            setTracksError(msg);
            return [];
        } finally {
            setIsLoadingTracks(false);
        }
    }, [album.deezer_id, album.source]);

    const handleToggle = useCallback(async () => {
        onToggle(album.deezer_id);
        if (!isExpanded) await loadTracks();
    }, [album.deezer_id, isExpanded, loadTracks, onToggle]);

    // Lot serveur : l'API déplie l'album, saute ce qui est déjà en bibliothèque
    // et ne lance qu'un scan Navidrome à la fin.
    const handleDownloadAll = useCallback(async () => {
        setIsDownloadingAll(true);
        await startBatch({
            album_ids: [album.deezer_id],
            name: `${album.title} — ${album.artist}`,
        });
        setIsDownloadingAll(false);
    }, [album.artist, album.deezer_id, album.title, startBatch]);

    return (
        <div>
            {/* Album header */}
            <Group
                className={styles.selectable}
                gap="md"
                style={{
                    borderBottom: isExpanded ? 'none' : '1px solid var(--theme-colors-border)',
                    padding: '12px 16px',
                }}
                wrap="nowrap"
            >
                <SelectionCheckbox
                    entry={{ item: album, kind: 'album' }}
                    selectionKey={albumSelectionKey(album)}
                />

                {/* Cover */}
                <div
                    style={{
                        background: 'var(--theme-colors-surface)',
                        borderRadius: 4,
                        flexShrink: 0,
                        height: 64,
                        overflow: 'hidden',
                        width: 64,
                    }}
                >
                    {album.cover_url ? (
                        <img
                            alt=""
                            src={album.cover_url}
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

                {/* Album info */}
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        fw={600}
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {album.title}
                    </Text>
                    <Text
                        isMuted
                        size="xs"
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <button
                            className={styles.artistLink}
                            onClick={() => openArtist({ name: album.artist })}
                            type="button"
                        >
                            {album.artist}
                        </button>
                        {album.year ? ` • ${album.year}` : ''}
                        {album.track_count ? ` • ${album.track_count} tracks` : ''}
                    </Text>
                </Stack>

                {/* Actions */}
                <Group gap="xs" style={{ flexShrink: 0 }}>
                    <Button
                        leftSection={<RiDownloadCloud2Line size={14} />}
                        loading={isDownloadingAll}
                        onClick={handleDownloadAll}
                        size="xs"
                        variant="default"
                    >
                        Download All
                    </Button>
                    <Button
                        onClick={handleToggle}
                        rightSection={
                            isExpanded ? (
                                <RiArrowUpSLine size={16} />
                            ) : (
                                <RiArrowDownSLine size={16} />
                            )
                        }
                        size="xs"
                        variant="subtle"
                    >
                        {isExpanded ? 'Collapse' : 'View tracks'}
                    </Button>
                </Group>
            </Group>

            {/* Expanded track list */}
            {isExpanded && (
                <div
                    style={{
                        borderBottom: '1px solid var(--theme-colors-border)',
                        borderLeft: '3px solid var(--mantine-color-blue-6)',
                        marginLeft: 16,
                    }}
                >
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
                                onPlay={onPlay}
                                result={track}
                            />
                        ))}
                </div>
            )}
        </div>
    );
};

// ── Main content ───────────────────────────────────────────────────────────

export const WebSearchContent = () => {
    // Dernière recherche : on la retrouve en revenant d'une fiche artiste
    const [lastSearch] = useState(() => useWebSearchUIStore.getState().lastSearch);
    const setLastSearch = useWebSearchUIStore((s) => s.setLastSearch);
    const [inputValue, setInputValue] = useState(lastSearch.query);
    const [query, setQuery] = useState(lastSearch.query);
    const [offset, setOffset] = useState(0);
    const [allResults, setAllResults] = useState<WebSearchResult[]>([]);
    const [allAlbums, setAllAlbums] = useState<AlbumSearchResult[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>(lastSearch.viewMode);
    const [expandedAlbums, setExpandedAlbums] = useState<Set<number>>(new Set());
    const [sortBy, setSortBy] = useState<'relevance' | 'year_asc' | 'year_desc'>('relevance');
    const { handlePlay, playingId } = useAudioPreview(query);
    const pendingQuery = useWebSearchUIStore((s) => s.pendingQuery);
    const clearPendingQuery = useWebSearchUIStore((s) => s.clearPendingQuery);

    // Requête poussée depuis le drawer de similaires (clic sur un artiste)
    useEffect(() => {
        if (!pendingQuery) return;
        const trimmed = pendingQuery.trim();
        clearPendingQuery();
        if (!trimmed) return;
        setInputValue(trimmed);
        setAllResults([]);
        setAllAlbums([]);
        setHasMore(false);
        setExpandedAlbums(new Set());
        setOffset(0);
        setViewMode('tracks');
        setQuery(trimmed);
    }, [pendingQuery, clearPendingQuery]);

    useEffect(() => {
        setLastSearch({ query, viewMode });
    }, [query, setLastSearch, viewMode]);

    const { data: batches } = useBatches();
    const activeBatchCount = batches?.filter(isBatchActive).length ?? 0;

    const sortedResults = useMemo(() => {
        if (sortBy === 'relevance') return allResults;
        return [...allResults].sort((a, b) => {
            const ya = a.year ? parseInt(String(a.year)) : 0;
            const yb = b.year ? parseInt(String(b.year)) : 0;
            return sortBy === 'year_desc' ? yb - ya : ya - yb;
        });
    }, [allResults, sortBy]);

    const sortedAlbums = useMemo(() => {
        if (sortBy === 'relevance') return allAlbums;
        return [...allAlbums].sort((a, b) => {
            const ya = a.year ? parseInt(String(a.year)) : 0;
            const yb = b.year ? parseInt(String(b.year)) : 0;
            return sortBy === 'year_desc' ? yb - ya : ya - yb;
        });
    }, [allAlbums, sortBy]);

    const trackQuery = useQuery({
        enabled: query.length > 0 && viewMode === 'tracks',
        queryFn: () => searchTracks(query, SEARCH_LIMIT, offset),
        queryKey: ['web-search', query, offset],
        retry: 1,
        staleTime: 60_000,
    });

    const albumQuery = useQuery({
        enabled: query.length > 0 && viewMode === 'albums',
        queryFn: () => searchAlbums(query, SEARCH_LIMIT, offset),
        queryKey: ['web-search-albums', query, offset],
        retry: 1,
        staleTime: 60_000,
    });

    const artistQuery = useQuery({
        enabled: query.length > 0 && viewMode === 'artists',
        queryFn: () => searchArtists(query, SEARCH_LIMIT),
        queryKey: ['web-search-artists', query],
        retry: 1,
        staleTime: 60_000,
    });
    const artists = artistQuery.data ?? [];

    const activeQuery =
        viewMode === 'albums' ? albumQuery : viewMode === 'artists' ? artistQuery : trackQuery;
    const { error, isError, isFetching } = activeQuery;

    // Populate track results — also depends on viewMode so cached data is re-seeded on mode switch
    useEffect(() => {
        if (viewMode !== 'tracks' || !trackQuery.data) return;
        if (offset === 0) {
            setAllResults(trackQuery.data);
        } else {
            setAllResults((prev) => [...prev, ...trackQuery.data!]);
        }
        setHasMore(trackQuery.data.length >= SEARCH_LIMIT);
    }, [trackQuery.data, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Populate album results — same pattern
    useEffect(() => {
        if (viewMode !== 'albums' || !albumQuery.data) return;
        if (offset === 0) {
            setAllAlbums(albumQuery.data);
        } else {
            setAllAlbums((prev) => [...prev, ...albumQuery.data!]);
        }
        setHasMore(albumQuery.data.length >= SEARCH_LIMIT);
    }, [albumQuery.data, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = () => {
        const trimmed = inputValue.trim();
        if (!trimmed) return;
        setAllResults([]);
        setAllAlbums([]);
        setHasMore(false);
        setExpandedAlbums(new Set());
        setOffset(0);
        setQuery(trimmed);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch();
    };

    const handleLoadMore = () => {
        setOffset((prev) => prev + SEARCH_LIMIT);
    };

    const handleViewModeChange = (value: string) => {
        const mode = value as ViewMode;
        setViewMode(mode);
        setOffset(0);
        setAllResults([]);
        setAllAlbums([]);
        setHasMore(false);
        setExpandedAlbums(new Set());
    };

    const handleToggleAlbum = useCallback((albumId: number) => {
        setExpandedAlbums((prev) => {
            const next = new Set(prev);
            if (next.has(albumId)) next.delete(albumId);
            else next.add(albumId);
            return next;
        });
    }, []);

    const isInitialLoading = isFetching && offset === 0;
    const resultCount =
        viewMode === 'albums'
            ? sortedAlbums.length
            : viewMode === 'artists'
              ? artists.length
              : sortedResults.length;
    // « Playlists » et « Téléchargements » ne sont pas des recherches.
    const isSearchMode = viewMode === 'albums' || viewMode === 'artists' || viewMode === 'tracks';

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
                    <TextTitle order={3}>Web Search</TextTitle>
                </Group>
                <Group gap="sm">
                    {isSearchMode && (
                        <>
                            <TextInput
                                onChange={(e) => setInputValue(e.currentTarget.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search for a track, artist, album…"
                                style={{ flex: 1, maxWidth: 600 }}
                                value={inputValue}
                            />
                            <Button
                                loading={isInitialLoading}
                                onClick={handleSearch}
                                variant="filled"
                            >
                                Search
                            </Button>
                        </>
                    )}
                    <SegmentedControl
                        data={[
                            { label: 'Titres', value: 'tracks' },
                            { label: 'Albums', value: 'albums' },
                            { label: 'Artistes', value: 'artists' },
                            { label: 'Playlists', value: 'playlists' },
                            {
                                label: activeBatchCount
                                    ? `Téléchargements (${activeBatchCount})`
                                    : 'Téléchargements',
                                value: 'downloads',
                            },
                        ]}
                        onChange={handleViewModeChange}
                        size="xs"
                        value={viewMode}
                    />
                    {(viewMode === 'tracks' || viewMode === 'albums') && (
                        <Select
                            checkIconPosition="right"
                            data={[
                                { label: 'Pertinence', value: 'relevance' },
                                { label: 'Plus récent', value: 'year_desc' },
                                { label: 'Plus ancien', value: 'year_asc' },
                            ]}
                            onChange={(v) => setSortBy((v ?? 'relevance') as typeof sortBy)}
                            size="xs"
                            style={{ minWidth: 130 }}
                            value={sortBy}
                        />
                    )}
                </Group>
            </div>

            {/* Results */}
            <ScrollArea style={{ flex: 1 }}>
                {viewMode === 'playlists' && <PlaylistImportPanel />}
                {viewMode === 'downloads' && <WebDownloadsPanel />}
                {isSearchMode && !query && (
                    <Center h={200}>
                        <Text isMuted>Enter a search query to find {viewMode}</Text>
                    </Center>
                )}
                {isSearchMode && query && isInitialLoading && (
                    <Center h={200}>
                        <Text isMuted>Searching…</Text>
                    </Center>
                )}
                {isSearchMode && isError && (
                    <Center h={200}>
                        <Text style={{ color: 'var(--mantine-color-red-6)' }}>
                            {error instanceof Error ? error.message : 'Search failed'}
                        </Text>
                    </Center>
                )}
                {isSearchMode && !isInitialLoading && resultCount === 0 && query && !isError && (
                    <Center h={200}>
                        <Text isMuted>No results found</Text>
                    </Center>
                )}

                {/* Track results */}
                {viewMode === 'tracks' && sortedResults.length > 0 && (
                    <Stack gap={0}>
                        {sortedResults.map((result) => (
                            <ResultRow
                                isPlaying={playingId === result.id}
                                key={result.id}
                                onPlay={handlePlay}
                                result={result}
                            />
                        ))}
                        {hasMore && (
                            <Center py="md">
                                <Button
                                    loading={isFetching}
                                    onClick={handleLoadMore}
                                    variant="default"
                                >
                                    Load more
                                </Button>
                            </Center>
                        )}
                        {!hasMore && sortedResults.length > 0 && (
                            <Center py="md">
                                <Text isMuted size="xs">
                                    {sortedResults.length} results
                                </Text>
                            </Center>
                        )}
                    </Stack>
                )}

                {/* Artist results */}
                {viewMode === 'artists' && artists.length > 0 && (
                    <Stack gap={0}>
                        {artists.map((artist) => (
                            <ArtistRow artist={artist} key={artist.id} />
                        ))}
                    </Stack>
                )}

                {/* Album results */}
                {viewMode === 'albums' && sortedAlbums.length > 0 && (
                    <Stack gap={0}>
                        {sortedAlbums.map((album) => (
                            <AlbumRow
                                album={album}
                                isExpanded={expandedAlbums.has(album.deezer_id)}
                                key={album.deezer_id}
                                onPlay={handlePlay}
                                onToggle={handleToggleAlbum}
                                playingId={playingId}
                            />
                        ))}
                        {hasMore && (
                            <Center py="md">
                                <Button
                                    loading={isFetching}
                                    onClick={handleLoadMore}
                                    variant="default"
                                >
                                    Load more
                                </Button>
                            </Center>
                        )}
                        {!hasMore && sortedAlbums.length > 0 && (
                            <Center py="md">
                                <Text isMuted size="xs">
                                    {sortedAlbums.length} albums
                                </Text>
                            </Center>
                        )}
                    </Stack>
                )}
            </ScrollArea>
        </Stack>
    );
};
