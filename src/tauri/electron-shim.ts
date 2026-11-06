// Remplace le module `electron` dans le build Tauri : le preload d'origine (src/preload) tourne tel
// quel dans la webview et construit window.api. Ses appels ipcRenderer partent :
//  - vers un handler local s'il existe (modules main exécutés dans la webview, ex. les paroles,
//    ou fenêtre/réglages gérés en JS) ;
//  - sinon vers la commande Rust `ipc` (src-tauri/src/lib.rs).
// Les événements main -> renderer (webContents.send) arrivent par les événements Tauri du même nom.
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { openPath } from '@tauri-apps/plugin-opener';

type Handler = (event: IpcEvent, ...args: any[]) => any;
type IpcEvent = {
    sender: { isDestroyed: () => boolean; send: (channel: string, data: unknown) => void };
};
type Listener = (event: unknown, ...args: any[]) => void;

const handlers = new Map<string, Handler>();
const listeners = new Map<string, Map<Listener, Promise<UnlistenFn>>>();

export const emitLocal = (channel: string, ...args: unknown[]) => {
    listeners.get(channel)?.forEach((_, listener) => listener({}, ...args));
};

const localEvent: IpcEvent = { sender: { isDestroyed: () => false, send: emitLocal } };

const call = (channel: string, args: unknown[]): Promise<any> => {
    const handler = handlers.get(channel);
    if (handler) return Promise.resolve().then(() => handler(localEvent, ...args));
    const result = invoke('ipc', { args, channel });
    // Discord : réponses et refus visibles dans la console (Ctrl+Maj+I) pour le diagnostic
    if (channel.startsWith('discord-rpc-')) {
        result.then(
            (response) => console.info(`[discord] ${channel}`, response),
            (error) => console.error(`[discord] ${channel}`, error),
        );
    }
    return result;
};

export const ipcRenderer = {
    invoke: (channel: string, ...args: unknown[]) => call(channel, args),
    on: (channel: string, listener: Listener) => {
        if (!listeners.has(channel)) listeners.set(channel, new Map());
        const unlisten = listen(channel, (event) => listener(event, event.payload));
        listeners.get(channel)!.set(listener, unlisten);
        return ipcRenderer;
    },
    // seul usage : la découverte de serveurs Jellyfin, non portée
    postMessage: () => {},
    removeAllListeners: (channel: string) => {
        listeners.get(channel)?.forEach((unlisten) => unlisten.then((fn) => fn()));
        listeners.delete(channel);
    },
    removeListener: (channel: string, listener: Listener) => {
        listeners
            .get(channel)
            ?.get(listener)
            ?.then((fn) => fn());
        listeners.get(channel)?.delete(listener);
    },
    send: (channel: string, ...args: unknown[]) => {
        call(channel, args).catch((error) => console.error(`[tauri] ${channel}`, error));
    },
};

// Pour les modules main importés dans la webview : leurs ipcMain.handle/on deviennent des handlers locaux
export const ipcMain = {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    on: (channel: string, handler: Handler) => handlers.set(channel, handler),
};

// Module main chargé au premier appel d'un de ses canaux (il remplace alors ces handlers
// provisoires par les siens) : rien de lourd au démarrage
export const lazyMainModule = (channels: string[], load: () => Promise<unknown>) => {
    channels.forEach((channel) => {
        const placeholder: Handler = async (event, ...args) => {
            await load();
            const handler = handlers.get(channel);
            // le module n'a pas déclaré ce canal : pas de boucle sur le handler provisoire
            if (!handler || handler === placeholder) return null;
            return handler(event, ...args);
        };
        ipcMain.handle(channel, placeholder);
    });
};

export const contextBridge = {
    exposeInMainWorld: (key: string, api: unknown) => {
        (window as any)[key] = api;
    },
};

export const webFrame = {
    clearCache: () => {},
    setZoomFactor: (factor: number) => {
        getCurrentWebview()
            .setZoom(factor)
            .catch(() => {});
    },
};

// Tauri ne donne pas le chemin disque d'un fichier glissé dans la page
export const webUtils = { getPathForFile: () => '' };

// Pour les modules main exécutés dans la webview (thèmes perso)
let appPaths: Record<string, string> = {};
export const loadAppPaths = async () => {
    appPaths = await invoke<Record<string, string>>('ipc', { args: [], channel: 'app-paths' });
};

export const app = {
    getPath: (name: string) => appPaths[name] ?? '',
    on: () => app,
    // la webview est prête quand ces modules sont chargés
    whenReady: () => Promise.resolve(),
};

export const shell = {
    openPath: async (path: string) => {
        await openPath(navigator.userAgent.includes('Windows') ? path.replace(/\//g, '\\') : path);
        return '';
    },
};

// une seule fenêtre : ses webContents.send deviennent des événements locaux
export const BrowserWindow = {
    getAllWindows: () => [{ webContents: { send: emitLocal } }],
};
