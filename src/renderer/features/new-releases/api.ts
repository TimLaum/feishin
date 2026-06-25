import { AlbumSearchResult } from '/@/renderer/features/web-search/components/web-search-content';
import { NAS_API_BASE } from '/@/renderer/features/web-search/store/web-search-download-store';

export interface NewReleaseAlbum {
    artist: string;
    cover_url: string;
    deezer_id: number;
    id: string;
    release_date?: string;
    title: string;
    tracks_url?: string;
    year?: null | number | string;
}

export interface NewReleaseGenreGroup {
    albums: NewReleaseAlbum[];
    count: number;
    genre: string;
    genre_id: number;
}

export const NEW_RELEASES_DAYS = 7;
export const NEW_RELEASES_LIMIT = 50;

// Time-window options for the New Releases header (label / days).
export const DAYS_OPTIONS = [
    { label: '1 week', value: '7' },
    { label: '2 weeks', value: '14' },
    { label: '3 weeks', value: '21' },
    { label: '1 month', value: '30' },
    { label: '2 months', value: '60' },
];

// Results-per-genre options.
export const LIMIT_OPTIONS = [
    { label: '20', value: '20' },
    { label: '50', value: '50' },
    { label: '100', value: '100' },
    { label: '200', value: '200' },
];

export const fetchNewReleases = async (
    days = NEW_RELEASES_DAYS,
    limitPerGenre = NEW_RELEASES_LIMIT,
): Promise<NewReleaseGenreGroup[]> => {
    const res = await fetch(
        `${NAS_API_BASE}/new-releases?days=${days}&limit_per_genre=${limitPerGenre}`,
    );
    if (!res.ok) throw new Error(`Failed to load new releases: ${res.statusText}`);
    return res.json();
};

// AlbumRow / track loading (shared with web-search) expects an AlbumSearchResult shape.
export const toAlbumSearchResult = (a: NewReleaseAlbum): AlbumSearchResult => ({
    artist: a.artist,
    cover_url: a.cover_url,
    deezer_id: a.deezer_id,
    id: a.id,
    source: 'deezer',
    title: a.title,
    year: a.year != null ? String(a.year) : a.release_date ? a.release_date.slice(0, 4) : null,
});

// Stable pseudo-random cover pick per genre (varies across genres, stable across renders).
export const pickGenreCover = (group: NewReleaseGenreGroup): string | undefined => {
    const withCover = group.albums.filter((a) => a.cover_url);
    if (withCover.length === 0) return undefined;
    return withCover[group.genre_id % withCover.length].cover_url;
};
