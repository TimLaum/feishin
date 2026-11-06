// Build du renderer pour Tauri : même interface que le build web, mais avec le preload Electron
// d'origine branché sur src/tauri (voir src/tauri/electron-shim.ts) au lieu de la PWA.
import path from 'path';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import { ViteEjsPlugin } from 'vite-plugin-ejs';

import { kuromojiDictionaryPlugin } from './vite.kuromoji-plugin';
import { createReactPlugin } from './vite.react-plugin';

const src = (p: string) => path.resolve(__dirname, 'src', p);
const mainDir = normalizePath(src('main')) + '/';

// Les modules main exécutés dans la webview (paroles, tags) reçoivent des remplaçants pour ce
// qui n'existe que sous Node : réglages electron-store, axios hors CORS, fichiers, chemins, taglib.
const mainShims = (): Plugin => ({
    enforce: 'pre',
    name: 'feishin-tauri-main-shims',
    resolveId(source, importer) {
        if (!importer || !normalizePath(importer).startsWith(mainDir)) return null;
        if (source === 'axios') return src('tauri/main-shims/axios.ts');
        if (source === 'fs') return src('tauri/main-shims/fs.ts');
        // l'alias global « path » pointe déjà sur le shim minimal du renderer
        if (source === 'path' || normalizePath(source).endsWith('/renderer/shims/path.ts')) {
            return src('tauri/main-shims/path.ts');
        }
        if (source === 'taglib-wasm') return src('tauri/main-shims/taglib.ts');
        if (source === '../settings' || source === '../../settings') {
            return src('tauri/main-shims/settings.ts');
        }
        return null;
    },
});

// `Buffer` n'existe que sous Node : on l'importe dans les seuls modules main qui l'utilisent
const mainBuffer = (): Plugin => ({
    name: 'feishin-tauri-main-buffer',
    transform(code, id) {
        if (!normalizePath(id).startsWith(mainDir) || !/\bBuffer\./.test(code)) return null;
        const shim = JSON.stringify(normalizePath(src('tauri/main-shims/buffer.ts')));
        return { code: `import { Buffer } from ${shim};\n${code}`, map: null };
    },
});

// index.html charge src/tauri/bridge.ts, qui charge à son tour le renderer
const bridgeEntry = (): Plugin => ({
    name: 'feishin-tauri-entry',
    // order 'pre' : avant que Vite n'ait déjà remplacé main.tsx par le bundle
    transformIndexHtml: {
        handler: (html) => html.replace('src="main.tsx"', 'src="../tauri/bridge.ts"'),
        order: 'pre',
    },
});

export default defineConfig({
    base: './',
    build: {
        emptyOutDir: true,
        outDir: path.resolve(__dirname, './out/tauri-web'),
        rollupOptions: {
            input: { index: normalizePath(src('renderer/index.html')) },
        },
        sourcemap: false,
    },
    css: {
        modules: {
            generateScopedName: 'fs-[name]-[local]',
            localsConvention: 'camelCase',
        },
    },
    plugins: [
        mainShims(),
        mainBuffer(),
        bridgeEntry(),
        createReactPlugin(),
        kuromojiDictionaryPlugin(),
        ViteEjsPlugin({ root: normalizePath(src('renderer')), web: false }),
    ],
    resolve: {
        alias: [
            { find: /^\/@\/main\/logger$/, replacement: src('tauri/main-shims/logger.ts') },
            { find: /^electron$/, replacement: src('tauri/electron-shim.ts') },
            { find: /^is-electron$/, replacement: src('tauri/is-electron.ts') },
            { find: '/@/i18n', replacement: src('i18n') },
            {
                find: '/@/lyrics-conversion-api',
                replacement: src('main/features/core/lyrics/furigana.ts'),
            },
            { find: '/@/main', replacement: src('main') },
            { find: '/@/preload', replacement: src('preload') },
            { find: '/@/remote', replacement: src('remote') },
            { find: '/@/renderer', replacement: src('renderer') },
            { find: '/@/shared', replacement: src('shared') },
            { find: /^path$/, replacement: src('renderer/shims/path.ts') },
        ],
    },
    root: src('renderer'),
});
