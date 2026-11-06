// Recherche MusicBrainz pour l'éditeur de tags : morceaux candidats (un par édition) puis
// correspondance des données d'une édition vers les champs taglib (mêmes clés que Picard).
// API publique sans clé ; MusicBrainz demande au plus une requête par seconde.

const API = 'https://musicbrainz.org/ws/2';

export interface MbCandidate {
    artist: string;
    country?: string;
    date?: string;
    disambiguation?: string;
    isrc?: string;
    key: string;
    lengthMs?: number;
    official: boolean;
    recordingId: string;
    releaseId: string;
    releaseTitle: string;
    releaseType?: string;
    score: number;
    title: string;
}

export interface MbRelease {
    'artist-credit'?: ArtistCredit;
    barcode?: null | string;
    'cover-art-archive'?: { front?: boolean };
    date?: string;
    genres?: { count: number; name: string }[];
    id: string;
    'label-info'?: { 'catalog-number'?: null | string; label?: null | { name: string } }[];
    media: {
        format?: null | string;
        position: number;
        'track-count': number;
        tracks?: MbTrack[];
    }[];
    'release-group': {
        'first-release-date'?: string;
        genres?: { count: number; name: string }[];
        id: string;
    };
    title: string;
}

type ArtistCredit = { artist: { id: string; name: string }; joinphrase?: string; name: string }[];

interface MbRecording {
    'artist-credit'?: ArtistCredit;
    id: string;
    isrcs?: string[];
    length?: number;
    releases?: MbSearchRelease[];
    score?: number;
    title: string;
}

interface MbSearchRelease {
    country?: string;
    date?: string;
    disambiguation?: string;
    id: string;
    'release-group'?: { 'primary-type'?: string; 'secondary-types'?: string[] };
    status?: string;
    title: string;
}

interface MbTrack {
    'artist-credit'?: ArtistCredit;
    id: string;
    position: number;
    recording: { id: string };
    title: string;
}

export const joinCredit = (credit?: ArtistCredit) =>
    (credit ?? [])
        .map((c) => c.name + (c.joinphrase ?? ''))
        .join('')
        .trim();

// Dans une requête Lucene entre guillemets, seuls " et \ sont à échapper
const quote = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;

export const buildQuery = (title: string, artist: string) =>
    [
        title.trim() && `recording:${quote(title.trim())}`,
        artist.trim() && `artist:${quote(artist.trim())}`,
    ]
        .filter(Boolean)
        .join(' AND ');

let lastCall = 0;

const mbFetch = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();
    const response = await fetch(`${API}${path}`, {
        headers: { Accept: 'application/json' },
        signal,
    });
    if (response.status === 503)
        throw new Error('MusicBrainz est saturé, réessaie dans un instant');
    if (!response.ok) throw new Error(`MusicBrainz : HTTP ${response.status}`);
    return response.json();
};

/** Une ligne par (enregistrement, édition), les plus probables d'abord. */
export const toCandidates = (
    recordings: MbRecording[],
    durationMs?: null | number,
): MbCandidate[] => {
    const candidates = recordings.flatMap((rec) =>
        (rec.releases ?? []).map((rel) => ({
            artist: joinCredit(rec['artist-credit']),
            country: rel.country,
            date: rel.date,
            disambiguation: rel.disambiguation || undefined,
            isrc: rec.isrcs?.[0],
            key: `${rec.id}:${rel.id}`,
            lengthMs: rec.length,
            official: rel.status === 'Official',
            recordingId: rec.id,
            releaseId: rel.id,
            releaseTitle: rel.title,
            releaseType: [
                rel['release-group']?.['primary-type'],
                ...(rel['release-group']?.['secondary-types'] ?? []),
            ]
                .filter(Boolean)
                .join(' + '),
            score: rec.score ?? 0,
            title: rec.title,
        })),
    );

    // durée à ±3 s, puis pertinence MusicBrainz, éditions officielles, puis la plus ancienne
    const durationOk = (c: MbCandidate) =>
        durationMs && c.lengthMs ? Math.abs(c.lengthMs - durationMs) <= 3000 : false;
    return candidates.sort(
        (a, b) =>
            Number(durationOk(b)) - Number(durationOk(a)) ||
            b.score - a.score ||
            Number(b.official) - Number(a.official) ||
            (a.date || '9999').localeCompare(b.date || '9999'),
    );
};

export const searchRecordings = async (
    title: string,
    artist: string,
    durationMs?: null | number,
    signal?: AbortSignal,
) => {
    const query = buildQuery(title, artist);
    if (!query) return [];
    const data = await mbFetch<{ recordings?: MbRecording[] }>(
        `/recording/?query=${encodeURIComponent(query)}&limit=25&fmt=json`,
        signal,
    );
    return toCandidates(data.recordings ?? [], durationMs).slice(0, 40);
};

export const getRelease = (releaseId: string) =>
    mbFetch<MbRelease>(
        `/release/${releaseId}?inc=artist-credits+labels+recordings+release-groups+genres&fmt=json`,
    );

/** Champs taglib proposés pour ce morceau de cette édition ; les listes d'identifiants sont des tableaux. */
export const releaseToTags = (
    release: MbRelease,
    candidate: Pick<MbCandidate, 'isrc' | 'recordingId'>,
): null | Record<string, string | string[]> => {
    const medium = release.media.find((m) =>
        m.tracks?.some((t) => t.recording.id === candidate.recordingId),
    );
    const track = medium?.tracks?.find((t) => t.recording.id === candidate.recordingId);
    if (!medium || !track) return null;

    const trackCredit = track['artist-credit'] ?? release['artist-credit'];
    const genre = [
        ...(release.genres?.length ? release.genres : (release['release-group'].genres ?? [])),
    ].sort((a, b) => b.count - a.count)[0]?.name;
    const label = release['label-info']?.[0];
    const originalDate = release['release-group']['first-release-date'];

    const tags: Record<string, null | string | string[] | undefined> = {
        album: release.title,
        albumArtist: joinCredit(release['artist-credit']),
        artist: joinCredit(trackCredit),
        barcode: release.barcode,
        catalogNumber: label?.['catalog-number'],
        date: release.date,
        discNumber: String(medium.position),
        genre,
        isrc: candidate.isrc,
        label: label?.label?.name,
        media: medium.format,
        musicbrainzArtistId: (trackCredit ?? []).map((c) => c.artist.id),
        musicbrainzReleaseArtistId: (release['artist-credit'] ?? []).map((c) => c.artist.id),
        musicbrainzReleaseGroupId: release['release-group'].id,
        musicbrainzReleaseId: release.id,
        musicbrainzReleaseTrackId: track.id,
        musicbrainzTrackId: candidate.recordingId,
        originalDate: originalDate && originalDate !== release.date ? originalDate : undefined,
        title: track.title,
        totalDiscs: String(release.media.length),
        totalTracks: String(medium['track-count']),
        trackNumber: String(track.position),
    };

    return Object.fromEntries(
        Object.entries(tags).filter((entry): entry is [string, string | string[]] =>
            Array.isArray(entry[1]) ? entry[1].length > 0 : !!entry[1],
        ),
    );
};

/** Pochette de face depuis Cover Art Archive (1200 px), ou null si absente. */
export const getFrontCover = async (releaseId: string) => {
    const response = await fetch(`https://coverartarchive.org/release/${releaseId}/front-1200`);
    if (!response.ok) return null;
    return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get('content-type')?.split(';')[0] || 'image/jpeg',
    };
};
