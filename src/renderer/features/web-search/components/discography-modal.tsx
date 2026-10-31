import { Modal } from '@mantine/core';
import { useState } from 'react';

import { ArtistDetail, plural, RecordType } from '../api';
import { useStartBatch } from '../hooks/use-batches';

import { Button } from '/@/shared/components/button/button';
import { Checkbox } from '/@/shared/components/checkbox/checkbox';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

const GROUPS: {
    defaultOn: boolean;
    key: 'albums' | 'compilations' | 'singles';
    label: string;
    types: RecordType[];
}[] = [
    { defaultOn: true, key: 'albums', label: 'Albums', types: ['album'] },
    { defaultOn: true, key: 'singles', label: 'Singles et EP', types: ['single', 'ep'] },
    { defaultOn: false, key: 'compilations', label: 'Compilations', types: ['compile'] },
];

// Au-delà, prévenir que le lot peut durer des heures.
const BIG_CATALOGUE = 40;

interface DiscographyModalProps {
    artist: ArtistDetail;
    onClose: () => void;
    opened: boolean;
}

/** « Tout télécharger » : choix des types de sorties, puis lot déplié et dédoublonné par le serveur. */
export const DiscographyModal = ({ artist, onClose, opened }: DiscographyModalProps) => {
    const startBatch = useStartBatch();
    const groups = GROUPS.filter((g) => artist[g.key].length > 0);
    const [checked, setChecked] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(GROUPS.map((g) => [g.key, g.defaultOn])),
    );
    const [skipInstrumentals, setSkipInstrumentals] = useState(true);
    const [isStarting, setIsStarting] = useState(false);

    const selected = groups.filter((g) => checked[g.key]);
    const count = selected.reduce((sum, g) => sum + artist[g.key].length, 0);

    const handleStart = async () => {
        setIsStarting(true);
        const res = await startBatch({
            artist_id: artist.deezer_id,
            name: `Discographie — ${artist.name}`,
            record_types: selected.flatMap((g) => g.types),
            skip_instrumentals: skipInstrumentals,
        });
        setIsStarting(false);
        if (res) onClose();
    };

    return (
        <Modal onClose={onClose} opened={opened} title={`Tout télécharger — ${artist.name}`}>
            <Stack gap="sm">
                {groups.map((g) => (
                    <Group justify="space-between" key={g.key}>
                        <Checkbox
                            checked={checked[g.key]}
                            label={g.label}
                            onChange={(e) =>
                                setChecked((prev) => ({
                                    ...prev,
                                    [g.key]: e.currentTarget.checked,
                                }))
                            }
                        />
                        <Text isMuted size="sm">
                            {artist[g.key].length}
                        </Text>
                    </Group>
                ))}
                <Checkbox
                    checked={skipInstrumentals}
                    label="Sans les versions instrumentales et a cappella"
                    onChange={(e) => setSkipInstrumentals(e.currentTarget.checked)}
                    size="xs"
                />
                <Text isMuted size="xs">
                    Un morceau sorti en single puis sur l’album n’est téléchargé qu’une fois, et ce
                    qui est déjà dans la bibliothèque est sauté.
                </Text>
                {count > BIG_CATALOGUE && (
                    <Text size="xs" style={{ color: 'var(--mantine-color-yellow-6)' }}>
                        Gros catalogue : ça peut prendre plusieurs heures. Annulable à tout moment
                        depuis Web Search › Téléchargements.
                    </Text>
                )}
                <Group justify="flex-end">
                    <Button onClick={onClose} variant="default">
                        Annuler
                    </Button>
                    <Button
                        disabled={!count}
                        loading={isStarting}
                        onClick={handleStart}
                        variant="filled"
                    >
                        {count ? `Télécharger ${plural(count, 'sortie')}` : 'Rien de coché'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
