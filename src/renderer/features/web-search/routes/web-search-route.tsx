import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { WebSearchContent } from '/@/renderer/features/web-search/components/web-search-content';

const WebSearchRoute = () => {
    return (
        <AnimatedPage>
            <WebSearchContent />
        </AnimatedPage>
    );
};

const WebSearchRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <WebSearchRoute />
        </PageErrorBoundary>
    );
};

export default WebSearchRouteWithBoundary;
