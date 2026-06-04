import { create } from 'zustand';

export const NAS_API_BASE = 'http://192.168.1.20:8787';

// ── Types partagés ─────────────────────────────────────────────────────────

export type DownloadStatus =
    | 'already_exists'
    | 'done'
    | 'downloading'
    | 'error'
    | 'normalizing'
    | 'scanning'
    | 'searching'
    | 'searching_youtube'
    | 'tagging';

export interface DownloadStatusResponse {
    artist: string;
    error: string | null;
    file: string | null;
    progress: number;
    status: DownloadStatus;
    title: string;
}

export type DownloadState =
    | { status: 'idle' }
    | { status: 'starting' }
    | { downloadId: string; message: string; progress: number; status: 'active' }
    | { alreadyExisted?: boolean; status: 'done' }
    | { message: string; status: 'error' };

export interface ActiveDownload {
    artist: string;
    downloadId: string;
    state: DownloadState;
    title: string;
}

// ── Store ──────────────────────────────────────────────────────────────────

interface WebSearchDownloadStore {
    // clé : result.id (stable par résultat de recherche)
    downloads: Record<string, ActiveDownload>;
    removeDownload: (resultId: string) => void;
    setDownload: (resultId: string, download: ActiveDownload) => void;
    updateDownloadState: (resultId: string, state: DownloadState) => void;
}

export const useWebSearchDownloadStore = create<WebSearchDownloadStore>((set) => ({
    downloads: {},

    removeDownload: (resultId) =>
        set((s) => {
            const { [resultId]: _, ...rest } = s.downloads;
            return { downloads: rest };
        }),

    setDownload: (resultId, download) =>
        set((s) => ({ downloads: { ...s.downloads, [resultId]: download } })),

    updateDownloadState: (resultId, state) =>
        set((s) => {
            const existing = s.downloads[resultId];
            if (!existing) return s;
            return { downloads: { ...s.downloads, [resultId]: { ...existing, state } } };
        }),
}));
