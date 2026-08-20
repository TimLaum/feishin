import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
    acquiredCount,
    fetchPlaylistImportJob,
    isTerminal,
    PlaylistImportJob,
    usePlaylistImportStore,
} from '../store/playlist-import-store';

import { useCurrentServerId } from '/@/renderer/store/auth.store';
import { toast } from '/@/shared/components/toast/toast';

const POLL_INTERVAL_MS = 3000;

const summarize = (job: PlaylistImportJob): string => {
    const parts = [`${acquiredCount(job)}/${job.total ?? 0} tracks`];
    if (job.failed) parts.push(`${job.failed} failed`);
    return parts.join(' · ');
};

/**
 * Monté au niveau du layout : fait tourner le polling de l'import de playlist
 * en arrière-plan, pour que la progression survive à la navigation.
 */
export const PlaylistImportManager = () => {
    const activeJob = usePlaylistImportStore((s) => s.activeJob);
    const setActiveJob = usePlaylistImportStore((s) => s.setActiveJob);
    const serverId = useCurrentServerId();
    const queryClient = useQueryClient();

    // Sélecteur primitif : l'effet ne se relance pas à chaque tick de progression.
    const jobId = activeJob && !isTerminal(activeJob.status) ? activeJob.job_id : null;

    useEffect(() => {
        if (!jobId) return undefined;

        let stopped = false;

        const finish = (job: PlaylistImportJob) => {
            setActiveJob(job);
            queryClient.invalidateQueries({ queryKey: ['playlist-imports'] });

            if (job.status === 'error') {
                toast.error({
                    message: job.error ?? job.warning ?? summarize(job),
                    title: `Import failed — ${job.playlist_name ?? 'playlist'}`,
                });
                return;
            }

            toast.success({
                message: summarize(job),
                title: `Playlist imported — ${job.playlist_name ?? 'playlist'}`,
            });

            // Le m3u n'est visible qu'après le scan Navidrome : cet id est le
            // seul signal fiable que la playlist existe vraiment côté serveur.
            if (job.navidrome_playlist_id) {
                queryClient.invalidateQueries({ queryKey: [serverId, 'playlists'] });
            }
        };

        const tick = async () => {
            try {
                const job = await fetchPlaylistImportJob(jobId);
                if (stopped) return;

                if (isTerminal(job.status)) {
                    finish(job);
                } else {
                    setActiveJob(job);
                }
            } catch (err) {
                if (stopped) return;
                const message = err instanceof Error ? err.message : 'Polling error';
                setActiveJob({ error: message, job_id: jobId, status: 'error' });
                toast.error({ message, title: 'Playlist import' });
            }
        };

        void tick();
        const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);

        return () => {
            stopped = true;
            clearInterval(interval);
        };
    }, [jobId, queryClient, serverId, setActiveJob]);

    return null;
};
