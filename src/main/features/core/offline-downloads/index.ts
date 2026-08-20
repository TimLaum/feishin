import { app, ipcMain, net, shell } from 'electron';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { Readable } from 'stream';

/**
 * Téléchargement local de morceaux pour l'écoute hors ligne.
 * Les fichiers sont stockés dans <userData>/offline-audio/<serverId>/<songId>.<ext>
 * et servis au renderer via le protocole feishin://offline/<relPath>.
 */

const OFFLINE_DIR = join(app.getPath('userData'), 'offline-audio');

const MIME_BY_EXT: Record<string, string> = {
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.webp': 'image/webp',
};

const sanitizeSegment = (segment: string): string => {
    return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const resolveSafe = (relPath: string): null | string => {
    const filePath = resolve(OFFLINE_DIR, relPath);
    if (!filePath.startsWith(resolve(OFFLINE_DIR))) {
        return null;
    }
    return filePath;
};

interface OfflineDownloadArgs {
    // extension préférée (song.container), ex. "flac"
    container?: null | string;
    coverUrl?: null | string;
    // "<serverId>/<songId>" — segments assainis côté main
    key: string;
    url: string;
}

interface OfflineDownloadResult {
    coverRelPath: null | string;
    filePath: string;
    relPath: string;
    size: number;
}

const downloadToFile = async (
    url: string,
    filePath: string,
    onProgress?: (received: number, total: number) => void,
): Promise<number> => {
    const response = await net.fetch(url);

    if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const total = Number(response.headers.get('content-length')) || 0;
    const writeStream = createWriteStream(filePath);
    const reader = response.body.getReader();

    let received = 0;
    let lastReport = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            received += value.byteLength;

            const canContinue = writeStream.write(Buffer.from(value));
            if (!canContinue) {
                await new Promise<void>((res) => writeStream.once('drain', res));
            }

            const now = Date.now();
            if (onProgress && now - lastReport > 250) {
                lastReport = now;
                onProgress(received, total);
            }
        }

        await new Promise<void>((res, rej) => {
            writeStream.end(() => res());
            writeStream.on('error', rej);
        });

        return received;
    } catch (err) {
        writeStream.destroy();
        await rm(filePath, { force: true }).catch(() => {});
        throw err;
    }
};

const guessAudioExt = (url: string, container?: null | string): string => {
    if (container && /^[a-zA-Z0-9]{2,5}$/.test(container)) {
        return container.toLowerCase();
    }
    const urlExt = extname(new URL(url).pathname).slice(1);
    if (urlExt && urlExt.length <= 5) return urlExt.toLowerCase();
    return 'mp3';
};

ipcMain.handle(
    'offline-download',
    async (event, args: OfflineDownloadArgs): Promise<OfflineDownloadResult> => {
        const [serverSegment, songSegment] = args.key.split('/');
        const serverDir = sanitizeSegment(serverSegment ?? 'default');
        const songId = sanitizeSegment(songSegment ?? args.key);

        const targetDir = join(OFFLINE_DIR, serverDir);
        await mkdir(targetDir, { recursive: true });

        const ext = guessAudioExt(args.url, args.container);
        const relPath = `${serverDir}/${songId}.${ext}`;
        const filePath = join(targetDir, `${songId}.${ext}`);

        const size = await downloadToFile(args.url, filePath, (received, total) => {
            if (!event.sender.isDestroyed()) {
                event.sender.send('offline-download-progress', {
                    key: args.key,
                    received,
                    total,
                });
            }
        });

        // Pochette : best-effort, un échec n'annule pas le téléchargement audio
        let coverRelPath: null | string = null;
        if (args.coverUrl) {
            try {
                const coverResponse = await net.fetch(args.coverUrl);
                if (coverResponse.ok) {
                    const contentType = coverResponse.headers.get('content-type') ?? '';
                    const coverExt = contentType.includes('png') ? 'png' : 'jpg';
                    const coverPath = join(targetDir, `${songId}.${coverExt}`);
                    const buffer = Buffer.from(await coverResponse.arrayBuffer());
                    await new Promise<void>((res, rej) => {
                        const ws = createWriteStream(coverPath);
                        ws.on('error', rej);
                        ws.end(buffer, () => res());
                    });
                    coverRelPath = `${serverDir}/${songId}.${coverExt}`;
                }
            } catch {
                coverRelPath = null;
            }
        }

        return { coverRelPath, filePath, relPath, size };
    },
);

ipcMain.handle('offline-remove', async (_event, relPaths: string[]): Promise<void> => {
    for (const relPath of relPaths) {
        const filePath = resolveSafe(relPath);
        if (filePath) {
            await rm(filePath, { force: true }).catch(() => {});
        }
    }
});

ipcMain.handle(
    'offline-verify',
    async (_event, relPaths: string[]): Promise<Record<string, boolean>> => {
        const result: Record<string, boolean> = {};
        for (const relPath of relPaths) {
            const filePath = resolveSafe(relPath);
            if (!filePath) {
                result[relPath] = false;
                continue;
            }
            try {
                const fileStat = await stat(filePath);
                result[relPath] = fileStat.isFile() && fileStat.size > 0;
            } catch {
                result[relPath] = false;
            }
        }
        return result;
    },
);

ipcMain.handle('offline-open-folder', async (): Promise<void> => {
    await mkdir(OFFLINE_DIR, { recursive: true });
    await shell.openPath(OFFLINE_DIR);
});

ipcMain.handle('offline-get-directory', (): string => {
    return OFFLINE_DIR;
});

export const OFFLINE_PROTOCOL_PREFIX = 'feishin://offline/';

/**
 * Sert un fichier local au web player avec support des requêtes Range
 * (nécessaire pour le seek dans l'élément audio).
 */
export const handleOfflineProtocolRequest = async (request: Request): Promise<Response> => {
    const encoded = request.url.slice(OFFLINE_PROTOCOL_PREFIX.length).split('?')[0];
    const relPath = decodeURIComponent(encoded);
    const filePath = resolveSafe(relPath);

    if (!filePath) {
        return new Response(null, { status: 403, statusText: 'Forbidden' });
    }

    let fileStat;
    try {
        fileStat = await stat(filePath);
    } catch {
        return new Response(null, { status: 404, statusText: 'Not Found' });
    }

    const mime = MIME_BY_EXT[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const rangeHeader = request.headers.get('range');

    if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        const start = match?.[1] ? parseInt(match[1], 10) : 0;
        const end = match?.[2] ? parseInt(match[2], 10) : fileStat.size - 1;

        if (start >= fileStat.size || end >= fileStat.size || start > end) {
            return new Response(null, {
                headers: { 'Content-Range': `bytes */${fileStat.size}` },
                status: 416,
            });
        }

        const stream = Readable.toWeb(createReadStream(filePath, { end, start })) as ReadableStream;

        return new Response(stream, {
            headers: {
                'Accept-Ranges': 'bytes',
                'Content-Length': String(end - start + 1),
                'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
                'Content-Type': mime,
            },
            status: 206,
        });
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

    return new Response(stream, {
        headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(fileStat.size),
            'Content-Type': mime,
        },
        status: 200,
    });
};
