import { useEffect, useRef } from 'react';

import { toast } from '/@/shared/components/toast/toast';

import {
    DownloadStatusResponse,
    NAS_API_BASE,
    useWebSearchDownloadStore,
} from '../store/web-search-download-store';

const STATUS_LABEL: Record<string, string> = {
    already_exists: 'Already exists',
    done: 'Done',
    downloading: 'Downloading…',
    error: 'Error',
    normalizing: 'Normalizing…',
    scanning: 'Scanning library…',
    searching: 'Searching…',
    searching_youtube: 'Searching YouTube…',
    tagging: 'Tagging…',
};

const fetchStatus = async (downloadId: string): Promise<DownloadStatusResponse> => {
    const res = await fetch(`${NAS_API_BASE}/status/${downloadId}`);
    if (!res.ok) throw new Error(`Status failed: ${res.statusText}`);
    return res.json();
};

/**
 * Monté au niveau du layout — fait tourner le polling de tous les téléchargements
 * actifs en arrière-plan, même quand l'utilisateur navigue sur un autre onglet.
 */
export const DownloadManager = () => {
    const downloads = useWebSearchDownloadStore((s) => s.downloads);
    const updateDownloadState = useWebSearchDownloadStore((s) => s.updateDownloadState);

    const intervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    useEffect(() => {
        // Démarrer le polling pour les nouveaux downloads actifs
        Object.entries(downloads).forEach(([resultId, download]) => {
            if (download.state.status === 'active' && !intervalsRef.current[resultId]) {
                const { downloadId, title, artist } = download;

                intervalsRef.current[resultId] = setInterval(async () => {
                    try {
                        const data = await fetchStatus(downloadId);

                        if (data.status === 'done' || data.status === 'already_exists') {
                            clearInterval(intervalsRef.current[resultId]);
                            delete intervalsRef.current[resultId];
                            updateDownloadState(resultId, {
                                alreadyExisted: data.status === 'already_exists',
                                status: 'done',
                            });
                            toast.success({
                                message: `${title} — ${artist}`,
                                title:
                                    data.status === 'already_exists'
                                        ? 'Already in library'
                                        : 'Download complete',
                            });
                        } else if (data.status === 'error') {
                            clearInterval(intervalsRef.current[resultId]);
                            delete intervalsRef.current[resultId];
                            updateDownloadState(resultId, {
                                message: data.error ?? 'Unknown error',
                                status: 'error',
                            });
                            toast.error({
                                message: `${title} — ${data.error ?? 'Unknown error'}`,
                                title: 'Download failed',
                            });
                        } else {
                            updateDownloadState(resultId, {
                                downloadId,
                                message: STATUS_LABEL[data.status] ?? data.status,
                                progress: data.progress,
                                status: 'active',
                            });
                        }
                    } catch (err) {
                        clearInterval(intervalsRef.current[resultId]);
                        delete intervalsRef.current[resultId];
                        updateDownloadState(resultId, {
                            message: err instanceof Error ? err.message : 'Polling error',
                            status: 'error',
                        });
                    }
                }, 2000);
            }

            // Nettoyer les intervals pour les downloads terminés/en erreur
            if (
                ['done', 'error', 'idle'].includes(download.state.status) &&
                intervalsRef.current[resultId]
            ) {
                clearInterval(intervalsRef.current[resultId]);
                delete intervalsRef.current[resultId];
            }
        });

        // Nettoyer les intervals des downloads supprimés du store
        Object.keys(intervalsRef.current).forEach((resultId) => {
            if (!downloads[resultId]) {
                clearInterval(intervalsRef.current[resultId]);
                delete intervalsRef.current[resultId];
            }
        });
    }, [downloads, updateDownloadState]);

    // Cleanup au démontage
    useEffect(() => {
        return () => {
            Object.values(intervalsRef.current).forEach(clearInterval);
        };
    }, []);

    return null;
};
