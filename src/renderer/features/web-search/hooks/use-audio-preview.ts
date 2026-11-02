import { useCallback, useEffect, useRef, useState } from 'react';

import { NAS_LAN_BASE, nasFetch } from '../nas-fetch';

/**
 * Shared 30s-preview player for web-search / new-releases rows.
 * Only one preview plays at a time. Pass a `resetKey` (e.g. the search query)
 * that, when changed, stops any current playback.
 */
export const useAudioPreview = (resetKey?: unknown) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<null | string>(null);
    // Invalide un chargement en cours quand on arrête ou change d'extrait
    const tokenRef = useRef(0);
    const [playingId, setPlayingId] = useState<null | string>(null);

    const stop = useCallback(() => {
        tokenRef.current += 1;
        audioRef.current?.pause();
        audioRef.current = null;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
        setPlayingId(null);
    }, []);

    const handlePlay = useCallback(
        (id: string, previewUrl: string) => {
            const wasPlaying = playingId === id;
            stop();
            if (wasPlaying) return;

            const token = tokenRef.current;
            setPlayingId(id);

            const load = async () => {
                let src = previewUrl;
                // Extraits YouTube servis par l'API du NAS : nasFetch choisit le
                // réseau local ou le domaine public (identifiant en en-tête, pas
                // dans l'URL).
                if (previewUrl.startsWith(NAS_LAN_BASE)) {
                    const res = await nasFetch(previewUrl.slice(NAS_LAN_BASE.length));
                    if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
                    const blob = await res.blob();
                    if (token !== tokenRef.current) return;
                    src = URL.createObjectURL(blob);
                    objectUrlRef.current = src;
                }
                if (token !== tokenRef.current) return;

                const audio = new Audio(src);
                audio.volume = 0.004;
                audio.onended = () => setPlayingId(null);
                audioRef.current = audio;
                await audio.play();
            };

            load().catch(() => {
                if (token === tokenRef.current) setPlayingId(null);
            });
        },
        [playingId, stop],
    );

    // Arrêt au changement de resetKey et au démontage
    useEffect(() => stop, [resetKey, stop]);

    return { handlePlay, playingId, stop };
};
