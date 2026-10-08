import { createRoot } from "react-dom/client";
import { AppProviders, AppRoot } from "@/app";
import { RootErrorFallback } from "@/shared/ui";
import "./index.css";
import { ReactErrorBoundary } from "@yukino.js/sentry/react";
import { init, enablePlugin, isInitialized } from "@yukino.js/sentry";
import {
  PerformancePlugin,
  ScreenRecordPlugin,
  ExposurePlugin,
} from "@yukino.js/sentry/plugins";

const sentryDsn = import.meta.env.DEV ? "/sentry" : "/path/to/server/dsn";

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
if (!import.meta.hot?.data?.__sentry_ready__) {
  init({
    dsn: sentryDsn,
    projectId: "yukino-codegen",
    debug: import.meta.env.DEV,
    beforeSend: (data) => (import.meta.env.PROD ? false : data),
  });
  if (isInitialized()) {
    enablePlugin(
      new PerformancePlugin(),
      new ScreenRecordPlugin(),
      new ExposurePlugin(),
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (import.meta.hot?.data?.__sentry_ready__) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    import.meta.hot.data.__sentry_ready__ = true;
  }
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <ReactErrorBoundary
      fallback={(error) => <RootErrorFallback error={error} />}
    >
      <AppProviders>
        <AppRoot />
      </AppProviders>
    </ReactErrorBoundary>,
  );
}
