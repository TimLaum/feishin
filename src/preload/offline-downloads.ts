import { ipcRenderer } from 'electron';

export interface OfflineDownloadProgress {
    key: string;
    received: number;
    total: number;
}

export interface OfflineDownloadRequest {
    container?: null | string;
    coverUrl?: null | string;
    key: string;
    url: string;
}

export interface OfflineDownloadResult {
    coverRelPath: null | string;
    filePath: string;
    relPath: string;
    size: number;
}

const download = (args: OfflineDownloadRequest): Promise<OfflineDownloadResult> => {
    return ipcRenderer.invoke('offline-download', args);
};

const remove = (relPaths: string[]): Promise<void> => {
    return ipcRenderer.invoke('offline-remove', relPaths);
};

const verify = (relPaths: string[]): Promise<Record<string, boolean>> => {
    return ipcRenderer.invoke('offline-verify', relPaths);
};

const openFolder = (): Promise<void> => {
    return ipcRenderer.invoke('offline-open-folder');
};

const getDirectory = (): Promise<string> => {
    return ipcRenderer.invoke('offline-get-directory');
};

const onProgress = (cb: (data: OfflineDownloadProgress) => void) => {
    const listener = (_event: unknown, data: OfflineDownloadProgress) => cb(data);
    ipcRenderer.on('offline-download-progress', listener);

    return () => {
        ipcRenderer.removeListener('offline-download-progress', listener);
    };
};

export const offlineDownloads = {
    download,
    getDirectory,
    onProgress,
    openFolder,
    remove,
    verify,
};

export type OfflineDownloads = typeof offlineDownloads;
