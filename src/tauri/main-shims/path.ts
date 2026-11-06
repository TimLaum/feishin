// `path` des modules main exécutés dans la webview (thèmes perso). Le shim du renderer ne fait
// que join ; ici il faut resolve/relative/isAbsolute corrects sous Windows (C:\…, \\serveur\…),
// car le module thèmes s'en sert pour refuser les feuilles de style hors du dossier des thèmes.
// Les chemins renvoyés utilisent « / », que Windows accepte partout.

const DRIVE = /^[a-zA-Z]:/;

const split = (p: string) => {
    const s = p.replace(/\\/g, '/');
    // racine : « C:/ », « //serveur/partage/ » ou « / »
    const unc = /^\/\/[^/]+\/[^/]+/.exec(s);
    const root = unc
        ? unc[0] + '/'
        : DRIVE.test(s)
          ? s.slice(0, 2) + (s[2] === '/' ? '/' : '')
          : s.startsWith('/')
            ? '/'
            : '';
    return { rest: s.slice(unc ? unc[0].length : root.length), root };
};

export const sep = '/';

export const isAbsolute = (p: string) => /^([a-zA-Z]:)?[\\/]/.test(p);

export const normalize = (p: string) => {
    const { rest, root } = split(p);
    const out: string[] = [];
    for (const part of rest.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (out.length && out[out.length - 1] !== '..') out.pop();
            else if (!root) out.push('..');
        } else out.push(part);
    }
    return root + out.join('/') || (root ? root : '.');
};

export const join = (...parts: string[]) => normalize(parts.filter(Boolean).join('/'));

export const resolve = (...parts: string[]) => {
    let resolved = '';
    for (const part of parts) {
        if (!part) continue;
        resolved = isAbsolute(part) ? part : resolved ? `${resolved}/${part}` : part;
    }
    return normalize(resolved);
};

export const relative = (from: string, to: string) => {
    const a = split(normalize(from));
    const b = split(normalize(to));
    // autre lecteur ou autre partage : pas de chemin relatif, comme Node
    if (a.root.toLowerCase() !== b.root.toLowerCase()) return normalize(to);
    const fa = a.rest.split('/').filter(Boolean);
    const fb = b.rest.split('/').filter(Boolean);
    let i = 0;
    // Windows ignore la casse des chemins
    while (i < fa.length && i < fb.length && fa[i].toLowerCase() === fb[i].toLowerCase()) i++;
    return [...fa.slice(i).map(() => '..'), ...fb.slice(i)].join('/');
};

export const basename = (p: string, ext?: string) => {
    const base = normalize(p).split('/').pop() ?? '';
    return ext && base.toLowerCase().endsWith(ext.toLowerCase())
        ? base.slice(0, -ext.length)
        : base;
};

export const dirname = (p: string) => {
    const n = normalize(p);
    const i = n.lastIndexOf('/');
    return i <= 0 ? split(n).root || '.' : n.slice(0, i) || '/';
};

export const extname = (p: string) => {
    const base = basename(p);
    const i = base.lastIndexOf('.');
    return i > 0 ? base.slice(i) : '';
};

export default { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep };
