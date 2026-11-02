import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { api } from '/@/renderer/api';
import {
    getOfflinePlaybackUrl,
    offlineKey,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';
import { TranscodingConfig, usePlaybackType } from '/@/renderer/store';
import { QueueSong } from '/@/shared/types/domain-types';

export function useSongUrl(
    song: QueueSong | undefined,
    current: boolean,
    transcode: Partial<TranscodingConfig>,
): string | undefined {
    const prior = useRef(['', '']);
    const shouldReusePrior = Boolean(
        song?._serverId && current && prior.current[0] === song._uniqueId && prior.current[1],
    );

    // Morceau téléchargé pour l'écoute hors ligne : lecture locale. Le sélecteur
    // ne sert qu'à re-rendre quand le téléchargement se termine.
    const isDownloaded = useOfflineStoreBase((s) =>
        song?._serverId ? s.entries[offlineKey(song._serverId, song.id)]?.status === 'done' : false,
    );
    // getOfflinePlaybackUrl dépend du type de lecteur : re-rendu s'il change
    usePlaybackType();
    const offlinePlaybackUrl = isDownloaded && song ? getOfflinePlaybackUrl(song) : undefined;

    const { data: queryStreamUrl } = useQuery({
        enabled: Boolean(song?._serverId) && !shouldReusePrior && !offlinePlaybackUrl,
        queryFn: () =>
            api.controller.getStreamUrl({
                apiClientProps: { serverId: song!._serverId },
                query: {
                    bitrate: transcode.bitrate,
                    format: transcode.format,
                    id: song!.id,
                    maxSampleRate: transcode.maxSampleRate,
                    transcode: transcode.enabled ?? false,
                },
            }),
        queryKey: [
            song?._serverId,
            'stream-url',
            song?.id,
            shouldReusePrior ? 'reuse-prior' : transcode.bitrate,
            shouldReusePrior ? 'reuse-prior' : transcode.format,
            shouldReusePrior ? 'reuse-prior' : transcode.maxSampleRate,
            shouldReusePrior ? 'reuse-prior' : transcode.enabled,
        ] as const,
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
            return;
        }

        const resolvedUrl = offlinePlaybackUrl ?? queryStreamUrl;
        if (!resolvedUrl) {
            return;
        }

        // Save resolved URL to avoid restarting current track on transcode setting changes,
        // or when its offline download completes mid-play.
        if (prior.current[0] === song._uniqueId && prior.current[1]) {
            return;
        }

        prior.current = [song._uniqueId, resolvedUrl];
    }, [song?._serverId, song?._uniqueId, queryStreamUrl, offlinePlaybackUrl]);

    useEffect(() => {
        if (!song?._serverId) {
            prior.current = ['', ''];
        }
    }, [song?._serverId]);

    if (shouldReusePrior) {
        return prior.current[1];
    }

    return offlinePlaybackUrl ?? queryStreamUrl;
}

export const getSongUrl = async (
    song: QueueSong,
    transcode: Partial<TranscodingConfig>,
    skipAutoTranscode?: boolean,
    forRenderer?: boolean,
    startTime?: number,
) => {
    // Morceau téléchargé pour l'écoute hors ligne : lecture locale
    const offlineUrl = getOfflinePlaybackUrl(song);
    if (offlineUrl) {
        return offlineUrl;
    }

    const url = await api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: {
            bitrate: transcode.bitrate,
            container: song.container,
            format: transcode.format,
            forRenderer,
            id: song.id,
            maxSampleRate: transcode.maxSampleRate,
            sampleRate: song.sampleRate,
            skipAutoTranscode,
            startTime,
            transcode: transcode.enabled ?? false,
        },
    });

    return url;
};
