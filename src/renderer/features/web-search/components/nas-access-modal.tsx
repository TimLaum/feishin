import { Modal } from '@mantine/core';
import { useState } from 'react';

import { resetNasRoute, testRemoteAccess } from '../nas-fetch';
import { useNasAccessStore } from '../store/nas-access-store';

import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { PasswordInput } from '/@/shared/components/password-input/password-input';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { Text } from '/@/shared/components/text/text';

const ROUTE_LABEL = {
    lan: 'réseau local',
    public: 'accès distant',
} as const;

interface NasAccessModalProps {
    onClose: () => void;
    opened: boolean;
}

const NasAccessForm = ({ onClose }: { onClose: () => void }) => {
    const access = useNasAccessStore();
    const [publicUrl, setPublicUrl] = useState(access.publicUrl);
    const [token, setToken] = useState(access.token);
    const [testResult, setTestResult] = useState<null | string>(null);
    const [isTesting, setIsTesting] = useState(false);

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(await testRemoteAccess(publicUrl, token));
        setIsTesting(false);
    };

    const handleSave = () => {
        access.setAccess({ publicUrl, token });
        resetNasRoute();
        onClose();
    };

    return (
        <Stack gap="sm">
            <Text isMuted size="sm">
                Hors du réseau local, Web Search passe par l’adresse publique de l’API musique, avec
                un jeton. Pour l’obtenir :{' '}
                <code>ssh nas sudo cat /volume2/music/.feishin_token</code>
            </Text>
            <TextInput
                label="Adresse publique"
                onChange={(e) => setPublicUrl(e.currentTarget.value)}
                value={publicUrl}
            />
            <PasswordInput
                label="Jeton"
                onChange={(e) => setToken(e.currentTarget.value)}
                value={token}
            />
            <Text isMuted size="xs">
                Actuellement : {access.route ? ROUTE_LABEL[access.route] : 'pas encore utilisé'}. La
                suppression de fichiers reste réservée au réseau local.
            </Text>
            {testResult && (
                <Text
                    size="sm"
                    style={{
                        color:
                            testResult === 'ok'
                                ? 'var(--mantine-color-green-6)'
                                : 'var(--mantine-color-red-6)',
                    }}
                >
                    {testResult === 'ok' ? 'Accès distant fonctionnel' : testResult}
                </Text>
            )}
            <Group justify="flex-end">
                <Button
                    disabled={!publicUrl || !token}
                    loading={isTesting}
                    onClick={handleTest}
                    variant="default"
                >
                    Tester
                </Button>
                <Button onClick={handleSave} variant="filled">
                    Enregistrer
                </Button>
            </Group>
        </Stack>
    );
};

export const NasAccessModal = ({ onClose, opened }: NasAccessModalProps) => (
    <Modal onClose={onClose} opened={opened} title="Accès distant à l’API musique">
        {opened && <NasAccessForm onClose={onClose} />}
    </Modal>
);
