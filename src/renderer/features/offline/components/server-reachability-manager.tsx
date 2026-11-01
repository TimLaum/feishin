import { useEffect } from 'react';

import { api } from '/@/renderer/api';
import { offlineActions } from '/@/renderer/features/offline/store/offline-store';
import { useCurrentServerId } from '/@/renderer/store';

// Serveur joignable : simple contrôle de routine. Injoignable : on retente vite
// pour repasser en ligne dès que le NAS répond de nouveau.
const CHECK_ONLINE_MS = 60 * 1000;
const CHECK_OFFLINE_MS = 15 * 1000;
const PING_TIMEOUT_MS = 6000;

/**
 * Monté au niveau du layout : détecte que le serveur ne répond plus alors que
 * le réseau est là (NAS hors de portée, Wi-Fi sans Internet...). Le reste de
 * l'appli bascule alors en hors connexion comme si le réseau était coupé.
 */
export const ServerReachabilityManager = () => {
    const serverId = useCurrentServerId();

    useEffect(() => {
        if (!serverId) return undefined;

        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancelled = false;
        let unreachable = false;

        const check = async () => {
            clearTimeout(timer);

            if (!navigator.onLine) {
                unreachable = true;
            } else {
                try {
                    await api.controller.getServerInfo({
                        apiClientProps: { serverId, signal: AbortSignal.timeout(PING_TIMEOUT_MS) },
                    });
                    unreachable = false;
                } catch {
                    unreachable = true;
                }
            }

            if (cancelled) return;
            offlineActions().setServerUnreachable(unreachable);
            timer = setTimeout(check, unreachable ? CHECK_OFFLINE_MS : CHECK_ONLINE_MS);
        };

        const handleChange = () => void check();
        const handleFocus = () => {
            if (unreachable) void check();
        };

        window.addEventListener('online', handleChange);
        window.addEventListener('offline', handleChange);
        window.addEventListener('focus', handleFocus);
        void check();

        return () => {
            cancelled = true;
            clearTimeout(timer);
            window.removeEventListener('online', handleChange);
            window.removeEventListener('offline', handleChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [serverId]);

    return null;
};
