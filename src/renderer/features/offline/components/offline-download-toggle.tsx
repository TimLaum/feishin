import { closeAllModals, openModal } from '@mantine/modals';
import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from '/@/i18n/i18n';
import { useOfflineSubscriptionState } from '/@/renderer/features/offline/hooks/use-offline-subscription-state';
import {
    offlineActions,
    OfflineSubscriptionKind,
    subscriptionKey,
    useOfflineStoreBase,
} from '/@/renderer/features/offline/store/offline-store';
import { useCurrentServerId } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { Text } from '/@/shared/components/text/text';

interface OfflineDownloadToggleProps {
    imageUrl?: null | string;
    itemId: null | string | undefined;
    kind: OfflineSubscriptionKind;
    name: string;
    size?: 'lg' | 'md' | 'sm';
    variant?: 'subtle' | 'transparent';
}

/**
 * Retire des abonnements ; si des fichiers sont déjà sur le disque, demande
 * confirmation d'abord (un clic de trop effaçait une collection entière).
 */
export const confirmUnsubscribe = (subKeys: string[], onRemoved?: () => void) => {
    const { entries, subscriptions } = useOfflineStoreBase.getState();
    const remove = () => {
        subKeys.forEach((subKey) => offlineActions().unsubscribe(subKey));
        onRemoved?.();
    };

    const hasFiles = subKeys.some((subKey) =>
        subscriptions[subKey]?.songKeys.some((key) => entries[key]?.status === 'done'),
    );
    if (!hasFiles) {
        remove();
        return;
    }

    openModal({
        children: (
            <ConfirmModal
                labels={{ cancel: i18n.t('common.cancel'), confirm: i18n.t('common.confirm') }}
                onCancel={() => closeAllModals()}
                onConfirm={() => {
                    closeAllModals();
                    remove();
                }}
            >
                <Text>{i18n.t('page.offline.removeConfirm')}</Text>
            </ConfirmModal>
        ),
        title: i18n.t('page.contextMenu.removeOffline'),
    });
};

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

        if (state.isSubscribed) {
            confirmUnsubscribe([subscriptionKey(serverId, kind, itemId)]);
            return;
        }

        offlineActions().subscribe({ imageUrl, itemId, kind, name, serverId });
    }, [imageUrl, itemId, kind, name, serverId, state.isSubscribed]);

    if (!isElectron() || !itemId) {
        return null;
    }

    const isWorking = state.isSubscribed && state.isWorking;

    const label = !state.isSubscribed
        ? t('page.contextMenu.downloadOffline')
        : isWorking
          ? t('page.offline.downloadingProgress', { progress: state.progress })
          : state.errorCount > 0
            ? t('page.offline.failedCount', { count: state.errorCount })
            : t('page.contextMenu.removeOffline');

    return (
        <ActionIcon
            icon={isWorking ? 'spinner' : state.isSubscribed ? 'check' : 'arrowDownToLine'}
            iconProps={{
                animate: isWorking ? 'spin' : undefined,
                fill:
                    isWorking || !state.isSubscribed
                        ? undefined
                        : state.isComplete
                          ? 'success'
                          : 'warn',
                size,
            }}
            onClick={handleToggle}
            size={size}
            tooltip={{ label, openDelay: 0 }}
            variant={variant}
        />
    );
};
