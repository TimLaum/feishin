// Mises à jour automatiques, comme le fork sous Electron : vérification peu après le démarrage
// puis toutes les 10 min ; une fois la mise à jour téléchargée, le renderer propose de
// l'installer (src/renderer/update-ready-dialog.tsx). Releases : workflow fork-release.yml.
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';

import { emitLocal, ipcMain } from './electron-shim';
import { store } from './settings-cache';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

let downloaded: null | Update = null;
let busy = false;

const checkAndDownload = async () => {
    if (busy || downloaded || store.get('disable_auto_updates') === true) return;
    busy = true;
    try {
        const update = await check();
        if (update) {
            await update.download();
            downloaded = update;
            emitLocal('update-downloaded', update.version);
        }
    } catch (error) {
        console.warn('[tauri] vérification des mises à jour', error);
    } finally {
        busy = false;
    }
};

export const startUpdater = () => {
    ipcMain.handle('app-check-for-updates', async () => {
        const update = await check();
        return { updateAvailable: !!update, version: update?.version };
    });
    ipcMain.handle('app-get-downloaded-update', () => downloaded?.version ?? null);
    ipcMain.handle('app-install-update', async () => {
        if (!downloaded) return;
        // sous Windows l'installeur ferme l'appli lui-même ; relaunch sert aux autres systèmes
        await downloaded.install();
        await relaunch();
    });

    // pas au tout début : le démarrage reste prioritaire
    setTimeout(checkAndDownload, 15_000);
    setInterval(checkAndDownload, CHECK_INTERVAL_MS);
};
