// Fork: les mises à jour automatiques sont désactivées en dur pour ne jamais
// récupérer les releases officielles de jeffvli/feishin.
export const disableAutoUpdates = () => {
    return true;
};

export const isMacOS = () => {
    return process.platform === 'darwin';
};

export const isWindows = () => {
    return process.platform === 'win32';
};

export const isLinux = () => {
    return process.platform === 'linux';
};
