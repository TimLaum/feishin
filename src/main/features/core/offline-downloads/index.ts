import type { IncomingMessage } from 'electron';

import { app, ipcMain, net, shell } from 'electron';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

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
    const root = resolve(OFFLINE_DIR);
    const filePath = resolve(root, relPath);
    // startsWith seul laisserait passer un dossier frere du type "offline-audio-x"
    if (filePath !== root && !filePath.startsWith(root + sep)) {
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

/**
 * `net.fetch` convertit les en-têtes de la réponse en objet `Headers`, ce qui lève
 * une TypeError ("Cannot convert argument to a ByteString") dès qu'un en-tête
 * contient un caractère non-ASCII — typiquement le
 * `Content-Disposition: attachment; filename="…"` d'un titre accentué ou dans un
 * alphabet non latin. L'exception est émise depuis un listener interne d'Electron,
 * donc impossible à rattraper : elle fait tomber le process principal.
 * `net.request` expose les en-têtes bruts et n'a pas ce défaut.
 */
const requestStream = (url: string): Promise<IncomingMessage> => {
    return new Promise((res, rej) => {
        const request = net.request(url);
        request.on('response', res);
        request.on('error', rej);
        request.end();
    });
};

const headerValue = (response: IncomingMessage, name: string): string => {
    const value = response.headers[name];
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
};

// Electron implémente l'interface Readable sur IncomingMessage sans la déclarer
// dans ses typings.
const responseBody = (response: IncomingMessage): Readable => {
    return response as unknown as Readable;
};

const readBody = async (response: IncomingMessage): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of responseBody(response)) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
};

const downloadToFile = async (
    url: string,
    filePath: string,
    onProgress?: (received: number, total: number) => void,
): Promise<number> => {
    const response = await requestStream(url);
    const body = responseBody(response);

    if (response.statusCode >= 400) {
        body.destroy();
        throw new Error(`HTTP ${response.statusCode} ${response.statusMessage}`);
    }

    const total = Number(headerValue(response, 'content-length')) || 0;

    let received = 0;
    let lastReport = 0;

    body.on('data', (chunk: Buffer) => {
        received += chunk.length;

        const now = Date.now();
        if (onProgress && now - lastReport > 250) {
            lastReport = now;
            onProgress(received, total);
        }
    });

    try {
        await pipeline(body, createWriteStream(filePath));
        return received;
    } catch (err) {
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
                const coverResponse = await requestStream(args.coverUrl);
                if (coverResponse.statusCode < 400) {
                    const contentType = headerValue(coverResponse, 'content-type');
                    const coverExt = contentType.includes('png') ? 'png' : 'jpg';
                    const coverPath = join(targetDir, `${songId}.${coverExt}`);
                    const buffer = await readBody(coverResponse);
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

    let relPath: string;
    try {
        relPath = decodeURIComponent(encoded);
    } catch {
        // decodeURIComponent leve sur une sequence % malformee
        return new Response(null, { status: 400, statusText: 'Bad Request' });
    }

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
