// Premier lancement après Feishin Electron : réinjecte son localStorage et ses données IndexedDB
// (src-tauri/src/migration.rs) avant que les stores du renderer ne les lisent.
import { invoke } from '@tauri-apps/api/core';
import { setMany } from 'idb-keyval';

type ElectronData = { idb?: Record<string, unknown>; localStorage?: Record<string, null | string> };

export const migrateFromElectron = async () => {
    try {
        const data = await invoke<ElectronData | null>('ipc', {
            args: [],
            channel: 'electron-migration-pending',
        });
        if (!data) return;
        for (const [key, value] of Object.entries(data.localStorage ?? {})) {
            if (value !== null) localStorage.setItem(key, value);
        }
        await setMany(Object.entries(data.idb ?? {}));
        await invoke('ipc', { args: [], channel: 'electron-migration-done' });
    } catch (error) {
        // pas de marqueur posé : nouvel essai au prochain lancement
        console.error('[tauri] reprise des données Electron', error);
    }
};
