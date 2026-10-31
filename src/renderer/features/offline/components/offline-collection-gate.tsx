import { ReactNode } from 'react';
import { useParams } from 'react-router';

import { OfflineCollectionDetail } from '/@/renderer/features/offline/components/offline-collection-detail';
import { useIsOffline } from '/@/renderer/features/offline/hooks/use-is-offline';
import {
    OfflineSubscriptionKind,
    useOfflineSubscription,
} from '/@/renderer/features/offline/store/offline-store';
import { useCurrentServerId } from '/@/renderer/store';

interface OfflineCollectionGateProps {
    children: ReactNode;
    kind: OfflineSubscriptionKind;
    paramName: string;
}

/**
 * Placé devant une page de détail serveur : hors connexion, si l'objet est
 * téléchargé, on sert la vue locale au lieu de laisser les requêtes échouer.
 * En ligne, la page normale est rendue telle quelle.
 */
export const OfflineCollectionGate = ({
    children,
    kind,
    paramName,
}: OfflineCollectionGateProps) => {
    const params = useParams();
    const itemId = params[paramName];
    const serverId = useCurrentServerId();
    const isOffline = useIsOffline();
    const subscription = useOfflineSubscription(serverId, kind, itemId);

    if (isOffline && subscription) {
        return <OfflineCollectionDetail subscription={subscription} />;
    }

    return <>{children}</>;
};
