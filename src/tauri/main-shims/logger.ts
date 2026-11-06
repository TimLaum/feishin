// Remplace /@/main/logger (electron-log) pour les modules main exécutés dans la webview
const log = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    verbose: console.debug,
    warn: console.warn,
};

export default log;
