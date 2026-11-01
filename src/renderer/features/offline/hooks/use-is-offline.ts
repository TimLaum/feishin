import { useEffect, useState } from 'react';

import {
    useOfflineModeSetting,
    useServerUnreachable,
} from '/@/renderer/features/offline/store/offline-store';

/** Suit l'état réseau du navigateur. */
export const useIsNetworkOffline = (): boolean => {
    const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOffline;
};

/**
 * Mode hors connexion effectif : réseau tombé, serveur injoignable, ou mode
 * forcé par l'utilisateur (Paramètres > Téléchargements).
 */
export const useIsOffline = (): boolean => {
    const isNetworkOffline = useIsNetworkOffline();
    const offlineMode = useOfflineModeSetting();
    const serverUnreachable = useServerUnreachable();

    return isNetworkOffline || offlineMode || serverUnreachable;
};
