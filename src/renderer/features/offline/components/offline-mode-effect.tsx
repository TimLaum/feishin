import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { useOfflineModeSetting } from '/@/renderer/features/offline/store/offline-store';
import { AppRoute } from '/@/renderer/router/routes';

/**
 * Bascule vers la page Téléchargements quand le mode hors connexion est activé :
 * c'est la seule surface qui reste entièrement utilisable sans réseau. La perte
 * de connexion seule ne déclenche rien, pour ne pas éjecter l'utilisateur de sa
 * page sur une micro-coupure.
 */
export const OfflineModeEffect = () => {
    const offlineMode = useOfflineModeSetting();
    const navigate = useNavigate();
    const previousRef = useRef(offlineMode);

    useEffect(() => {
        if (offlineMode && !previousRef.current) {
            navigate(AppRoute.DOWNLOADS);
        }
        previousRef.current = offlineMode;
    }, [navigate, offlineMode]);

    return null;
};
