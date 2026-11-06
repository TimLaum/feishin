// Passage du fork à Tauri : sous Electron, recopie régulièrement les données du navigateur
// (localStorage + IndexedDB : réglages, connexion, abonnements hors ligne, file d'attente) dans
// <userData>/tauri-migration.json, que la version Tauri reprend à son premier lancement
// (src-tauri/src/migration.rs). Sans effet dans le build web et dans Tauri.
import { entries } from 'idb-keyval';
import isElectron from 'is-electron';

// cache des paroles (react-query), reconstruit tout seul : inutile de le transférer
const SKIPPED_IDB_KEYS = new Set(['feishin']);

const exportForTauri = async () => {
    const localStorageData = Object.fromEntries(
        Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    );
    const idb = Object.fromEntries(
        (await entries()).filter(([key]) => typeof key === 'string' && !SKIPPED_IDB_KEYS.has(key)),
    );
    window.api.ipc.send(
        'tauri-migration-export',
        JSON.stringify({ idb, localStorage: localStorageData, version: 1 }),
    );
};

export const startTauriMigrationExport = () => {
    if (!isElectron() || '__TAURI_INTERNALS__' in window) return;
    const run = () => exportForTauri().catch((error) => console.error('tauri-migration', error));
    // après la réhydratation des stores, puis régulièrement et juste avant une mise à jour
    setTimeout(run, 30_000);
    setInterval(run, 10 * 60 * 1000);
    window.api.utils.rendererUpdateDownloaded(run);
};
