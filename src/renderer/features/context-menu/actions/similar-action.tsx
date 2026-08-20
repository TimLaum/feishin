import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebSearchUIStore } from '/@/renderer/features/web-search/store/web-search-ui-store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { Song } from '/@/shared/types/domain-types';

interface SimilarActionProps {
    song?: Song;
}

export const SimilarAction = ({ song }: SimilarActionProps) => {
    const { t } = useTranslation();
    const openSimilar = useWebSearchUIStore((s) => s.openSimilar);

    const onSelect = useCallback(() => {
        if (!song) return;
        openSimilar({
            artist: song.artistName || song.artists?.[0]?.name || '',
            title: song.name,
        });
    }, [openSimilar, song]);

    return (
        <ContextMenu.Item disabled={!song} leftIcon="similar" onSelect={onSelect}>
            {t('player.similarSongs')}
        </ContextMenu.Item>
    );
};
