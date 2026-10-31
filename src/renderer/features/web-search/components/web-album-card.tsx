import clsx from 'clsx';

import { ArtistRelease, RECORD_TYPE_LABEL } from '../api';
import { albumSelectionKey } from '../store/web-search-selection-store';
import { SelectionCheckbox } from './selection-checkbox';
import { AlbumSearchResult } from './web-search-content';
import styles from './web-search.module.css';

import { Center } from '/@/shared/components/center/center';
import { Text } from '/@/shared/components/text/text';

interface WebAlbumCardProps {
    album: AlbumSearchResult | ArtistRelease;
    // Fiche artiste : « année · type » au lieu de « artiste · année »
    byType?: boolean;
    onOpen: (album: AlbumSearchResult) => void;
}

export const WebAlbumCard = ({ album, byType, onOpen }: WebAlbumCardProps) => {
    const recordType = 'record_type' in album ? RECORD_TYPE_LABEL[album.record_type] : null;
    const sub = byType
        ? [album.year, recordType].filter(Boolean).join(' · ')
        : [album.artist, album.year].filter(Boolean).join(' · ');

    // div et non button : la case de sélection (input) ne peut pas vivre dans un bouton
    return (
        <div
            className={clsx(styles.card, styles.selectable)}
            onClick={() => onOpen(album)}
            onKeyDown={(e) => {
                // Ignore les touches destinées à la case de sélection
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onOpen(album);
                }
            }}
            role="button"
            tabIndex={0}
        >
            <div className={styles.cover}>
                {album.cover_url ? (
                    <img alt="" loading="lazy" src={album.cover_url} />
                ) : (
                    <Center h="100%" w="100%">
                        <Text isMuted>—</Text>
                    </Center>
                )}
                {/* Sans identifiant Deezer, l'API ne sait pas lire les pistes : pas sélectionnable */}
                {album.deezer_id ? (
                    <SelectionCheckbox
                        className={styles.coverSelect}
                        entry={{ item: album, kind: 'album' }}
                        selectionKey={albumSelectionKey(album)}
                    />
                ) : null}
            </div>
            <div className={styles.cardTitle}>{album.title}</div>
            <div className={styles.cardSub}>{sub}</div>
        </div>
    );
};
