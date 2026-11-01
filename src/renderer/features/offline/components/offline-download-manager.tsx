import isElectron from 'is-electron';
import { useEffect, useMemo, useRef } from 'react';

import i18n from '/@/i18n/i18n';
import { api } from '/@/renderer/api';
import {
    offlineActions,
    offlineKey,
    useOfflineStoreBase,
    useServerUnreachable,
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
    const pendingDeletions = useOfflineStoreBase((s) => s.pendingDeletions);
    const settings = useOfflineStoreBase((s) => s.settings);
    const serverUnreachable = useServerUnreachable();
    // Clés en cours de traitement dans CE composant (garde anti-doublon,
    // couvre l'intervalle entre le déclenchement et la mise à jour du store)
    const inFlightRef = useRef<Set<string>>(new Set());
    const quotaToastRef = useRef(false);

    const totalSize = useMemo(
        () => Object.values(entries).reduce((total, entry) => total + (entry.size || 0), 0),
        [entries],
    );

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

    // Fichiers devenus orphelins (désabonnement, titre retiré d'une playlist,
    // suppression manuelle) : effacement disque puis vidage de la file
    useEffect(() => {
        if (!offlineApi || pendingDeletions.length === 0) return;

        const paths = [...pendingDeletions];
        offlineApi
            .remove(paths)
            .catch(() => {})
            .finally(() => offlineActions().drainDeletions(paths));
    }, [pendingDeletions]);

    // Retour du serveur : les titres tombés en erreur pendant la coupure repartent
    const wasUnreachableRef = useRef(serverUnreachable);
    useEffect(() => {
        if (wasUnreachableRef.current && !serverUnreachable) {
            const { requeue } = offlineActions();
            for (const [key, entry] of Object.entries(useOfflineStoreBase.getState().entries)) {
                if (entry.status === 'error') requeue(key);
            }
        }
        wasUnreachableRef.current = serverUnreachable;
    }, [serverUnreachable]);

    // Démarre les téléchargements en attente (concurrence limitée)
    useEffect(() => {
        // Serveur hors d'atteinte : la file attend son retour au lieu d'échouer en boucle
        if (!offlineApi || serverUnreachable || !navigator.onLine) return;

        // Limite de stockage : on laisse finir ce qui tourne, on n'en démarre plus
        if (settings.maxSizeBytes > 0 && totalSize >= settings.maxSizeBytes) {
            if (!quotaToastRef.current) {
                quotaToastRef.current = true;
                toast.warn({ message: i18n.t('page.offline.maxSizeReached') });
            }
            return;
        }
        quotaToastRef.current = false;

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

                    // Qualité "originale" : le fichier tel quel. Sinon on demande au
                    // serveur un flux transcodé, bien plus léger sur le disque.
                    const isTranscoded = settings.quality === 'transcoded';

                    const url = isTranscoded
                        ? await api.controller.getStreamUrl({
                              apiClientProps: { serverId: song._serverId },
                              query: {
                                  bitrate: settings.bitrate,
                                  format: settings.format,
                                  id: song.id,
                                  transcode: true,
                              },
                          })
                        : api.controller.getDownloadUrl({
                              apiClientProps: { serverId: song._serverId },
                              query: { id: song.id },
                          });

                    if (!url) {
                        throw new Error('Unable to resolve download URL');
                    }

                    const result = await offlineApi.download({
                        container: isTranscoded ? settings.format : song.container,
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
                    // Coupure en cours de route : pas d'avalanche de toasts, la reprise est auto
                    if (navigator.onLine && !useOfflineStoreBase.getState().serverUnreachable) {
                        toast.error({
                            message: `${song.name} - ${message}`,
                            title: i18n.t('page.offline.downloadFailed'),
                        });
                    }
                } finally {
                    inFlightRef.current.delete(key);
                }
            };

            run();
        }
    }, [entries, serverUnreachable, settings, totalSize]);

    return null;
};
