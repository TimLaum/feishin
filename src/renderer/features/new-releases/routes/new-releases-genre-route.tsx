import { GenreDetailContent } from '/@/renderer/features/new-releases/components/genre-detail-content';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';

const NewReleasesGenreRoute = () => {
    return (
        <AnimatedPage>
            <GenreDetailContent />
        </AnimatedPage>
    );
};

const NewReleasesGenreRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <NewReleasesGenreRoute />
        </PageErrorBoundary>
    );
};

export default NewReleasesGenreRouteWithBoundary;
