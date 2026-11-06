// `fs` des modules main exécutés dans la webview (éditeur de tags) : accès disque via Rust.
// Seules les fonctions réellement utilisées par les modules main portés (tags, thèmes) sont fournies.
import { invoke } from '@tauri-apps/api/core';

export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };

export const readBytes = async (path: string) =>
    new Uint8Array(await invoke<ArrayBuffer>('fs_read', { path }));

// corps binaire brut (pas de JSON) : un FLAC de 40 Mo passe sans conversion
export const writeBytes = (path: string, data: Uint8Array) =>
    invoke('fs_write', data, { headers: { path: encodeURIComponent(path) } });

// readFile renvoie un Buffer sous Node ; le module n'en utilise que toString('base64')
export class FileBytes extends Uint8Array {
    toString(encoding?: string) {
        if (encoding !== 'base64') return super.toString();
        let binary = '';
        for (let i = 0; i < this.length; i += 0x8000) {
            binary += String.fromCharCode(...this.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    }
}

const fsCall = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    const result = await invoke<T | { code: string; error: string }>('ipc', { args, channel });
    if (result && typeof result === 'object' && 'error' in result) {
        throw Object.assign(new Error(result.error), { code: result.code });
    }
    return result as T;
};

type StatResult = { isDirectory: boolean; isFile: boolean };

export const promises = {
    access: async (path: string, mode = constants.F_OK) => {
        const error = await invoke<null | { code: string; message: string }>('ipc', {
            args: [path, mode],
            channel: 'fs-access',
        });
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
    },
    mkdir: (path: string) => fsCall<null>('fs-mkdir', path),
    // seuls `name` et le mode withFileTypes servent
    readdir: async (path: string) =>
        (await fsCall<string[]>('fs-readdir', path)).map((name) => ({ name })),
    readFile: async (path: string, encoding?: string) => {
        const bytes = await readBytes(path);
        if (encoding) return new TextDecoder().decode(bytes);
        return new FileBytes(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    },
    rename: (from: string, to: string) => fsCall<null>('fs-rename', from, to),
    rm: (path: string) => fsCall<null>('fs-rm', path),
    stat: async (path: string) => {
        const stat = await fsCall<StatResult>('fs-stat', path);
        return { isDirectory: () => stat.isDirectory, isFile: () => stat.isFile };
    },
    writeFile: async (path: string, data: Uint8Array) => {
        await writeBytes(path, data);
    },
};

// fs.watch : pas d'événements disque côté webview, on compare l'état du dossier toutes les 3 s
export const watch = (path: string, listener: (event: string, filename: null | string) => void) => {
    let last: null | string = null;
    const timer = setInterval(async () => {
        const signature = await fsCall<string>('fs-dir-signature', path).catch(() => null);
        if (last !== null && signature !== last) listener('change', null);
        last = signature;
    }, 3000);
    return { close: () => clearInterval(timer) };
};

export default { constants, promises, watch };
