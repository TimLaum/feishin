import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { BatchRequest, BatchSummary, fetchBatches, startBatch } from '../api';

import { toast } from '/@/shared/components/toast/toast';

export const BATCHES_QUERY_KEY = ['nas-batches'];
const BATCH_POLL_MS = 2500;

export const isBatchActive = (b: BatchSummary) =>
    b.status === 'preparing' || b.status === 'running';

/**
 * Lots récents du serveur (y compris ceux lancés depuis la page mobile).
 * Rafraîchi tant qu'un lot tourne, ou en continu si `watch` (onglet Téléchargements ouvert).
 */
export const useBatches = (watch = false) =>
    useQuery({
        queryFn: fetchBatches,
        queryKey: BATCHES_QUERY_KEY,
        refetchInterval: (query) =>
            watch || (query.state.data ?? []).some(isBatchActive) ? BATCH_POLL_MS : false,
        retry: false,
    });

export const useStartBatch = () => {
    const queryClient = useQueryClient();

    return useCallback(
        async (req: BatchRequest) => {
            try {
                const res = await startBatch(req);
                toast.success({
                    message: `« ${res.name} » lancé · suivi dans Web Search › Téléchargements`,
                });
                queryClient.invalidateQueries({ queryKey: BATCHES_QUERY_KEY });
                return res;
            } catch (err) {
                toast.error({
                    message: err instanceof Error ? err.message : 'Lot non lancé',
                });
                return null;
            }
        },
        [queryClient],
    );
};
