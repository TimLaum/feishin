import { NewReleasesContent } from '/@/renderer/features/new-releases/components/new-releases-content';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';

const NewReleasesRoute = () => {
    return (
        <AnimatedPage>
            <NewReleasesContent />
        </AnimatedPage>
    );
};

const NewReleasesRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <NewReleasesRoute />
        </PageErrorBoundary>
    );
};

export default NewReleasesRouteWithBoundary;
