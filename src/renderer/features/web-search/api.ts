import type { AlbumSearchResult, WebSearchResult } from './components/web-search-content';

import { nasFetch } from './nas-fetch';

// ── Types (miroir des modèles de download_api.py) ──────────────────────────

export interface ArtistDetail extends ArtistResult {
    albums: ArtistRelease[];
    compilations: ArtistRelease[];
    deezer_id: number;
    related_artists: ArtistResult[];
    singles: ArtistRelease[];
    top_tracks: WebSearchResult[];
}

export interface ArtistRelease extends AlbumSearchResult {
    fans?: null | number;
    record_type: RecordType;
    release_date?: null | string;
}

export interface ArtistResult {
    deezer_id?: null | number;
    id: string;
    name: string;
    nb_albums?: null | number;
    nb_fans?: null | number;
    picture_url: string;
    source: string;
}

export interface BatchFailure {
    artist: string;
    error: null | string;
    title: string;
}

// Lot côté serveur : titres explicites, albums dépliés par l'API, ou
// discographie d'un artiste. Dédoublonné et annulable côté serveur.
export interface BatchRequest {
    album_ids?: number[];
    artist_id?: number;
    name: string;
    record_types?: RecordType[];
    skip_instrumentals?: boolean;
    tracks?: DownloadRequest[];
}

export type BatchStatus = 'cancelled' | 'done' | 'error' | 'preparing' | 'running';

export interface BatchSummary {
    already_present: number;
    created_at: number;
    done: number;
    downloaded: number;
    duplicates: number;
    error: null | string;
    eta_seconds: null | number;
    failed: number;
    failures: BatchFailure[];
    instrumentals_skipped: number;
    job_id: string;
    name: string;
    release_errors: number;
    releases_read: number;
    releases_total: number;
    running: string[];
    skipped: number;
    status: BatchStatus;
    total: number;
    truncated: number;
}

export interface DownloadRequest {
    album: string;
    artist: string;
    cover_url: string;
    deezer_id: null | number;
    duration: number;
    source: string;
    title: string;
}

export type RecordType = 'album' | 'compile' | 'ep' | 'single';

// ── Helpers ────────────────────────────────────────────────────────────────

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await nasFetch(path, init);
    if (!res.ok) {
        let message = `${res.status} ${res.statusText}`;
        try {
            const body = await res.json();
            if (body?.detail) message = String(body.detail);
        } catch {
            // corps non JSON : on garde le statut HTTP
        }
        throw new Error(message);
    }
    return res.json();
};

const postJson = <T>(path: string, body: unknown) =>
    request<T>(path, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
    });

// Même normalisation que norm() de la page mobile et _norm_key_part() de l'API.
export const normalizeName = (s: null | string | undefined): string =>
    (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export const trackKey = (t: Pick<WebSearchResult, 'artist' | 'title'>): string =>
    `${normalizeName(t.artist)}|${normalizeName(t.title)}`;

export const toDownloadRequest = (t: WebSearchResult): DownloadRequest => ({
    album: t.album || t.title,
    artist: t.artist,
    cover_url: t.cover_url || '',
    deezer_id: t.deezer_id ?? null,
    duration: t.duration || 0,
    source: t.source || 'deezer',
    title: t.title,
});

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
    album: 'Album',
    compile: 'Compilation',
    ep: 'EP',
    single: 'Single',
};

export const formatFans = (n: null | number | undefined): string =>
    n == null
        ? ''
        : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, notation: 'compact' }).format(n)} fans`;

export const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

// ── Artistes ───────────────────────────────────────────────────────────────

export const searchArtists = (query: string, limit = 20) =>
    request<ArtistResult[]>(
        `/search/artists?${new URLSearchParams({ limit: String(limit), q: query })}`,
    );

export const fetchArtist = (deezerId: number, top = 50) =>
    request<ArtistDetail>(`/artist/${deezerId}?top=${top}`);

// Préférer l'homonyme exact : Deezer met parfois un artiste plus connu en tête.
export const findArtistByName = async (name: string): Promise<ArtistResult | undefined> => {
    const results = await searchArtists(name, 5);
    return results.find((a) => normalizeName(a.name) === normalizeName(name)) ?? results[0];
};

// ── Lots ───────────────────────────────────────────────────────────────────

export const startBatch = (req: BatchRequest) =>
    postJson<{ job_id: string; name: string; status: BatchStatus }>('/batch', req);

export const fetchBatches = () => request<BatchSummary[]>('/batches');

export const cancelBatch = (jobId: string) => postJson<BatchSummary>(`/batch/${jobId}/cancel`, {});
