import { create } from 'zustand';

import { nasFetch } from '../nas-fetch';

// ── Types ──────────────────────────────────────────────────────────────────

/** Réponse de `GET /playlist/import/{job_id}` et `GET /playlist/imports`. */
export interface PlaylistImportJob {
    already_present?: number;
    concurrency?: number;
    downloaded?: number;
    error?: null | string;
    failed?: number;
    finished_at?: null | string;
    job_id: string;
    m3u_path?: null | string;
    navidrome_playlist_id?: null | string;
    navidrome_song_count?: null | number;
    playlist_id?: string;
    playlist_name?: string;
    playlist_url?: string;
    progress?: number;
    provider?: string;
    started_at?: null | string;
    status: PlaylistImportStatus;
    total?: number;
    /** Absent de la vue liste, qui ne renvoie pas le détail piste par piste. */
    tracks?: PlaylistImportJobTrack[];
    truncated?: boolean;
    warning?: null | string;
}

export interface PlaylistImportJobTrack {
    artist?: string;
    error?: null | string;
    file?: null | string;
    status?: string;
    title?: string;
}

/** Réponse de `POST /playlist/import` (schéma `PlaylistImportResponse`). */
export interface PlaylistImportStartResponse {
    job_id: string;
    playlist_name: string;
    provider: string;
    status: string;
    total: number;
    truncated: boolean;
    warning: null | string;
}

/**
 * Un job passe par plusieurs états intermédiaires côté NAS (téléchargement,
 * écriture du m3u, scans Navidrome). Seuls `done` et `error` sont terminaux :
 * tout le reste est traité comme « en cours » afin de ne pas casser si le
 * serveur introduit un nouvel état.
 */
export type PlaylistImportStatus = 'done' | 'error' | (string & {});

/** Réponse de `GET /playlist/info` (schéma `PlaylistSource`). */
export interface PlaylistSource {
    name: string;
    playlist_id: string;
    provider: string;
    track_count: number;
    tracks: PlaylistSourceTrack[];
    truncated: boolean;
}

export interface PlaylistSourceTrack {
    album?: string;
    artist: string;
    cover_url?: string;
    deezer_id?: null | number;
    duration?: number;
    title: string;
}

const TERMINAL_STATUSES = new Set<string>(['done', 'error']);

export const isTerminal = (status: string): boolean => TERMINAL_STATUSES.has(status);

/** Titres réellement obtenus : téléchargés + déjà présents en bibliothèque. */
export const acquiredCount = (job: PlaylistImportJob): number =>
    (job.downloaded ?? 0) + (job.already_present ?? 0);

// ── Appels API ─────────────────────────────────────────────────────────────

/** Remonte le `detail` de FastAPI tel quel : il est déjà affichable. */
const readError = async (res: Response): Promise<string> => {
    try {
        const body = await res.json();
        if (typeof body?.detail === 'string') return body.detail;
        if (body?.detail) return JSON.stringify(body.detail);
    } catch {
        /* corps non-JSON : on retombe sur le statut HTTP */
    }
    return `HTTP ${res.status} ${res.statusText}`;
};

export const fetchPlaylistInfo = async (url: string): Promise<PlaylistSource> => {
    const res = await nasFetch(`/playlist/info?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
};

/**
 * Toujours en POST : le GET homonyme écrit sur le disque et n'existe que pour
 * être collé dans un navigateur.
 */
export const startPlaylistImport = async (
    url: string,
    name?: string,
): Promise<PlaylistImportStartResponse> => {
    const res = await nasFetch(`/playlist/import`, {
        body: JSON.stringify(name ? { name, url } : { url }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
};

export const fetchPlaylistImportJob = async (jobId: string): Promise<PlaylistImportJob> => {
    const res = await nasFetch(`/playlist/import/${jobId}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
};

export const fetchPlaylistImports = async (): Promise<PlaylistImportJob[]> => {
    const res = await nasFetch(`/playlist/imports`);
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return Array.isArray(data) ? data : [];
};

// ── Store ──────────────────────────────────────────────────────────────────

interface PlaylistImportStore {
    /**
     * Job suivi en arrière-plan. Vit dans un store global (et non dans le
     * composant) pour que la progression survive à la navigation.
     */
    activeJob: null | PlaylistImportJob;
    clearActiveJob: () => void;
    setActiveJob: (job: null | PlaylistImportJob) => void;
}

export const usePlaylistImportStore = create<PlaylistImportStore>((set) => ({
    activeJob: null,

    clearActiveJob: () => set({ activeJob: null }),

    setActiveJob: (job) => set({ activeJob: job }),
}));
