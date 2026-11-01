import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { OfflineCollectionDetail } from '/@/renderer/features/offline/components/offline-collection-detail';
import { useIsOffline } from '/@/renderer/features/offline/hooks/use-is-offline';
import {
    OfflineSubscriptionKind,
    useOfflineSubscription,
} from '/@/renderer/features/offline/store/offline-store';
import { AppRoute } from '/@/renderer/router/routes';
import { useCurrentServerId } from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

interface OfflineCollectionGateProps {
    children: ReactNode;
    // Identifiant fixe (favoris) ; sinon lu dans le paramètre d'URL paramName
    itemId?: string;
    kind: OfflineSubscriptionKind;
    paramName?: string;
}

/**
 * Placé devant une page de détail serveur : hors connexion, si l'objet est
 * téléchargé, on sert la vue locale au lieu de laisser les requêtes échouer.
 * En ligne, la page normale est rendue telle quelle.
 */
export const OfflineCollectionGate = ({
    children,
    itemId: fixedItemId,
    kind,
    paramName,
}: OfflineCollectionGateProps) => {
    const params = useParams();
    const itemId = fixedItemId ?? (paramName ? params[paramName] : undefined);
    const serverId = useCurrentServerId();
    const isOffline = useIsOffline();
    const subscription = useOfflineSubscription(serverId, kind, itemId);

    if (isOffline && subscription) {
        return <OfflineCollectionDetail subscription={subscription} />;
    }

    // Pas téléchargé : message clair plutôt qu'une page en erreur
    if (isOffline) {
        return <NotAvailableOffline />;
    }

    return <>{children}</>;
};

const NotAvailableOffline = () => {
    const { t } = useTranslation();

    return (
        <Center h="100%" p="xl">
            <Stack align="center" gap="md">
                <Icon icon="wifiOff" size="xl" />
                <Text fw={500}>{t('page.offline.notAvailableOffline')}</Text>
                <Button component={Link} to={AppRoute.HOME} variant="default">
                    {t('page.offline.yourDownloads')}
                </Button>
            </Stack>
        </Center>
    );
};
