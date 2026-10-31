import { RiArrowRightSLine } from 'react-icons/ri';

import { ArtistResult, formatFans } from '../api';
import { useOpenArtist } from '../hooks/use-open-artist';

import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

export const ArtistRow = ({ artist }: { artist: ArtistResult }) => {
    const openArtist = useOpenArtist();

    return (
        <Group
            gap="md"
            onClick={() => openArtist(artist)}
            style={{
                borderBottom: '1px solid var(--theme-colors-border)',
                cursor: 'pointer',
                padding: '10px 16px',
            }}
            wrap="nowrap"
        >
            <div
                style={{
                    background: 'var(--theme-colors-surface)',
                    borderRadius: '50%',
                    flexShrink: 0,
                    height: 48,
                    overflow: 'hidden',
                    width: 48,
                }}
            >
                {artist.picture_url ? (
                    <img
                        alt=""
                        loading="lazy"
                        src={artist.picture_url}
                        style={{ height: '100%', objectFit: 'cover', width: '100%' }}
                    />
                ) : (
                    <Center h="100%" w="100%">
                        <Text isMuted size="xs">
                            —
                        </Text>
                    </Center>
                )}
            </div>
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text fw={500} truncate>
                    {artist.name}
                </Text>
                <Text isMuted size="xs">
                    {[
                        'Artiste',
                        formatFans(artist.nb_fans),
                        artist.nb_albums ? `${artist.nb_albums} sorties` : null,
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </Text>
            </Stack>
            <RiArrowRightSLine color="var(--theme-colors-foreground-muted)" size={20} />
        </Group>
    );
};
