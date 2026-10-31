import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { BatchStatus } from '../api';
import { isBatchActive, useBatches } from '../hooks/use-batches';

import { toast } from '/@/shared/components/toast/toast';

/**
 * Monté au niveau du layout : suit les lots du serveur et annonce leur fin.
 * L'API ne lance le scan Navidrome qu'en fin de lot : c'est là qu'on rafraîchit
 * les badges « In library ».
 */
export const BatchManager = () => {
    const { data } = useBatches();
    const queryClient = useQueryClient();
    const seen = useRef(new Map<string, BatchStatus>());

    useEffect(() => {
        if (!data) return;
        let finished = false;
        for (const b of data) {
            const prev = seen.current.get(b.job_id);
            if (prev && (prev === 'preparing' || prev === 'running') && !isBatchActive(b)) {
                finished = true;
                if (b.status === 'done') {
                    toast.success({
                        message: `« ${b.name} » terminé : ${b.downloaded} ajoutés, ${b.already_present} déjà là, ${b.failed} échecs`,
                    });
                } else {
                    toast.warn({
                        message: `« ${b.name} » : ${b.status === 'cancelled' ? 'annulé' : (b.error ?? 'échec')}`,
                    });
                }
            }
            seen.current.set(b.job_id, b.status);
        }
        if (finished) queryClient.invalidateQueries({ queryKey: ['web-search-check'] });
    }, [data, queryClient]);

    return null;
};
