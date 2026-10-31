import { useOfflineEntry } from '/@/renderer/features/offline/store/offline-store';
import { Icon } from '/@/shared/components/icon/icon';

interface OfflineIndicatorProps {
    serverId: string | undefined;
    songId: string | undefined;
}

/**
 * Pastille affichée sur les lignes de titres disponibles hors ligne, dans les
 * listes normales (l'équivalent de la flèche verte des lignes Spotify).
 */
export const OfflineIndicator = ({ serverId, songId }: OfflineIndicatorProps) => {
    const entry = useOfflineEntry(serverId, songId);

    if (entry?.status !== 'done') {
        return null;
    }

    return (
        <span
            aria-label="Downloaded"
            style={{ display: 'inline-flex', marginRight: '0.35rem', verticalAlign: 'middle' }}
        >
            <Icon fill="success" icon="arrowDownToLine" size="xs" />
        </span>
    );
};
