// Point d'entrée du build Tauri (tauri.vite.config.ts) : prépare ce que le preload Electron
// fournissait, puis charge le renderer inchangé.
import { lazyMainModule, loadAppPaths } from './electron-shim';
import { applyWindowFrame } from './handlers';
import { loadSettings } from './settings-cache';
import { startUpdater } from './updater';

const ua = navigator.userAgent;

// Le preload lit process.env / process.platform / process.contextIsolated (src/main/env.ts)
(globalThis as any).process ??= {
    contextIsolated: true,
    env: {},
    platform: ua.includes('Windows') ? 'win32' : ua.includes('Mac OS') ? 'darwin' : 'linux',
};

// Protocole hors ligne : WebView2 et Android exposent feishin:// en http://feishin.localhost
(window as any).FEISHIN_OFFLINE_PREFIX =
    ua.includes('Windows') || ua.includes('Android')
        ? 'http://feishin.localhost/offline/'
        : 'feishin://localhost/offline/';

(async () => {
    await Promise.all([loadSettings(), loadAppPaths()]);
    applyWindowFrame();
    // construit window.api, comme le preload d'Electron
    await import('../preload/index');
    // modules main exécutés dans la webview, chargés au premier usage :
    // paroles (requêtes via le plugin HTTP), éditeur de tags et thèmes perso (fichiers via Rust)
    lazyMainModule(
        [
            'lyric-by-remote-id',
            'lyric-by-song',
            'lyric-convert-furigana',
            'lyric-convert-furigana-fragment',
            'lyric-convert-romaji',
            'lyric-convert-romaji-tokens',
            'lyric-parse-text-tokens',
            'lyric-search',
        ],
        () => import('../main/features/core/lyrics/index'),
    );
    lazyMainModule(
        [
            'cancel-read-song-metadata',
            'read-local-image',
            'read-song-metadata-batch',
            'write-song-tags-batch',
        ],
        () => import('../main/features/core/tag-editor/index'),
    );
    lazyMainModule(
        ['custom-themes-get', 'custom-themes-open-folder', 'custom-themes-reload'],
        () => import('../main/features/core/custom-themes/index'),
    );
    // pas de mise à jour intégrée sur Android : l'APK se réinstalle à la main
    if (!ua.includes('Android')) startUpdater();
    await import('../renderer/main');
})().catch((error) => {
    console.error('[tauri] démarrage', error);
    document.body.textContent = `Erreur au démarrage : ${error}`;
});
