/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GA4 Measurement ID ("G-…"). Leave unset to disable analytics. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
