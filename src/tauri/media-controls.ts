// Pousse le morceau en cours et l'état lecture/pause vers les contrôles média de Windows
// (src-tauri/src/media.rs). Les boutons reviennent par les événements renderer-player-*.
import { invoke } from '@tauri-apps/api/core';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { subscribeCurrentTrack, subscribePlayerStatus, usePlayerStore } from '/@/renderer/store';
import { LibraryItem } from '/@/shared/types/domain-types';
import { PlayerStatus } from '/@/shared/types/types';

const push = () => {
    const state = usePlayerStore.getState();
    const song = state.getCurrentSong();
    const info = {
        album: song?.album ?? '',
        artist: song?.artistName ?? '',
        image: song
            ? (getItemImageUrl({
                  id: song.imageId || undefined,
                  imageUrl: song.imageUrl,
                  itemType: LibraryItem.SONG,
                  type: 'itemCard',
              }) ?? '')
            : '',
        playing: state.player.status === PlayerStatus.PLAYING,
        title: song?.name ?? '',
    };
    invoke('ipc', { args: [info], channel: 'media-update' }).catch((error) =>
        console.error('[media]', error),
    );
};

export const startMediaControls = () => {
    subscribeCurrentTrack(push);
    subscribePlayerStatus(push);
    push();
};
