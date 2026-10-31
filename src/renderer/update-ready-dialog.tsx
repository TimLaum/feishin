import isElectron from 'is-electron';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '/@/shared/components/button/button';
import { Dialog } from '/@/shared/components/dialog/dialog';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

// Fork: propose d'installer tout de suite une MAJ déjà téléchargée par le process principal
// (vérifiée toutes les 10 min). Sans action, elle s'installe à la fermeture de l'app.
export const UpdateReadyDialog = () => {
    const { t } = useTranslation();
    const [version, setVersion] = useState<null | string>(null);
    const [dismissedVersion, setDismissedVersion] = useState<null | string>(null);
    const [isInstalling, setIsInstalling] = useState(false);

    useEffect(() => {
        if (!isElectron()) return undefined;

        window.api.utils.getDownloadedUpdate().then((v) => v && setVersion(v));
        return window.api.utils.rendererUpdateDownloaded(setVersion);
    }, []);

    const handleDismiss = () => setDismissedVersion(version);

    const handleInstall = () => {
        setIsInstalling(true);
        window.api.utils.installUpdate();
    };

    return (
        <Dialog
            onClose={handleDismiss}
            opened={!!version && version !== dismissedVersion}
            position={{ bottom: 100, right: 12 }}
            radius="md"
            size="lg"
            withCloseButton
        >
            <Stack gap="md">
                <Text fw={700} size="md">
                    {t('common.updateReady', { version })}
                </Text>
                <Group justify="flex-end">
                    <Button onClick={handleDismiss} size="xs" variant="default">
                        {t('common.later')}
                    </Button>
                    <Button
                        loading={isInstalling}
                        onClick={handleInstall}
                        size="xs"
                        variant="filled"
                    >
                        {t('common.updateNow')}
                    </Button>
                </Group>
            </Stack>
        </Dialog>
    );
};
