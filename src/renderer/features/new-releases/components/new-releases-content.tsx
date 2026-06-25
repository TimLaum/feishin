import { Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import styles from './new-releases.module.css';

import {
    DAYS_OPTIONS,
    fetchNewReleases,
    LIMIT_OPTIONS,
    NewReleaseGenreGroup,
    pickGenreCover,
} from '/@/renderer/features/new-releases/api';
import { useNewReleasesStore } from '/@/renderer/features/new-releases/store';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { Stack } from '/@/shared/components/stack/stack';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';

interface GenreCardProps {
    group: NewReleaseGenreGroup;
    onOpen: (genreId: number) => void;
}

const GenreCard = ({ group, onOpen }: GenreCardProps) => {
    const cover = pickGenreCover(group);
    return (
        <button className={styles.card} onClick={() => onOpen(group.genre_id)} type="button">
            <div className={styles.cover}>
                {cover ? (
                    <img alt={group.genre} src={cover} />
                ) : (
                    <Center h="100%" w="100%">
                        <Text isMuted>—</Text>
                    </Center>
                )}
                <div className={styles.genreOverlay}>
                    <span className={styles.genreName}>{group.genre}</span>
                    <span className={styles.genreCount}>{group.count} releases</span>
                </div>
            </div>
        </button>
    );
};

export const NewReleasesContent = () => {
    const navigate = useNavigate();
    const days = useNewReleasesStore((s) => s.days);
    const limitPerGenre = useNewReleasesStore((s) => s.limitPerGenre);
    const setDays = useNewReleasesStore((s) => s.setDays);
    const setLimitPerGenre = useNewReleasesStore((s) => s.setLimitPerGenre);

    const { data, error, isError, isFetching } = useQuery({
        queryFn: () => fetchNewReleases(days, limitPerGenre),
        queryKey: ['new-releases', days, limitPerGenre],
        retry: 1,
        staleTime: 5 * 60_000,
    });

    const groups = data ?? [];

    return (
        <Stack gap={0} style={{ height: '100%' }}>
            <div
                style={{
                    borderBottom: '1px solid var(--theme-colors-border)',
                    padding: '16px 20px',
                }}
            >
                <Group align="center" gap="md" mb="sm">
                    <TextTitle order={3}>New Releases</TextTitle>
                    <Text isMuted size="sm">
                        By genre
                    </Text>
                </Group>
                <Group gap="sm">
                    <Select
                        allowDeselect={false}
                        data={DAYS_OPTIONS}
                        label="Window"
                        onChange={(v) => v && setDays(Number(v))}
                        size="xs"
                        style={{ width: 120 }}
                        value={String(days)}
                    />
                    <Select
                        allowDeselect={false}
                        data={LIMIT_OPTIONS}
                        label="Per genre"
                        onChange={(v) => v && setLimitPerGenre(Number(v))}
                        size="xs"
                        style={{ width: 100 }}
                        value={String(limitPerGenre)}
                    />
                </Group>
            </div>

            <ScrollArea style={{ flex: 1 }}>
                {isFetching && groups.length === 0 && (
                    <Center h={200}>
                        <Text isMuted>Loading new releases…</Text>
                    </Center>
                )}
                {isError && (
                    <Center h={200}>
                        <Text style={{ color: 'var(--mantine-color-red-6)' }}>
                            {error instanceof Error ? error.message : 'Failed to load new releases'}
                        </Text>
                    </Center>
                )}
                {!isFetching && !isError && groups.length === 0 && (
                    <Center h={200}>
                        <Text isMuted>No new releases found</Text>
                    </Center>
                )}

                {groups.length > 0 && (
                    <div className={styles.grid}>
                        {groups.map((group) => (
                            <GenreCard
                                group={group}
                                key={group.genre_id}
                                onOpen={(id) => navigate(`/new-releases/${id}`)}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </Stack>
    );
};
