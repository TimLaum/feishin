import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineSubscriptionState } from '/@/renderer/features/offline/hooks/use-offline-subscription-state';
import {
    offlineActions,
    OfflineSubscriptionKind,
    subscriptionKey,
} from '/@/renderer/features/offline/store/offline-store';
import { useCurrentServerId } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';

interface OfflineDownloadToggleProps {
    imageUrl?: null | string;
    itemId: null | string | undefined;
    kind: OfflineSubscriptionKind;
    name: string;
    size?: 'lg' | 'md' | 'sm';
    variant?: 'subtle' | 'transparent';
}

/**
 * Bouton à trois états (non téléchargé / en cours / téléchargé) piloté par
 * l'abonnement de l'objet, comme la flèche verte de Spotify ou Deezer.
 */
export const OfflineDownloadToggle = ({
    imageUrl,
    itemId,
    kind,
    name,
    size = 'lg',
    variant = 'transparent',
}: OfflineDownloadToggleProps) => {
    const { t } = useTranslation();
    const serverId = useCurrentServerId();
    const state = useOfflineSubscriptionState(serverId, kind, itemId);

    const handleToggle = useCallback(() => {
        if (!itemId) return;

        const { subscribe, unsubscribe } = offlineActions();

        if (state.isSubscribed) {
            unsubscribe(subscriptionKey(serverId, kind, itemId));
            return;
        }

        subscribe({ imageUrl, itemId, kind, name, serverId });
    }, [imageUrl, itemId, kind, name, serverId, state.isSubscribed]);

    if (!isElectron() || !itemId) {
        return null;
    }

    const isWorking = state.isSubscribed && state.isWorking;

    const label = !state.isSubscribed
        ? t('page.contextMenu.downloadOffline')
        : isWorking
          ? t('page.offline.downloadingProgress', { progress: state.progress })
          : t('page.contextMenu.removeOffline');

    return (
        <ActionIcon
            icon={isWorking ? 'spinner' : state.isSubscribed ? 'check' : 'arrowDownToLine'}
            iconProps={{
                animate: isWorking ? 'spin' : undefined,
                fill: state.isSubscribed && !isWorking ? 'success' : undefined,
                size,
            }}
            onClick={handleToggle}
            size={size}
            tooltip={{ label, openDelay: 0 }}
            variant={variant}
        />
    );
};
