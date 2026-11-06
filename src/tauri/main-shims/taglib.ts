// taglib-wasm des modules main exécutés dans la webview (éditeur de tags). Le module lui passe
// déjà les octets du fichier (lus via main-shims/fs.ts) ; reste un écart de Chromium à combler.
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
