/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ViteHotContext {
  readonly data: {
    __sentry_ready__?: boolean;
  };
}
