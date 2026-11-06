// Équivalent d'electron-store : copie mémoire de src-tauri settings.json, lue de façon synchrone
// comme `store.get()` côté Electron, et réécrite en entier (regroupée) à chaque modification.
import { invoke } from '@tauri-apps/api/core';
import get from 'lodash/get';
import set from 'lodash/set';
import unset from 'lodash/unset';

let cache: Record<string, unknown> = {};
let saveTimer: null | ReturnType<typeof setTimeout> = null;

export const loadSettings = async () => {
    cache =
        (await invoke<Record<string, unknown>>('ipc', { args: [], channel: 'settings-load' })) ??
        {};
};

const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        invoke('ipc', { args: [cache], channel: 'settings-save' }).catch((error) =>
            console.error('[tauri] sauvegarde des réglages', error),
        );
    }, 300);
};

// electron-store accepte les clés pointées ("a.b"), d'où lodash get/set
export const store = {
    delete: (key: string) => {
        unset(cache, key);
        scheduleSave();
    },
    get: (key: string, fallback?: unknown) => get(cache, key, fallback),
    set: (key: string, value: unknown) => {
        if (value === undefined) unset(cache, key);
        else set(cache, key, value);
        scheduleSave();
    },
};
