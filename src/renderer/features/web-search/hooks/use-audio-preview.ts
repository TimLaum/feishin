import { useCallback, useEffect, useRef, useState } from 'react';

import { nasMediaUrl } from '../nas-fetch';

/**
 * Shared 30s-preview player for web-search / new-releases rows.
 * Only one preview plays at a time. Pass a `resetKey` (e.g. the search query)
 * that, when changed, stops any current playback.
 */
export const useAudioPreview = (resetKey?: unknown) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playingId, setPlayingId] = useState<null | string>(null);

    const stop = useCallback(() => {
        audioRef.current?.pause();
        audioRef.current = null;
        setPlayingId(null);
    }, []);

    const handlePlay = useCallback(
        (id: string, previewUrl: string) => {
            if (playingId === id) {
                stop();
            } else {
                audioRef.current?.pause();
                const audio = new Audio(nasMediaUrl(previewUrl));
                audio.volume = 0.004;
                audio.play();
                audio.onended = () => setPlayingId(null);
                audioRef.current = audio;
                setPlayingId(id);
            }
        },
        [playingId, stop],
    );

    useEffect(() => {
        stop();
    }, [resetKey, stop]);

    return { handlePlay, playingId, stop };
};
