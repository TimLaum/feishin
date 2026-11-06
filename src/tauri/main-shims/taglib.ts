// taglib-wasm des modules main exécutés dans la webview : sous Node il ouvre les fichiers par
// leur chemin, ici on lui passe les octets lus par Rust, et on réécrit le fichier après edit().
import * as taglibWasm from 'taglib-wasm';

import { readBytes, writeBytes } from './fs';

export * from 'taglib-wasm';

// La mémoire de taglib-wasm est un ArrayBuffer redimensionnable : Node (Electron) accepte de le
// décoder, le TextDecoder de Chromium/WebView2 refuse. On décode une copie dans ce cas.
const decode = TextDecoder.prototype.decode;
TextDecoder.prototype.decode = function (
    input?: AllowSharedBufferSource,
    options?: TextDecodeOptions,
) {
    const buffer = input && (ArrayBuffer.isView(input) ? input.buffer : input);
    const resizable =
        buffer instanceof ArrayBuffer && (buffer as { resizable?: boolean }).resizable;
    if (
        resizable ||
        (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)
    ) {
        input = ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice()
            : new Uint8Array(input as ArrayBufferLike).slice();
    }
    return decode.call(this, input, options);
};

const named = async (path: string) => ({ data: await readBytes(path), name: path });

const wrap = (taglib: taglibWasm.TagLib): taglibWasm.TagLib =>
    new Proxy(taglib, {
        get(target, prop, receiver) {
            if (prop === 'open') {
                return async (input: taglibWasm.AudioFileInput, options?: unknown) =>
                    target.open(
                        typeof input === 'string' ? await named(input) : input,
                        options as any,
                    );
            }
            if (prop === 'edit') {
                return async (input: any, fn: (file: taglibWasm.AudioFile) => unknown) => {
                    if (typeof input !== 'string') return target.edit(input, fn as any);
                    const edited = await target.edit(await named(input), fn as any);
                    await writeBytes(input, edited);
                };
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });

export const TagLib = {
    initialize: async (...args: Parameters<typeof taglibWasm.TagLib.initialize>) =>
        wrap(await taglibWasm.TagLib.initialize(...args)),
};
