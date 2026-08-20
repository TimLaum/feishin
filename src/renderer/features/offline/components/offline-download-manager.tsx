import isElectron from 'is-electron';
import { useEffect, useRef } from 'react';

import { api } from '/@/renderer/api';
import {
    offlineActions,
    offlineKey,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';
import { toast } from '/@/shared/components/toast/toast';

const MAX_CONCURRENT_DOWNLOADS = 2;

const offlineApi = isElectron() ? window.api.offlineDownloads : null;

/**
 * Monté au niveau du layout : fait avancer la file de téléchargements
 * hors ligne en arrière-plan, quelle que soit la page affichée.
 */
export const OfflineDownloadManager = () => {
    const entries = useOfflineStoreBase((s) => s.entries);
    // Clés en cours de traitement dans CE composant (garde anti-doublon,
    // couvre l'intervalle entre le déclenchement et la mise à jour du store)
    const inFlightRef = useRef<Set<string>>(new Set());

    // Init après hydratation : reprise des téléchargements interrompus
    // + vérification que les fichiers marqués "done" existent toujours
    useEffect(() => {
        if (!offlineApi) return undefined;

        const init = async () => {
            const { markError, resetInterrupted } = offlineActions();
            resetInterrupted();

            const doneEntries = Object.entries(useOfflineStoreBase.getState().entries).filter(
                ([, entry]) => entry.status === 'done' && entry.relPath,
            );
            if (doneEntries.length === 0) return;

            try {
                const relPaths = doneEntries.map(([, entry]) => entry.relPath!);
                const result = await offlineApi.verify(relPaths);
                for (const [key, entry] of doneEntries) {
                    if (entry.relPath && result[entry.relPath] === false) {
                        markError(key, 'File missing on disk');
                    }
                }
            } catch {
                // vérification best-effort
            }
        };

        const persistApi = useOfflineStoreBase.persist;
        if (persistApi.hasHydrated()) {
            init();
            return undefined;
        }
        const unsub = persistApi.onFinishHydration(() => init());
        return unsub;
    }, []);

    // Progression envoyée par le main process
    useEffect(() => {
        if (!offlineApi) return undefined;

        const unsubscribe = offlineApi.onProgress(({ key, received, total }) => {
            if (total > 0) {
                offlineActions().setProgress(key, Math.round((received / total) * 100));
            }
        });

        return unsubscribe;
    }, []);

    // Démarre les téléchargements en attente (concurrence limitée)
    useEffect(() => {
        if (!offlineApi) return;

        const downloading = Object.values(entries).filter((e) => e.status === 'downloading').length;
        const slots = MAX_CONCURRENT_DOWNLOADS - downloading - inFlightRef.current.size;
        if (slots <= 0) return;

        const queued = Object.entries(entries)
            .filter(([key, entry]) => entry.status === 'queued' && !inFlightRef.current.has(key))
            .sort(([, a], [, b]) => a.addedAt - b.addedAt)
            .slice(0, slots);

        for (const [key, entry] of queued) {
            inFlightRef.current.add(key);

            const run = async () => {
                const { markDone, markDownloading, markError } = offlineActions();
                const { song } = entry;

                try {
                    markDownloading(key);

                    const url = api.controller.getDownloadUrl({
                        apiClientProps: { serverId: song._serverId },
                        query: { id: song.id },
                    });

                    if (!url) {
                        throw new Error('Unable to resolve download URL');
                    }

                    const result = await offlineApi.download({
                        container: song.container,
                        coverUrl: song.imageUrl,
                        key: offlineKey(song._serverId, song.id),
                        url,
                    });

                    markDone(key, {
                        coverRelPath: result.coverRelPath,
                        filePath: result.filePath,
                        relPath: result.relPath,
                        size: result.size,
                    });
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Download failed';
                    markError(key, message);
                    toast.error({
                        message: `${song.name} — ${message}`,
                        title: 'Offline download failed',
                    });
                } finally {
                    inFlightRef.current.delete(key);
                }
            };

            run();
        }
    }, [entries]);

    return null;
};
