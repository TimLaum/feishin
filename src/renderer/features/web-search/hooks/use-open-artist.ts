import { useCallback } from 'react';
import { generatePath, useNavigate } from 'react-router';

import { findArtistByName } from '../api';

import { AppRoute } from '/@/renderer/router/routes';
import { toast } from '/@/shared/components/toast/toast';

export const webSearchArtistPath = (deezerId: number) =>
    generatePath(AppRoute.WEB_SEARCH_ARTIST, { artistId: String(deezerId) });

/** Ouvre la fiche d'un artiste ; sans identifiant Deezer, le retrouve par son nom. */
export const useOpenArtist = () => {
    const navigate = useNavigate();

    return useCallback(
        async (artist: { deezer_id?: null | number; name: string }) => {
            if (artist.deezer_id) {
                navigate(webSearchArtistPath(artist.deezer_id));
                return;
            }
            try {
                const found = await findArtistByName(artist.name);
                if (found?.deezer_id) navigate(webSearchArtistPath(found.deezer_id));
                else toast.warn({ message: `Artiste introuvable : ${artist.name}` });
            } catch (err) {
                toast.error({
                    message: err instanceof Error ? err.message : 'Recherche d’artiste impossible',
                });
            }
        },
        [navigate],
    );
};
