import clsx from 'clsx';
import isElectron from 'is-electron';

import styles from './default-layout.module.css';

import { ContextMenuController } from '/@/renderer/features/context-menu/context-menu-controller';
import { OfflineDownloadManager } from '/@/renderer/features/offline/components/offline-download-manager';
import { OfflineModeEffect } from '/@/renderer/features/offline/components/offline-mode-effect';
import { OfflineSyncManager } from '/@/renderer/features/offline/components/offline-sync-manager';
import { OfflineAutoSkipHook } from '/@/renderer/features/offline/hooks/use-offline-auto-skip';
import { BatchManager } from '/@/renderer/features/web-search/components/batch-manager';
import { DownloadManager } from '/@/renderer/features/web-search/components/download-manager';
import { PlaylistImportManager } from '/@/renderer/features/web-search/components/playlist-import-manager';
import { SelectionBar } from '/@/renderer/features/web-search/components/selection-bar';
import { SimilarDrawer } from '/@/renderer/features/web-search/components/similar-drawer';
import { MainContent } from '/@/renderer/layouts/default-layout/main-content';
import { PlayerBar } from '/@/renderer/layouts/default-layout/player-bar';
import { WindowBar } from '/@/renderer/layouts/window-bar';
import { useSettingsStore, useWindowBarStyle } from '/@/renderer/store/settings.store';
import { Platform, PlayerType } from '/@/shared/types/types';

if (!isElectron()) {
    useSettingsStore.getState().actions.setSettings({
        playback: {
            type: PlayerType.WEB,
        },
    });
}

interface DefaultLayoutProps {
    shell?: boolean;
}

export const DefaultLayout = ({ shell }: DefaultLayoutProps) => {
    const windowBarStyle = useWindowBarStyle();

    return (
        <>
            <div
                className={clsx(styles.layout, {
                    [styles.macos]: windowBarStyle === Platform.MACOS,
                    [styles.windows]: windowBarStyle === Platform.WINDOWS,
                })}
                id="default-layout"
            >
                <WindowBar />
                <MainContent shell={shell} />
                <PlayerBar />
            </div>
            <ContextMenuController.Root />
            <DownloadManager />
            <BatchManager />
            <SelectionBar />
            <PlaylistImportManager />
            <SimilarDrawer />
            <OfflineDownloadManager />
            <OfflineSyncManager />
            <OfflineModeEffect />
            <OfflineAutoSkipHook />
        </>
    );
};
