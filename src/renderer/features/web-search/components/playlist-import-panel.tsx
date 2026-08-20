import { Progress } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import {
    RiAlertLine,
    RiErrorWarningLine,
    RiExternalLinkLine,
    RiInformationLine,
} from 'react-icons/ri';
import { generatePath, useNavigate } from 'react-router';

import {
    acquiredCount,
    fetchPlaylistImports,
    fetchPlaylistInfo,
    isTerminal,
    PlaylistImportJob,
    PlaylistImportJobTrack,
    PlaylistSource,
    startPlaylistImport,
    usePlaylistImportStore,
} from '../store/playlist-import-store';

import { AppRoute } from '/@/renderer/router/routes';
import { Badge } from '/@/shared/components/badge/badge';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

const CARD_STYLE = {
    border: '1px solid var(--theme-colors-border)',
    borderRadius: 8,
    padding: 16,
} as const;

const ROW_STYLE = {
    borderBottom: '1px solid var(--theme-colors-border)',
    padding: '6px 4px',
} as const;

const ELLIPSIS = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

const TRACK_BADGE: Record<string, { color: string; label: string }> = {
    already_present: { color: 'blue', label: 'In library' },
    done: { color: 'green', label: 'Downloaded' },
    downloading: { color: 'yellow', label: 'Downloading' },
    error: { color: 'red', label: 'Failed' },
    pending: { color: 'gray', label: 'Pending' },
    searching: { color: 'yellow', label: 'Searching' },
};

const JOB_BADGE_COLOR = (status: string): string => {
    if (status === 'error') return 'red';
    if (status === 'done') return 'green';
    return 'blue';
};

// ── Sous-composants ────────────────────────────────────────────────────────

const Notice = ({
    children,
    color,
    icon,
}: {
    children: React.ReactNode;
    color: string;
    icon: React.ReactNode;
}) => (
    <Group align="flex-start" gap={8} wrap="nowrap">
        <span style={{ color, flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
        <Text size="xs" style={{ color }}>
            {children}
        </Text>
    </Group>
);

/** Deux lignes titre/sous-titre + un badge à droite, tronquées proprement. */
const LabeledRow = ({
    badge,
    subtitle,
    title,
}: {
    badge?: React.ReactNode;
    subtitle: string;
    title: string;
}) => (
    <Group gap="sm" justify="space-between" style={ROW_STYLE} wrap="nowrap">
        <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="xs" style={ELLIPSIS}>
                {title}
            </Text>
            <Text isMuted size="xs" style={ELLIPSIS}>
                {subtitle}
            </Text>
        </Stack>
        {badge}
    </Group>
);

const JobTrackRow = ({ track }: { track: PlaylistImportJobTrack }) => {
    const status = track.status ?? 'pending';
    const badge = TRACK_BADGE[status] ?? { color: 'gray', label: status };

    return (
        <LabeledRow
            badge={
                <Badge color={badge.color} size="xs" variant="light">
                    {badge.label}
                </Badge>
            }
            subtitle={`${track.artist ?? 'Unknown artist'}${track.error ? ` — ${track.error}` : ''}`}
            title={track.title ?? 'Unknown title'}
        />
    );
};

const ActiveJobCard = ({ job }: { job: PlaylistImportJob }) => {
    const clearActiveJob = usePlaylistImportStore((s) => s.clearActiveJob);
    const navigate = useNavigate();

    const done = isTerminal(job.status);
    const failed = job.failed ?? 0;
    const playlistId = job.navidrome_playlist_id;

    return (
        <Stack gap="sm" style={CARD_STYLE}>
            <Group gap="sm" justify="space-between" wrap="nowrap">
                <Stack gap={0} style={{ minWidth: 0 }}>
                    <TextTitle order={5}>{job.playlist_name ?? 'Playlist'}</TextTitle>
                    <Text isMuted size="xs">
                        {acquiredCount(job)} / {job.total ?? 0} tracks
                        {failed > 0 ? ` · ${failed} failed` : ''}
                        {job.provider ? ` · ${job.provider}` : ''}
                    </Text>
                </Stack>
                <Badge color={JOB_BADGE_COLOR(job.status)} size="sm" variant="light">
                    {job.status}
                </Badge>
            </Group>

            <Progress animated={!done} size="sm" value={job.progress ?? 0} />

            {/* `error` porte l'échec global du job, `warning` un avertissement non bloquant */}
            {job.error && (
                <Notice color="var(--mantine-color-red-6)" icon={<RiErrorWarningLine size={14} />}>
                    {job.error}
                </Notice>
            )}

            {job.warning && (
                <Notice color="var(--mantine-color-yellow-6)" icon={<RiAlertLine size={14} />}>
                    {job.warning}
                </Notice>
            )}

            {failed > 0 && (
                <Notice color="var(--mantine-color-red-6)" icon={<RiErrorWarningLine size={14} />}>
                    {failed} track{failed > 1 ? 's' : ''} could not be downloaded. The playlist was
                    still written with the tracks that were retrieved.
                </Notice>
            )}

            {playlistId && (
                <Notice color="var(--mantine-color-blue-6)" icon={<RiInformationLine size={14} />}>
                    This playlist is synced from its .m3u file, so adding or removing tracks from
                    Feishin will be refused by the server.
                </Notice>
            )}

            {done && (
                <Group gap="sm">
                    {playlistId && (
                        <Button
                            leftSection={<RiExternalLinkLine size={14} />}
                            onClick={() =>
                                navigate(
                                    generatePath(AppRoute.PLAYLISTS_DETAIL_SONGS, {
                                        playlistId,
                                    }),
                                )
                            }
                            variant="filled"
                        >
                            Open playlist
                        </Button>
                    )}
                    <Button onClick={clearActiveJob} variant="default">
                        Dismiss
                    </Button>
                </Group>
            )}

            {job.tracks && job.tracks.length > 0 && (
                <Stack gap={0} style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {job.tracks.map((track, index) => (
                        <JobTrackRow
                            key={`${track.artist}-${track.title}-${index}`}
                            track={track}
                        />
                    ))}
                </Stack>
            )}
        </Stack>
    );
};

/** Écran de confirmation : aperçu de `/playlist/info`, avant tout téléchargement. */
const ConfirmationCard = ({
    info,
    isStarting,
    onCancel,
    onConfirm,
}: {
    info: PlaylistSource;
    isStarting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) => (
    <Stack gap="sm" style={CARD_STYLE}>
        <Stack gap={0}>
            <TextTitle order={5}>{info.name}</TextTitle>
            <Text isMuted size="xs">
                {info.track_count} tracks · {info.provider}
            </Text>
        </Stack>

        {info.truncated && (
            <Notice color="var(--mantine-color-yellow-6)" icon={<RiAlertLine size={14} />}>
                This playlist was truncated when read — only the first {info.track_count} tracks
                will be imported.
            </Notice>
        )}

        <Notice color="var(--mantine-color-blue-6)" icon={<RiInformationLine size={14} />}>
            Imported playlists are synced from their .m3u file, so they cannot be edited from
            Feishin afterwards.
        </Notice>

        {info.tracks.length > 0 && (
            <Stack gap={0} style={{ maxHeight: 240, overflowY: 'auto' }}>
                {info.tracks.map((track, index) => (
                    <LabeledRow
                        key={`${track.artist}-${track.title}-${index}`}
                        subtitle={track.artist}
                        title={track.title}
                    />
                ))}
            </Stack>
        )}

        <Group gap="sm">
            <Button loading={isStarting} onClick={onConfirm} variant="filled">
                Import {info.track_count} tracks
            </Button>
            <Button onClick={onCancel} variant="default">
                Cancel
            </Button>
        </Group>
    </Stack>
);

const ImportHistory = () => {
    const { data, error, isError, isLoading } = useQuery({
        queryFn: fetchPlaylistImports,
        queryKey: ['playlist-imports'],
        retry: 1,
        staleTime: 30_000,
    });

    if (isLoading) {
        return (
            <Text isMuted size="xs">
                Loading past imports…
            </Text>
        );
    }

    if (isError) {
        return (
            <Text size="xs" style={{ color: 'var(--mantine-color-red-6)' }}>
                {error instanceof Error ? error.message : 'Could not load past imports'}
            </Text>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Text isMuted size="xs">
                No past imports. The server keeps jobs in memory only — restarting it clears this
                list.
            </Text>
        );
    }

    return (
        <Stack gap={0}>
            {data.map((job) => (
                <LabeledRow
                    badge={
                        <Badge color={JOB_BADGE_COLOR(job.status)} size="xs" variant="light">
                            {job.status}
                        </Badge>
                    }
                    key={job.job_id}
                    subtitle={
                        `${acquiredCount(job)} / ${job.total ?? 0} tracks` +
                        (job.failed ? ` · ${job.failed} failed` : '')
                    }
                    title={job.playlist_name ?? job.job_id}
                />
            ))}
        </Stack>
    );
};

// ── Panneau ────────────────────────────────────────────────────────────────

export const PlaylistImportPanel = () => {
    const [url, setUrl] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [startError, setStartError] = useState<null | string>(null);
    const [isStarting, setIsStarting] = useState(false);

    const activeJob = usePlaylistImportStore((s) => s.activeJob);
    const setActiveJob = usePlaylistImportStore((s) => s.setActiveJob);

    const infoQuery = useQuery({
        enabled: previewUrl.length > 0,
        queryFn: () => fetchPlaylistInfo(previewUrl),
        queryKey: ['playlist-info', previewUrl],
        retry: false,
        staleTime: 60_000,
    });

    const isRunning = Boolean(activeJob && !isTerminal(activeJob.status));

    const handlePreview = useCallback(() => {
        const trimmed = url.trim();
        if (!trimmed) return;
        setStartError(null);
        setPreviewUrl(trimmed);
    }, [url]);

    /**
     * L'URL est passée explicitement : la carte de confirmation doit importer
     * celle qu'elle a prévisualisée, même si le champ a été édité depuis.
     */
    const handleImport = useCallback(
        async (target: string) => {
            const trimmed = target.trim();
            if (!trimmed) return;

            setStartError(null);
            setIsStarting(true);

            try {
                // La lecture de la playlist est synchrone côté NAS : une URL
                // invalide ou privée revient ici en 400/404 avec un detail lisible.
                const started = await startPlaylistImport(trimmed);
                setActiveJob({
                    already_present: 0,
                    downloaded: 0,
                    failed: 0,
                    job_id: started.job_id,
                    playlist_name: started.playlist_name,
                    playlist_url: trimmed,
                    progress: 0,
                    provider: started.provider,
                    status: started.status,
                    total: started.total,
                    truncated: started.truncated,
                    warning: started.warning,
                });
                setPreviewUrl('');
                setUrl('');
            } catch (err) {
                setStartError(err instanceof Error ? err.message : 'Import could not be started');
            } finally {
                setIsStarting(false);
            }
        },
        [setActiveJob],
    );

    const info = infoQuery.data;
    const canSubmit = Boolean(url.trim()) && !isRunning;

    return (
        <Stack gap="lg" p="lg">
            <Stack gap="sm">
                <Group gap="sm">
                    <TextInput
                        onChange={(e) => setUrl(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handlePreview();
                        }}
                        placeholder="Deezer or Spotify playlist URL…"
                        style={{ flex: 1, maxWidth: 600 }}
                        value={url}
                    />
                    <Button
                        disabled={!canSubmit}
                        loading={infoQuery.isFetching}
                        onClick={handlePreview}
                        variant="default"
                    >
                        Preview
                    </Button>
                    <Button
                        disabled={!canSubmit}
                        loading={isStarting}
                        onClick={() => handleImport(url)}
                        variant="filled"
                    >
                        Import
                    </Button>
                </Group>

                {isRunning && (
                    <Text isMuted size="xs">
                        An import is already running. Wait for it to finish before starting another.
                    </Text>
                )}

                {startError && (
                    <Notice
                        color="var(--mantine-color-red-6)"
                        icon={<RiErrorWarningLine size={14} />}
                    >
                        {startError}
                    </Notice>
                )}

                {infoQuery.isError && (
                    <Notice
                        color="var(--mantine-color-red-6)"
                        icon={<RiErrorWarningLine size={14} />}
                    >
                        {infoQuery.error instanceof Error
                            ? infoQuery.error.message
                            : 'Could not read that playlist'}
                    </Notice>
                )}
            </Stack>

            {info && !isRunning && (
                <ConfirmationCard
                    info={info}
                    isStarting={isStarting}
                    onCancel={() => setPreviewUrl('')}
                    onConfirm={() => handleImport(previewUrl)}
                />
            )}

            {activeJob && <ActiveJobCard job={activeJob} />}

            <Stack gap="sm">
                <TextTitle order={5}>Past imports</TextTitle>
                <ImportHistory />
            </Stack>
        </Stack>
    );
};
