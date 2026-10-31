import { useParams } from 'react-router';

import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { ArtistDetailContent } from '/@/renderer/features/web-search/components/artist-detail-content';

const WebSearchArtistRoute = () => {
    const { artistId } = useParams<{ artistId: string }>();

    return (
        <AnimatedPage>
            {/* key : repart de zéro (top replié, aperçu coupé) en passant d'un artiste à l'autre */}
            <ArtistDetailContent artistId={Number(artistId)} key={artistId} />
        </AnimatedPage>
    );
};

const WebSearchArtistRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <WebSearchArtistRoute />
        </PageErrorBoundary>
    );
};

export default WebSearchArtistRouteWithBoundary;
