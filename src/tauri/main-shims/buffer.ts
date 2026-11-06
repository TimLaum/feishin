// Buffer des modules main exécutés dans la webview : seul Buffer.from(octets).toString('base64')
// sert (pochette lue par l'éditeur de tags). Injecté par tauri.vite.config.ts, pas en global.
import { FileBytes } from './fs';

export const Buffer = {
    from: (data: ArrayLike<number>) => FileBytes.from(data),
};
