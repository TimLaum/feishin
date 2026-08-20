import { DownloadsContent } from '/@/renderer/features/offline/components/downloads-content';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';

const DownloadsRoute = () => {
    return (
        <AnimatedPage>
            <DownloadsContent />
        </AnimatedPage>
    );
};

const DownloadsRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <DownloadsRoute />
        </PageErrorBoundary>
    );
};

export default DownloadsRouteWithBoundary;
