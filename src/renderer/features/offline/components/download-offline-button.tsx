import { useTranslation } from 'react-i18next';

import { OfflineDownloadToggle } from '/@/renderer/features/offline/components/offline-download-toggle';
import { FAVORITES_ITEM_ID } from '/@/renderer/features/offline/store/offline-store';

/**
 * Bouton d'en-tête de la page Favoris : abonne (ou désabonne) les titres likés
 * au téléchargement hors ligne. Le moteur de synchro récupère ensuite les
 * favoris ajoutés par la suite.
 */
export const DownloadOfflineButton = () => {
    const { t } = useTranslation();

    return (
        <OfflineDownloadToggle
            itemId={FAVORITES_ITEM_ID}
            kind="favorites"
            name={t('page.favorites.title')}
            size="md"
            variant="subtle"
        />
    );
};
