import { NasRoute, useNasAccessStore } from './store/nas-access-store';

// Client unique de l'API musique du NAS : en direct sur le réseau local (pas
// d'authentification), sinon par le domaine public avec le jeton Feishin.
export const NAS_LAN_BASE = 'http://192.168.1.20:8787';

const LAN_PROBE_TIMEOUT_MS = 1500;
// Au-delà, on revérifie le chemin en arrière-plan (retour à la maison, départ…)
const ROUTE_TTL_MS = 60_000;

let checkedAt = 0;
let probing: null | Promise<NasRoute> = null;

const hasRemoteAccess = () => {
    const { publicUrl, token } = useNasAccessStore.getState();
    return Boolean(publicUrl && token);
};

const probeRoute = (): Promise<NasRoute> => {
    probing ??= fetch(`${NAS_LAN_BASE}/batches?hours=1`, {
        signal: AbortSignal.timeout(LAN_PROBE_TIMEOUT_MS),
    })
        // Sur un autre réseau, 192.168.1.20 peut être n'importe quel appareil :
        // on vérifie que c'est bien l'API (liste JSON)
        .then(async (res) => res.ok && Array.isArray(await res.json()))
        .catch(() => false)
        .then((lanOk) => {
            // Sans accès distant configuré, on reste en local (l'erreur sera explicite)
            const route: NasRoute = lanOk || !hasRemoteAccess() ? 'lan' : 'public';
            useNasAccessStore.getState().setRoute(route);
            checkedAt = Date.now();
            probing = null;
            return route;
        });
    return probing;
};

const resolveRoute = async (): Promise<NasRoute> => {
    const { route } = useNasAccessStore.getState();
    if (!route) return probeRoute();
    // Chemin connu mais ancien : on le réutilise et on revérifie sans attendre
    if (Date.now() - checkedAt > ROUTE_TTL_MS) probeRoute();
    return route;
};

/** À appeler quand les réglages ou le réseau changent. */
export const resetNasRoute = () => {
    checkedAt = 0;
    probing = null;
    useNasAccessStore.setState({ route: null });
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', resetNasRoute);
}

const fetchPublic = (path: string, init: RequestInit) => {
    const { publicUrl, token } = useNasAccessStore.getState();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${publicUrl}${path}`, { ...init, headers });
};

/** `fetch` vers l'API du NAS ; `path` commence par « / ». */
export const nasFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    if ((await resolveRoute()) === 'public') return fetchPublic(path, init);
    try {
        return await fetch(`${NAS_LAN_BASE}${path}`, init);
    } catch (err) {
        // Réseau local perdu en cours de route : on bascule tout de suite
        if (!hasRemoteAccess()) throw err;
        useNasAccessStore.getState().setRoute('public');
        checkedAt = Date.now();
        return fetchPublic(path, init);
    }
};

/**
 * URL lisible par un <audio> : les extraits YouTube servis par l'API arrivent en
 * adresse locale ; à distance, on passe par le domaine public (jeton en
 * paramètre, l'API ne l'accepte que sur /preview/).
 */
export const nasMediaUrl = (url: string): string => {
    const { publicUrl, route, token } = useNasAccessStore.getState();
    if (route !== 'public' || !url.startsWith(NAS_LAN_BASE)) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${publicUrl}${url.slice(NAS_LAN_BASE.length)}${sep}token=${encodeURIComponent(token)}`;
};

/** Teste l'accès distant tel que configuré, même depuis le réseau local. */
export const testRemoteAccess = async (publicUrl: string, token: string): Promise<string> => {
    try {
        const res = await fetch(`${publicUrl.trim().replace(/\/+$/, '')}/batches?hours=1`, {
            headers: { Authorization: `Bearer ${token.trim()}` },
            signal: AbortSignal.timeout(8000),
        });
        if (res.ok) return 'ok';
        if (res.status === 401) return 'Jeton refusé';
        return `Réponse ${res.status}`;
    } catch {
        return 'Adresse injoignable';
    }
};
