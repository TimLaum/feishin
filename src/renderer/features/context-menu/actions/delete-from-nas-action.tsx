import { closeAllModals, openModal } from '@mantine/modals';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { Song } from '/@/shared/types/domain-types';

const NAS_API_BASE = 'http://192.168.1.20:8787';

interface DeleteFromNasActionProps {
    items: Song[];
}

export const DeleteFromNasAction = ({ items }: DeleteFromNasActionProps) => {
    const { t } = useTranslation();

    const handleDelete = useCallback(async () => {
        const results = await Promise.allSettled(
            items.map((song) =>
                fetch(`${NAS_API_BASE}/delete`, {
                    body: JSON.stringify({
                        album: song.album ?? undefined,
                        artist: song.artistName,
                        title: song.name,
                    }),
                    headers: { 'Content-Type': 'application/json' },
                    method: 'POST',
                }).then(async (res) => {
                    const data = await res.json();
                    if (!res.ok || !data.deleted) {
                        throw new Error(data.error ?? `Failed to delete "${song.name}"`);
                    }
                    return data;
                }),
            ),
        );

        const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        const successes = results.filter(
            (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled',
        );

        if (successes.length > 0) {
            toast.success({
                message: t('action.deleteSong', {
                    count: successes.length,
                    postProcess: 'sentenceCase',
                }),
            });
        }

        if (errors.length > 0) {
            toast.error({
                message: errors.map((e) => e.reason?.message).join('\n'),
                title: t('error.genericError', { postProcess: 'sentenceCase' }),
            });
        }

        closeAllModals();
    }, [items, t]);

    const openDeleteModal = useCallback(() => {
        openModal({
            children: (
                <ConfirmModal onConfirm={handleDelete}>
                    <Text>
                        {items.length === 1
                            ? `Delete "${items[0].name}" by ${items[0].artistName} from the library and disk?`
                            : `Delete ${items.length} songs from the library and disk?`}
                    </Text>
                </ConfirmModal>
            ),
            title: t('action.deleteSong', { postProcess: 'sentenceCase' }),
        });
    }, [handleDelete, items, t]);

    return (
        <ContextMenu.Item leftIcon="remove" onSelect={openDeleteModal}>
            {t('action.deleteSong', { postProcess: 'sentenceCase' })}
        </ContextMenu.Item>
    );
};
