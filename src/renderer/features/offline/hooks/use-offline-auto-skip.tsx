import { useEffect, useRef, useState } from 'react';

import { isSongDownloaded } from '/@/renderer/features/offline/store/offline-store';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { usePlayerSong, usePlayerStatus, usePlayerStoreBase } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { PlayerStatus } from '/@/shared/types/types';

const SKIP_DELAY_MS = 350;

/**
 * Hors connexion, saute automatiquement les titres de la file qui ne sont
 * pas téléchargés. Si aucun titre téléchargé n'est trouvé après un tour
 * complet de la file, met la lecture en pause.
 */
export const OfflineAutoSkipHook = () => {
    const currentSong = usePlayerSong();
    const playerStatus = usePlayerStatus();
    const { mediaNext, mediaPause } = usePlayer();

    const skipsRef = useRef(0);
    const toastShownRef = useRef(false);

    const [isOnline, setIsOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (isOnline) {
            skipsRef.current = 0;
            toastShownRef.current = false;
            return undefined;
        }

        if (playerStatus !== PlayerStatus.PLAYING || !currentSong?._serverId) {
            return undefined;
        }

        if (isSongDownloaded(currentSong._serverId, currentSong.id)) {
            skipsRef.current = 0;
            return undefined;
        }

        // Un tour complet de la file sans titre téléchargé : on s'arrête
        const queueLength = usePlayerStoreBase.getState().queue.default.length;
        if (skipsRef.current >= queueLength) {
            skipsRef.current = 0;
            mediaPause();
            toast.warn({
                message: 'No downloaded song in the queue',
                title: 'Offline mode',
            });
            return undefined;
        }

        const timer = setTimeout(() => {
            skipsRef.current += 1;
            if (!toastShownRef.current) {
                toastShownRef.current = true;
                toast.info({
                    message: 'Skipping songs that are not downloaded',
                    title: 'Offline mode',
                });
            }
            mediaNext();
        }, SKIP_DELAY_MS);

        return () => clearTimeout(timer);
    }, [
        currentSong?._serverId,
        currentSong?._uniqueId,
        currentSong?.id,
        isOnline,
        mediaNext,
        mediaPause,
        playerStatus,
    ]);

    return null;
};
