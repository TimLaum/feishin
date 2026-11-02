import { closeAllModals, openModal } from '@mantine/modals';
import isElectron from 'is-electron';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfflineStoreBase } from '/@/renderer/features/offline/store/offline-store';
import {
    SettingOption,
    SettingsSection,
} from '/@/renderer/features/settings/components/settings-section';
import { formatSizeString } from '/@/renderer/utils/format';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { ConfirmModal } from '/@/shared/components/modal/modal';
import { Select } from '/@/shared/components/select/select';
import { Switch } from '/@/shared/components/switch/switch';
import { Text } from '/@/shared/components/text/text';

const offlineApi = isElectron() ? window.api.offlineDownloads : null;

const GIGABYTE = 1024 ** 3;

/**
 * Réglages des téléchargements hors connexion (ex-onglet Téléchargements) :
 * on télécharge depuis une playlist, un album ou les favoris, et on gère ici
 * la qualité, la place prise et le mode hors connexion forcé.
 */
export const OfflineSettings = memo(() => {
    const { t } = useTranslation();
    const settings = useOfflineStoreBase((s) => s.settings);
    const offlineMode = useOfflineStoreBase((s) => s.offlineMode);
    const entries = useOfflineStoreBase((s) => s.entries);
    const { removeAll, setOfflineMode, setSettings } = useOfflineStoreBase.getState();

    const { count, size } = useMemo(() => {
        const done = Object.values(entries).filter((entry) => entry.status === 'done');
        return {
            count: done.length,
            size: done.reduce((total, entry) => total + (entry.size || 0), 0),
        };
    }, [entries]);

    const handleClearAll = () =>
        openModal({
            children: (
                <ConfirmModal
                    labels={{ cancel: t('common.cancel'), confirm: t('common.confirm') }}
                    onCancel={() => closeAllModals()}
                    onConfirm={() => {
                        closeAllModals();
                        removeAll();
                    }}
                >
                    <Text>{t('page.offline.clearAllConfirm')}</Text>
                </ConfirmModal>
            ),
            title: t('page.offline.clearAll'),
        });

    const options: SettingOption[] = [
        {
            control: (
                <Switch
                    aria-label={t('page.offline.offlineMode')}
                    checked={offlineMode}
                    onChange={(event) => setOfflineMode(event.currentTarget.checked)}
                />
            ),
            description: t('page.offline.offlineModeDescription'),
            title: t('page.offline.offlineMode'),
        },
        {
            control: (
                <Select
                    data={[
                        { label: t('page.offline.downloadQuality_original'), value: 'original' },
                        {
                            label: t('page.offline.downloadQuality_transcoded', {
                                bitrate: settings.bitrate,
                                format: settings.format,
                            }),
                            value: 'transcoded',
                        },
                    ]}
                    onChange={(value) =>
                        value && setSettings({ quality: value as 'original' | 'transcoded' })
                    }
                    value={settings.quality}
                    width={260}
                />
            ),
            description: t('page.offline.downloadQualityDescription'),
            title: t('page.offline.downloadQuality'),
        },
        {
            control: (
                <Group gap="xs" wrap="nowrap">
                    <Select
                        data={['128', '192', '256', '320'].map((value) => ({
                            label: `${value} kbps`,
                            value,
                        }))}
                        onChange={(value) => value && setSettings({ bitrate: Number(value) })}
                        value={String(settings.bitrate)}
                        width={120}
                    />
                    <Select
                        data={['mp3', 'opus', 'aac'].map((value) => ({ label: value, value }))}
                        onChange={(value) => value && setSettings({ format: value })}
                        value={settings.format}
                        width={100}
                    />
                </Group>
            ),
            description: '',
            indent: true,
            isHidden: settings.quality !== 'transcoded',
            title: t('page.offline.transcodeFormat'),
        },
        {
            control: (
                <Select
                    data={[
                        { label: t('page.offline.maxSize_unlimited'), value: '0' },
                        ...[5, 10, 20, 50, 100].map((gb) => ({
                            label: `${gb} GB`,
                            value: String(gb * GIGABYTE),
                        })),
                    ]}
                    onChange={(value) => value && setSettings({ maxSizeBytes: Number(value) })}
                    value={String(settings.maxSizeBytes)}
                    width={160}
                />
            ),
            description: t('page.offline.maxSizeDescription'),
            title: t('page.offline.maxSize'),
        },
        {
            control: (
                <Group gap="xs" wrap="nowrap">
                    <Button onClick={() => offlineApi?.openFolder()} variant="default">
                        {t('page.offline.openFolder')}
                    </Button>
                    <Button disabled={count === 0} onClick={handleClearAll} variant="default">
                        {t('page.offline.clearAll')}
                    </Button>
                </Group>
            ),
            description: t('page.offline.storageSummary', {
                count,
                size: formatSizeString(size),
            }),
            title: t('page.offline.storage'),
        },
    ];

    if (!offlineApi) return null;

    return <SettingsSection options={options} title={t('page.offline.title')} />;
});
