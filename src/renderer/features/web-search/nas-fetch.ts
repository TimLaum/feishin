import { useAuthStore } from '/@/renderer/store/auth.store';

// Client unique de l'API musique du NAS : en direct sur le réseau local (pas
// d'authentification), sinon par le domaine public. À distance, l'API est
// authentifiée par la session Navidrome déjà ouverte dans Feishin : l'identifiant
// Subsonic du serveur courant (u, s, t) part dans X-Navidrome-Credential et l'API
// le fait valider par Navidrome. Rien à configurer.
export const NAS_LAN_BASE = 'http://192.168.1.20:8787';
const NAS_PUBLIC_BASE = 'https://dl.utl.duckdns.org';

const LAN_PROBE_TIMEOUT_MS = 1500;
// Au-delà, on revérifie le chemin en arrière-plan (retour à la maison, départ…)
const ROUTE_TTL_MS = 60_000;

type NasRoute = 'lan' | 'public';

let route: NasRoute | null = null;
let checkedAt = 0;
let probing: null | Promise<NasRoute> = null;

const navidromeCredential = () => useAuthStore.getState().currentServer?.credential ?? '';

const probeRoute = (): Promise<NasRoute> => {
    probing ??= fetch(`${NAS_LAN_BASE}/batches?hours=1`, {
        signal: AbortSignal.timeout(LAN_PROBE_TIMEOUT_MS),
    })
        // Sur un autre réseau, 192.168.1.20 peut être n'importe quel appareil :
        // on vérifie que c'est bien l'API (liste JSON)
        .then(async (res) => res.ok && Array.isArray(await res.json()))
        .catch(() => false)
        .then((lanOk) => {
            route = lanOk ? 'lan' : 'public';
            checkedAt = Date.now();
            probing = null;
            return route;
        });
    return probing;
};

const resolveRoute = async (): Promise<NasRoute> => {
    if (!route) return probeRoute();
    // Chemin connu mais ancien : on le réutilise et on revérifie sans attendre
    if (Date.now() - checkedAt > ROUTE_TTL_MS) probeRoute();
    return route;
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        route = null;
        probing = null;
    });
}

const fetchPublic = (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set('X-Navidrome-Credential', navidromeCredential());
    return fetch(`${NAS_PUBLIC_BASE}${path}`, { ...init, headers });
};

/** `fetch` vers l'API du NAS ; `path` commence par « / ». */
export const nasFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    if ((await resolveRoute()) === 'public') return fetchPublic(path, init);
    try {
        return await fetch(`${NAS_LAN_BASE}${path}`, init);
    } catch {
        // Réseau local perdu en cours de route : on bascule tout de suite
        route = 'public';
        checkedAt = Date.now();
        return fetchPublic(path, init);
    }
};

/**
 * URL lisible par un <audio> : les extraits YouTube servis par l'API arrivent en
 * adresse locale ; à distance, on passe par le domaine public (identifiant en
 * paramètre, l'API ne l'accepte que sur /preview/).
 */
export const nasMediaUrl = (url: string): string => {
    if (route !== 'public' || !url.startsWith(NAS_LAN_BASE)) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${NAS_PUBLIC_BASE}${url.slice(NAS_LAN_BASE.length)}${sep}nd=${encodeURIComponent(navidromeCredential())}`;
};
