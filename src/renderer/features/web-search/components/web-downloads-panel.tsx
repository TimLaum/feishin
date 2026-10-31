import { Progress } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';

import { BatchSummary, cancelBatch, plural } from '../api';
import { BATCHES_QUERY_KEY, isBatchActive, useBatches } from '../hooks/use-batches';
import { ActiveDownload, useWebSearchDownloadStore } from '../store/web-search-download-store';
import styles from './web-search.module.css';

import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { closeAllModals, ConfirmModal, openModal } from '/@/shared/components/modal/modal';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

const BATCH_LABEL: Record<BatchSummary['status'], string> = {
    cancelled: 'Annulé',
    done: 'Terminé',
    error: 'Échec',
    preparing: 'Préparation…',
    running: 'En cours',
};

const STATUS_COLOR: Partial<Record<BatchSummary['status'], string>> = {
    done: 'var(--mantine-color-green-6)',
    error: 'var(--mantine-color-red-6)',
};

const formatEta = (s: number) =>
    s >= 3600
        ? `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
        : `${Math.max(1, Math.round(s / 60))} min`;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className={styles.sectionTitle}>{children}</div>
);

const BatchCard = ({ batch: b, onCancel }: { batch: BatchSummary; onCancel: () => void }) => {
    const active = isBatchActive(b);
    const label =
        b.status === 'preparing' && b.releases_total
            ? `Lecture des sorties ${b.releases_read}/${b.releases_total}`
            : BATCH_LABEL[b.status];
    const pct =
        b.status === 'preparing'
            ? b.releases_total
                ? (100 * b.releases_read) / b.releases_total
                : 0
            : b.total
              ? (100 * b.done) / b.total
              : 0;
    const notes = [
        b.duplicates ? `${b.duplicates} doublons ignorés` : null,
        b.instrumentals_skipped ? `${b.instrumentals_skipped} instrumentales ignorées` : null,
        b.skipped ? `${b.skipped} abandonnés` : null,
        b.release_errors ? `${b.release_errors} sorties illisibles` : null,
        b.truncated ? `${b.truncated} titres au-delà de la limite` : null,
        b.eta_seconds ? `≈ ${formatEta(b.eta_seconds)} restantes` : null,
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <Stack className={styles.job} gap={4}>
            <Group justify="space-between" wrap="nowrap">
                <Text fw={600} size="sm" truncate>
                    {b.name}
                </Text>
                <Text size="xs" style={{ color: STATUS_COLOR[b.status], flexShrink: 0 }}>
                    {label}
                </Text>
            </Group>
            {b.total > 0 && (
                <Text isMuted size="xs">
                    {b.downloaded} ajoutés · {b.already_present} déjà là · {b.failed} échecs —{' '}
                    {b.done}/{b.total}
                </Text>
            )}
            {notes && (
                <Text isMuted size="xs">
                    {notes}
                </Text>
            )}
            {b.running.length > 0 && <Text size="xs">En cours : {b.running.join(', ')}</Text>}
            {b.error && (
                <Text size="xs" style={{ color: 'var(--mantine-color-red-6)' }}>
                    {b.error}
                </Text>
            )}
            {active && <Progress animated size="xs" value={pct} />}
            {b.failures.length > 0 && (
                <details className={styles.fails}>
                    <summary>{plural(b.failed, 'échec')}</summary>
                    <ul>
                        {b.failures.map((f, i) => (
                            <li key={`${f.artist}-${f.title}-${i}`}>
                                {f.artist} – {f.title}
                                {f.error ? ` · ${f.error}` : ''}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {active && (
                <Group justify="flex-end">
                    <Button onClick={onCancel} size="xs" variant="subtle">
                        Annuler le lot
                    </Button>
                </Group>
            )}
        </Stack>
    );
};

const describeDownload = (d: ActiveDownload): { color?: string; text: string } => {
    switch (d.state.status) {
        case 'active':
            return { text: d.state.message };
        case 'done':
            return {
                color: 'var(--mantine-color-green-6)',
                text: d.state.alreadyExisted ? 'Déjà là' : 'Ajouté',
            };
        case 'error':
            return { color: 'var(--mantine-color-red-6)', text: d.state.message };
        default:
            return { text: 'En attente…' };
    }
};

export const WebDownloadsPanel = () => {
    const queryClient = useQueryClient();
    const { data: batches = [], error, isError, isLoading } = useBatches(true);
    const downloads = Object.entries(useWebSearchDownloadStore((s) => s.downloads)).reverse();

    const handleCancel = (b: BatchSummary) => {
        openModal({
            children: (
                <ConfirmModal
                    labels={{ cancel: 'Garder', confirm: 'Annuler le lot' }}
                    onConfirm={async () => {
                        closeAllModals();
                        try {
                            await cancelBatch(b.job_id);
                            toast.info({
                                message: 'Annulation demandée : les titres en cours se terminent',
                            });
                            queryClient.invalidateQueries({ queryKey: BATCHES_QUERY_KEY });
                        } catch (err) {
                            toast.error({
                                message:
                                    err instanceof Error ? err.message : 'Annulation impossible',
                            });
                        }
                    }}
                >
                    <Text>Les titres déjà téléchargés restent dans la bibliothèque.</Text>
                </ConfirmModal>
            ),
            title: `Annuler « ${b.name} » ?`,
        });
    };

    if (isLoading) {
        return (
            <Center h={200}>
                <Text isMuted>Chargement…</Text>
            </Center>
        );
    }

    if (!batches.length && !downloads.length) {
        return (
            <Center h={200}>
                <Text isMuted>
                    {isError && error instanceof Error
                        ? error.message
                        : 'Aucun téléchargement ces dernières 24 h.'}
                </Text>
            </Center>
        );
    }

    return (
        <Stack gap={0}>
            {batches.length > 0 && (
                <>
                    <SectionTitle>Lots</SectionTitle>
                    {batches.map((b) => (
                        <BatchCard batch={b} key={b.job_id} onCancel={() => handleCancel(b)} />
                    ))}
                </>
            )}
            {downloads.length > 0 && (
                <>
                    <SectionTitle>Titres</SectionTitle>
                    {downloads.map(([id, d]) => {
                        const { color, text } = describeDownload(d);
                        return (
                            <Stack className={styles.job} gap={4} key={id}>
                                <Group justify="space-between" wrap="nowrap">
                                    <Text fw={600} size="sm" truncate>
                                        {d.title}
                                    </Text>
                                    <Text size="xs" style={{ color, flexShrink: 0 }}>
                                        {text}
                                    </Text>
                                </Group>
                                <Text isMuted size="xs">
                                    {d.artist}
                                </Text>
                                {d.state.status === 'active' && (
                                    <Progress animated size="xs" value={d.state.progress} />
                                )}
                            </Stack>
                        );
                    })}
                </>
            )}
        </Stack>
    );
};
