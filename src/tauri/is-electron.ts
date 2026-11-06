// Le renderer active les fonctions « appli de bureau » via is-electron : sous Tauri, window.api
// est fourni par le preload d'origine branché sur src/tauri/electron-shim.ts.
const isElectron = () => true;

export default isElectron;
