import { useState } from 'react';

import { plural, toDownloadRequest } from '../api';
import { useStartBatch } from '../hooks/use-batches';
import { useWebSearchSelectionStore } from '../store/web-search-selection-store';
import styles from './web-search.module.css';

import { Button } from '/@/shared/components/button/button';
import { Text } from '/@/shared/components/text/text';

/** Monté au niveau du layout : la sélection survit à la navigation. */
export const SelectionBar = () => {
    const entries = useWebSearchSelectionStore((s) => s.entries);
    const clear = useWebSearchSelectionStore((s) => s.clear);
    const startBatch = useStartBatch();
    const [isStarting, setIsStarting] = useState(false);

    const values = Object.values(entries);
    if (!values.length) return null;

    const tracks = values.flatMap((e) => (e.kind === 'track' ? [e.item] : []));
    const albums = values.flatMap((e) => (e.kind === 'album' ? [e.item] : []));
    const label = [
        tracks.length ? plural(tracks.length, 'titre') : null,
        albums.length ? plural(albums.length, 'album') : null,
    ]
        .filter(Boolean)
        .join(' · ');

    const handleDownload = async () => {
        setIsStarting(true);
        const res = await startBatch({
            album_ids: albums.map((a) => a.deezer_id),
            name: `Sélection — ${label}`,
            tracks: tracks.map(toDownloadRequest),
        });
        setIsStarting(false);
        if (res) clear();
    };

    return (
        <div className={styles.selectionBar}>
            <Button onClick={clear} size="xs" variant="subtle">
                Annuler
            </Button>
            <Text fw={600} size="sm">
                {label}
            </Text>
            <Button loading={isStarting} onClick={handleDownload} size="xs" variant="filled">
                Télécharger
            </Button>
        </div>
    );
};
