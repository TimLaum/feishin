// Canaux IPC gérés directement en JS (API fenêtre de Tauri, réglages en mémoire) au lieu de Rust.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';

import { ipcMain } from './electron-shim';
import { store } from './settings-cache';

const win = getCurrentWindow();

// Barre Windows seulement quand Feishin ne dessine pas la sienne (styles Windows/macOS) ;
// appliqué en direct, sans le redémarrage qu'exigeait Electron
export const applyWindowFrame = (style = store.get('window_window_bar_style')) =>
    win.setDecorations(!(style === 'windows' || style === 'macos')).catch(() => {});

const setSetting = (property: string, value: unknown) => {
    if (value === null || value === undefined) store.delete(property);
    else store.set(property, value);
    if (property === 'window_window_bar_style') applyWindowFrame(value);
};

ipcMain.handle('settings-get', (_e, data: { property: string }) => store.get(data.property));
ipcMain.handle('settings-set', (_e, data: { property: string; value: unknown }) =>
    setSetting(data.property, data.value),
);
ipcMain.handle('settings-set-sync', (_e, data: { property: string; value: unknown }) =>
    setSetting(data.property, data.value),
);

ipcMain.handle('window-minimize', () => win.minimize());
ipcMain.handle('window-maximize', () => win.maximize());
ipcMain.handle('window-unmaximize', () => win.unmaximize());
ipcMain.handle('window-close', () => win.close());
ipcMain.handle('window-quit', () => win.destroy());
ipcMain.handle('app-restart', () => relaunch());
ipcMain.handle('theme-set', (_e, theme: string) =>
    win.setTheme(theme === 'dark' || theme === 'light' ? theme : null),
);

ipcMain.handle('open-item', (_e, path: string) => openPath(path));
ipcMain.handle('download-url', (_e, url: string) => openUrl(url));
// mêmes options que dialog.showOpenDialog d'Electron (seuls les filtres servent) ; chemin ou null
ipcMain.handle(
    'open-file-selector',
    (_e, options?: { filters?: { extensions: string[]; name: string }[] }) =>
        open({ directory: false, filters: options?.filters, multiple: false }),
);

// Pas encore portés : réponses neutres plutôt qu'un aller-retour Rust à chaque appel
const neutral: Record<string, unknown> = {
    'app-check-for-updates': { updateAvailable: false },
    'app-get-downloaded-update': null,
    'password-get': null,
    'password-set': false,
    'power-save-blocker-is-started': false,
};
Object.entries(neutral).forEach(([channel, value]) => ipcMain.handle(channel, () => value));

// Envoyés en continu par le renderer pour mpv / la télécommande / MPRIS, absents sous Tauri
[
    'global-media-keys-disable',
    'global-media-keys-enable',
    'input-focus-state',
    'logger-set-level',
    'password-remove',
    'power-save-blocker-start',
    'power-save-blocker-stop',
    'update-accent-color',
    'update-confirm-queue-changes-setting',
    'update-favorite',
    'update-lyrics',
    'update-playback',
    'update-position',
    'update-private-mode',
    'update-queue',
    'update-radio-status',
    'update-rating',
    'update-repeat',
    'update-seek',
    'update-shuffle',
    'update-sidebar-collapsed',
    'update-song',
    'update-volume',
    'visualizer-set-local-surface-visible',
].forEach((channel) => ipcMain.on(channel, () => undefined));

// Electron recopiait document.title (« KAKI — Damso — Feishin ») dans le titre de la fenêtre,
// que lisent Streamlabs et la barre des tâches ; Tauri ne le fait pas
let windowTitle = '';
new MutationObserver(() => {
    if (document.title === windowTitle) return;
    windowTitle = document.title;
    win.setTitle(windowTitle).catch(() => {});
}).observe(document.head, { characterData: true, childList: true, subtree: true });

// Liens externes : dans le navigateur, comme setWindowOpenHandler + shell.openExternal sous Electron
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);
window.open = (url?: string | URL) => {
    if (url && isWebUrl(String(url))) openUrl(String(url));
    return null;
};
document.addEventListener(
    'click',
    (event) => {
        const link = (event.target as Element | null)?.closest?.(
            'a[href]',
        ) as HTMLAnchorElement | null;
        if (link && isWebUrl(link.href) && new URL(link.href).origin !== location.origin) {
            event.preventDefault();
            openUrl(link.href);
        }
    },
    true,
);

// Fenêtre sans cadre : Feishin marque sa barre de titre en CSS `-webkit-app-region: drag`,
// que Tauri n'interprète pas. On démarre le déplacement à la main.
const appRegion = (el: Element) =>
    getComputedStyle(el).getPropertyValue('-webkit-app-region') ||
    getComputedStyle(el).getPropertyValue('app-region');

const inDragRegion = (target: EventTarget | null) => {
    for (let el = target as Element | null; el; el = el.parentElement) {
        if (el.closest('button, input, textarea, select, a, [role="button"]') === el) return false;
        const region = appRegion(el);
        if (region === 'no-drag') return false;
        if (region === 'drag') return true;
    }
    return false;
};

document.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !inDragRegion(event.target)) return;
    if (event.detail === 2) win.toggleMaximize();
    else win.startDragging();
});
