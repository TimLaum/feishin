import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { useOfflineModeSetting } from '/@/renderer/features/offline/store/offline-store';
import { AppRoute } from '/@/renderer/router/routes';

/**
 * Bascule vers l'accueil (qui liste alors ce qui est téléchargé) quand le mode
 * hors connexion est forcé. La perte de connexion seule ne déclenche rien, pour
 * ne pas éjecter l'utilisateur de sa page sur une micro-coupure.
 */
export const OfflineModeEffect = () => {
    const offlineMode = useOfflineModeSetting();
    const navigate = useNavigate();
    const previousRef = useRef(offlineMode);

    useEffect(() => {
        if (offlineMode && !previousRef.current) {
            navigate(AppRoute.HOME);
        }
        previousRef.current = offlineMode;
    }, [navigate, offlineMode]);

    return null;
};
